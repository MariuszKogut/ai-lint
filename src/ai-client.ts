import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, type LanguageModelV1, Output } from 'ai'
import { z } from 'zod'
import type { LintJob, LintResult, Model } from './types.js'

function getOpenRouter() {
  return createOpenRouter({ apiKey: process.env.OPEN_ROUTER_KEY })
}

const MODEL_MAP: Record<Model, string> = {
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

export class AIClient {
  constructor(private defaultModel: Model) {}

  async lint(job: LintJob): Promise<LintResult> {
    const startTime = Date.now()
    const model = job.rule.model ?? this.defaultModel
    const modelId = MODEL_MAP[model]

    const ext = job.filePath.split('.').pop() || 'txt'

    const userMessage = `## Rule: ${job.rule.name}
${job.rule.prompt}

## File: ${job.filePath}
\`\`\`${ext}
${job.fileContent}
\`\`\``

    try {
      const response = await this.callApiWithRetry(getOpenRouter()(modelId), userMessage)
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
        error instanceof Error &&
        (error.message.includes('401') ||
          error.message.includes('Unauthorized') ||
          error.message.includes('API key'))
      ) {
        throw new Error('OPEN_ROUTER_KEY is invalid or missing')
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
    model: LanguageModelV1,
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
        maxTokens: 1024,
      })

      if (!output) {
        throw new Error('AI response was not valid JSON')
      }

      return output
    } catch (error) {
      const isRetryable =
        error instanceof Error &&
        (/429|rate.limit/i.test(error.message) || /5\d{2}|server.error/i.test(error.message))

      if (isRetryable && attempt < 3) {
        const delayMs = 1000 * 2 ** (attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return this.callApiWithRetry(model, userMessage, attempt + 1)
      }

      throw error
    }
  }
}
