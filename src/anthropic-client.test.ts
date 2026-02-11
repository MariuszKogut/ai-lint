import Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnthropicClient } from './anthropic-client.js'
import type { LintJob } from './types.js'

// Mock the Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropicClass = vi.fn()
  MockAnthropicClass.prototype.messages = {
    create: vi.fn(),
  }

  // Mock error classes
  class AuthenticationError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'AuthenticationError'
    }
  }

  class RateLimitError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'RateLimitError'
    }
  }

  class InternalServerError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'InternalServerError'
    }
  }

  return {
    default: Object.assign(MockAnthropicClass, {
      AuthenticationError,
      RateLimitError,
      InternalServerError,
    }),
  }
})

describe('AnthropicClient', () => {
  let client: AnthropicClient
  let mockCreate: ReturnType<typeof vi.fn>

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
    // Get the mock create function
    const MockedAnthropic = Anthropic as unknown as {
      prototype: { messages: { create: ReturnType<typeof vi.fn> } }
    }
    mockCreate = MockedAnthropic.prototype.messages.create
  })

  it('should return correct LintResult on valid JSON response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            pass: true,
            message: 'File complies with the rule',
            line: null,
          }),
        },
      ],
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
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            pass: true,
            message: 'All good',
            line: null,
          }),
        },
      ],
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(true)
    expect(result.message).toBe('All good')
  })

  it('should return pass=false with line number when violation found', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            pass: false,
            message: 'Found console.log on line 1',
            line: 1,
          }),
        },
      ],
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(false)
    expect(result.message).toBe('Found console.log on line 1')
    expect(result.line).toBe(1)
  })

  it('should return pass=false with error message on invalid JSON response', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'This is not valid JSON',
        },
      ],
    })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(false)
    expect(result.message).toBe('AI response was not valid JSON')
  })

  it('should retry on rate limit (429) and succeed on 2nd attempt', async () => {
    // First call fails with rate limit
    mockCreate
      .mockRejectedValueOnce(new Anthropic.RateLimitError('Rate limited'))
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pass: true,
              message: 'Success after retry',
              line: null,
            }),
          },
        ],
      })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(true)
    expect(result.message).toBe('Success after retry')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('should retry on server error (500) and succeed on 2nd attempt', async () => {
    // First call fails with server error
    mockCreate
      .mockRejectedValueOnce(new Anthropic.InternalServerError('Internal server error'))
      .mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pass: true,
              message: 'Success after retry',
              line: null,
            }),
          },
        ],
      })

    const job = createMockJob()
    const result = await client.lint(job)

    expect(result.pass).toBe(true)
    expect(result.message).toBe('Success after retry')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('should throw error when all retries exhausted', async () => {
    // All attempts fail
    mockCreate.mockRejectedValue(new Anthropic.RateLimitError('Rate limited'))

    const job = createMockJob()
    const result = await client.lint(job)

    // Since we catch all errors except auth errors, it should return a failed result
    expect(result.pass).toBe(false)
    expect(result.message).toContain('Rate limited')
    expect(mockCreate).toHaveBeenCalledTimes(3) // Original + 2 retries
  })

  it('should use rule model override over default model', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            pass: true,
            message: 'OK',
            line: null,
          }),
        },
      ],
    })

    const job = createMockJob({
      rule: {
        id: 'test_rule',
        name: 'Test Rule',
        severity: 'error',
        glob: '**/*.ts',
        prompt: 'Check the file',
        model: 'opus', // Override default
      },
    })

    await client.lint(job)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-opus-4-6', // Should use opus, not haiku
      }),
    )
  })

  it('should throw error on authentication failure (401)', async () => {
    mockCreate.mockRejectedValue(new Anthropic.AuthenticationError('Invalid API key'))

    const job = createMockJob()

    await expect(client.lint(job)).rejects.toThrow('ANTHROPIC_API_KEY is invalid or missing')
  })

  it('should use correct model mapping for haiku', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ pass: true, message: 'OK', line: null }),
        },
      ],
    })

    const job = createMockJob()
    await client.lint(job)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
      }),
    )
  })

  it('should use correct model mapping for sonnet', async () => {
    client = new AnthropicClient('sonnet')
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ pass: true, message: 'OK', line: null }),
        },
      ],
    })

    const job = createMockJob()
    await client.lint(job)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-4-5-20250929',
      }),
    )
  })

  it('should use correct API parameters', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ pass: true, message: 'OK', line: null }),
        },
      ],
    })

    const job = createMockJob()
    await client.lint(job)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 1024,
        temperature: 0,
        system: expect.stringContaining('You are a code linter'),
      }),
    )
  })

  it('should include rule name and prompt in user message', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({ pass: true, message: 'OK', line: null }),
        },
      ],
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

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('Custom Rule Name'),
          },
        ],
      }),
    )

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('This is a custom prompt'),
          },
        ],
      }),
    )
  })
})
