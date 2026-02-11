import Anthropic from '@anthropic-ai/sdk'
import type { LintJob, LintResult, Model } from './types.js'

const MODEL_MAP: Record<Model, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-5-20250929',
  opus: 'claude-opus-4-6',
}

const SYSTEM_PROMPT = `You are a code linter. Analyze the given file against the provided rule.
Respond ONLY with a valid JSON object, no additional text.
Format: { "pass": boolean, "message": string, "line": number | null }
- "pass": true if the file complies with the rule, false otherwise
- "message": brief explanation (1-3 sentences). If pass=true, confirm compliance.
  If pass=false, describe the violation.
- "line": approximate line number of the first violation, or null`

interface ApiResponse {
  pass: boolean
  message: string
  line: number | null
}

export class AnthropicClient {
  private client: Anthropic

  constructor(private defaultModel: Model) {
    this.client = new Anthropic()
  }

  async lint(job: LintJob): Promise<LintResult> {
    const startTime = Date.now()
    const model = job.rule.model ?? this.defaultModel
    const modelId = MODEL_MAP[model]

    // Extract file extension for syntax highlighting in prompt
    const ext = job.filePath.split('.').pop() || 'txt'

    const userMessage = `## Rule: ${job.rule.name}
${job.rule.prompt}

## File: ${job.filePath}
\`\`\`${ext}
${job.fileContent}
\`\`\``

    try {
      const response = await this.callApiWithRetry(modelId, userMessage)
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

      // Check for authentication errors
      if (
        error instanceof Anthropic.AuthenticationError ||
        (error instanceof Error && error.message.includes('401'))
      ) {
        throw new Error('ANTHROPIC_API_KEY is invalid or missing')
      }

      // For other errors, return a failed result
      return {
        rule_id: job.rule.id,
        rule_name: job.rule.name,
        file: job.filePath,
        severity: job.rule.severity,
        pass: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        duration_ms: durationMs,
        cached: false,
      }
    }
  }

  private async callApiWithRetry(
    modelId: string,
    userMessage: string,
    attempt = 1,
  ): Promise<ApiResponse> {
    try {
      const response = await this.client.messages.create({
        model: modelId,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      })

      // Extract text content from response
      const textContent = response.content.find((block) => block.type === 'text')
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in API response')
      }

      // Parse JSON response
      try {
        const parsed = JSON.parse(textContent.text) as ApiResponse
        return parsed
      } catch {
        throw new Error('AI response was not valid JSON')
      }
    } catch (error) {
      // Handle rate limiting and server errors with retry
      const isRateLimited =
        error instanceof Anthropic.RateLimitError ||
        (error instanceof Error && error.message.includes('429'))

      const isServerError =
        error instanceof Anthropic.InternalServerError ||
        (error instanceof Error && /5\d{2}/.test(error.message)) // 500-599

      if ((isRateLimited || isServerError) && attempt < 3) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = 1000 * 2 ** (attempt - 1)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        return this.callApiWithRetry(modelId, userMessage, attempt + 1)
      }

      // Re-throw the error if retries exhausted or other error type
      throw error
    }
  }
}
