import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicClient } from './anthropic-client.js'
import type { LintJob } from './types.js'

// Mock the AI SDK
const mockGenerateText = vi.fn()
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  Output: {
    object: vi.fn((opts: unknown) => opts),
  },
}))

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => vi.fn((modelId: string) => ({ modelId }))),
}))

describe('AnthropicClient', () => {
  let client: AnthropicClient

  const createMockJob = (overrides?: Partial<LintJob>): LintJob => ({
    rule: {
      id: 'test_rule',
      name: 'Test Rule',
      severity: 'error',
      glob: '**/*.ts',
      prompt: 'Check if the file is valid',
      ...overrides?.rule,
    },
    filePath: 'src/test.ts',
    fileContent: 'console.log("test")',
    fileHash: 'abc123',
    promptHash: 'def456',
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    client = new AnthropicClient('haiku')
  })

  it('should return correct LintResult on valid JSON response', async () => {
    mockGenerateText.mockResolvedValue({
      output: {
        pass: true,
        message: 'File complies with the rule',
        line: null,
      },
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result).toMatchObject({
      rule_id: 'test_rule',
      rule_name: 'Test Rule',
      file: 'src/test.ts',
      severity: 'error',
      pass: true,
      message: 'File complies with the rule',
      cached: false,
    })
    expect(result.duration_ms).toBeGreaterThanOrEqual(0)
    expect(result.line).toBeUndefined()
  })

  it('should return pass=true when API returns pass=true', async () => {
    mockGenerateText.mockResolvedValue({
      output: {
        pass: true,
        message: 'All good',
        line: null,
      },
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(true)
    expect(result.message).toBe('All good')
  })

  it('should return pass=false with line number when violation found', async () => {
    mockGenerateText.mockResolvedValue({
      output: {
        pass: false,
        message: 'Found console.log on line 1',
        line: 1,
      },
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(false)
    expect(result.message).toBe('Found console.log on line 1')
    expect(result.line).toBe(1)
  })

  it('should return pass=false with error message on null output', async () => {
    mockGenerateText.mockResolvedValue({
      output: null,
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(false)
    expect(result.message).toContain('AI response was not valid JSON')
    expect(result.api_error).toBe(true)
  })

  it('should retry on rate limit (429) and succeed on 2nd attempt', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('429 Rate limited')).mockResolvedValueOnce({
      output: {
        pass: true,
        message: 'Success after retry',
        line: null,
      },
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(true)
    expect(result.message).toBe('Success after retry')
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  it('should retry on server error (500) and succeed on 2nd attempt', async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error('500 Internal server error'))
      .mockResolvedValueOnce({
        output: {
          pass: true,
          message: 'Success after retry',
          line: null,
        },
      })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(true)
    expect(result.message).toBe('Success after retry')
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  it('should throw error when all retries exhausted', async () => {
    mockGenerateText.mockRejectedValue(new Error('429 Rate limited'))

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(false)
    expect(result.message).toContain('Rate limited')
    expect(result.api_error).toBe(true)
    expect(mockGenerateText).toHaveBeenCalledTimes(3)
  })

  it('should use rule model override over default model', async () => {
    mockGenerateText.mockResolvedValue({
      output: {
        pass: true,
        message: 'OK',
        line: null,
      },
    })

    const job = createMockJob({
      rule: {
        id: 'test_rule',
        name: 'Test Rule',
        severity: 'error',
        glob: '**/*.ts',
        prompt: 'Check the file',
        model: 'opus',
      },
    })

    await client.lint(job)

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'anthropic/claude-opus-4.6' },
      }),
    )
  })

  it('should throw error on authentication failure (401)', async () => {
    mockGenerateText.mockRejectedValue(new Error('401 Unauthorized'))

    const job = createMockJob()

    await expect(client.lint(job)).rejects.toThrow('OPEN_ROUTER_KEY is invalid or missing')
  })

  it('should use correct model mapping for haiku', async () => {
    mockGenerateText.mockResolvedValue({
      output: { pass: true, message: 'OK', line: null },
    })

    const job = createMockJob()
    await client.lint(job)

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'anthropic/claude-haiku-4.5' },
      }),
    )
  })

  it('should use correct model mapping for sonnet', async () => {
    client = new AnthropicClient('sonnet')
    mockGenerateText.mockResolvedValue({
      output: { pass: true, message: 'OK', line: null },
    })

    const job = createMockJob()
    await client.lint(job)

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'anthropic/claude-sonnet-4.5' },
      }),
    )
  })

  it('should use correct API parameters', async () => {
    mockGenerateText.mockResolvedValue({
      output: { pass: true, message: 'OK', line: null },
    })

    const job = createMockJob()
    await client.lint(job)

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxTokens: 1024,
        temperature: 0,
        system: expect.stringContaining('You are a code linter'),
      }),
    )
  })

  it('should include rule name and prompt in user message', async () => {
    mockGenerateText.mockResolvedValue({
      output: { pass: true, message: 'OK', line: null },
    })

    const job = createMockJob({
      rule: {
        id: 'custom_rule',
        name: 'Custom Rule Name',
        severity: 'warning',
        glob: '**/*.ts',
        prompt: 'This is a custom prompt',
      },
    })

    await client.lint(job)

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Custom Rule Name'),
      }),
    )

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('This is a custom prompt'),
      }),
    )
  })
})
