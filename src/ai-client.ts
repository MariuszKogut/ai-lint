import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, type LanguageModel, Output } from 'ai'
import { z } from 'zod'
import type { LintJob, LintResult, Model, OpenRouterModel, Provider } from './types.js'

function getOpenRouter() {
  return createOpenRouter({ apiKey: process.env.OPEN_ROUTER_KEY })
}

const MODEL_MAP: Record<OpenRouterModel, string> = {
  'gemini-flash': 'google/gemini-2.5-flash',
  haiku: 'anthropic/claude-haiku-4.5',
  sonnet: 'anthropic/claude-sonnet-4.5',
  opus: 'anthropic/claude-opus-4.6',
}

const SYSTEM_PROMPT = `You are a code linter. Analyze the given file against the provided rule.
- If the file complies, set pass=true and confirm briefly.
- If it violates the rule, set pass=false, describe the violation in 1-3 sentences, and set line to the approximate line number of the first violation.`

const lintResponseSchema = z.object({
  pass: z.boolean(),
  message: z.string(),
  line: z.number().nullable(),
})

const MAX_RETRY_ATTEMPTS = 3
const EMPTY_RESPONSE_ERRORS = new Set(['AI returned no content', 'AI returned empty content'])

interface AIClientOptions {
  provider: Provider
  providerUrl?: string
  defaultModel: Model
}

export class AIClient {
  private provider: Provider
  private providerUrl?: string
  private defaultModel: Model

  constructor(options: AIClientOptions) {
    this.provider = options.provider
    this.providerUrl = options.providerUrl
    this.defaultModel = options.defaultModel
  }

  private resolveModel(modelName: Model): LanguageModel {
    if (this.provider === 'ollama') {
      const ollama = createOpenAICompatible({
        name: 'ollama',
        baseURL: this.providerUrl ?? 'http://localhost:11434/v1',
        supportsStructuredOutputs: true,
      })
      return ollama(modelName)
    }

    const modelId = MODEL_MAP[modelName as OpenRouterModel]
    return getOpenRouter()(modelId)
  }

  async lint(job: LintJob): Promise<LintResult> {
    const startTime = Date.now()
    const modelName = job.rule.model ?? this.defaultModel
    const model = this.resolveModel(modelName)

    const ext = job.filePath.split('.').pop() || 'txt'

    const userMessage = `## Rule: ${job.rule.name}
${job.rule.prompt}

## File: ${job.filePath}
\`\`\`${ext}
${job.fileContent}
\`\`\``

    try {
      const response = await this.callApiWithRetry(model, userMessage)
      const durationMs = Date.now() - startTime

      return {
        rule_id: job.rule.id,
        rule_name: job.rule.name,
        file: job.filePath,
        severity: job.rule.severity,
        pass: response.pass,
        message: response.message,
        line: response.line ?? undefined,
        duration_ms: durationMs,
        cached: false,
      }
    } catch (error) {
      const durationMs = Date.now() - startTime

      if (
        this.provider === 'openrouter' &&
        error instanceof Error &&
        (error.message.includes('401') ||
          error.message.includes('Unauthorized') ||
          error.message.includes('API key'))
      ) {
        throw new Error('OPEN_ROUTER_KEY is invalid or missing')
      }

      if (
        this.provider === 'ollama' &&
        error instanceof Error &&
        (error.message.includes('ECONNREFUSED') || error.message.includes('fetch failed'))
      ) {
        throw new Error(
          `Cannot connect to Ollama at ${this.providerUrl ?? 'http://localhost:11434/v1'}. Is Ollama running?`,
        )
      }

      return {
        rule_id: job.rule.id,
        rule_name: job.rule.name,
        file: job.filePath,
        severity: job.rule.severity,
        pass: false,
        message: `API error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
        duration_ms: durationMs,
        cached: false,
        api_error: true,
      }
    }
  }

  private async callApiWithRetry(
    model: LanguageModel,
    userMessage: string,
    attempt = 1,
  ): Promise<z.infer<typeof lintResponseSchema>> {
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: lintResponseSchema }),
        system: SYSTEM_PROMPT,
        prompt: userMessage,
        temperature: 0,
        maxOutputTokens: 1024,
      })

      if (!output) {
        throw new Error('AI returned no content')
      }

      if (!output.message.trim()) {
        throw new Error('AI returned empty content')
      }

      return output
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const isAuthError =
        /401/.test(message) || /unauthorized/i.test(message) || /api key/i.test(message)
      const isRetryable =
        EMPTY_RESPONSE_ERRORS.has(message) ||
        /429|rate.limit/i.test(message) ||
        /5\d{2}|server.error/i.test(message) ||
        /timeout|timed out|econnreset|econnrefused|enotfound|eai_again|network|fetch failed|socket hang up/i.test(
          message,
        )

      if (!isAuthError && isRetryable && attempt < MAX_RETRY_ATTEMPTS) {
        const delayMs = 1000 * 2 ** (attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return this.callApiWithRetry(model, userMessage, attempt + 1)
      }

      throw error
    }
  }
}
