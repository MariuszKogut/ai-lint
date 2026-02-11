import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleGenerator } from './rule-generator.js'

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

describe('RuleGenerator', () => {
  let generator: RuleGenerator

  const validRule = {
    id: 'no_console_log',
    name: 'No console.log statements',
    severity: 'error' as const,
    glob: 'src/**/*.ts',
    prompt: 'Check that the file does not contain console.log statements.',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    generator = new RuleGenerator()
  })

  it('should generate a valid rule from description', async () => {
    mockGenerateText.mockResolvedValue({ output: validRule })

    const result = await generator.generate('Forbid console.log in TypeScript files')

    expect(result).toEqual(validRule)
    expect(result.id).toBe('no_console_log')
    expect(result.name).toBe('No console.log statements')
    expect(result.severity).toBe('error')
    expect(result.glob).toBe('src/**/*.ts')
    expect(result.prompt).toBeTruthy()
  })

  it('should throw error when AI returns null output', async () => {
    mockGenerateText.mockResolvedValue({ output: null })

    await expect(generator.generate('Some rule')).rejects.toThrow('AI returned no valid response')
  })

  it('should auto-fix rule when schema validation fails and retry succeeds', async () => {
    const invalidRule = {
      id: 'NoConsoleLog', // Invalid: uppercase
      name: 'No console.log',
      severity: 'error' as const,
      glob: 'src/**/*.ts',
      prompt: 'Check for console.log',
    }

    mockGenerateText
      .mockResolvedValueOnce({ output: invalidRule })
      .mockResolvedValueOnce({ output: validRule })

    const result = await generator.generate('Forbid console.log')

    expect(result).toEqual(validRule)
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  it('should throw when fix attempt also fails validation', async () => {
    const invalidRule = {
      id: 'INVALID',
      name: 'Bad Rule',
      severity: 'error' as const,
      glob: 'src/**/*.ts',
      prompt: 'Check something',
    }

    mockGenerateText
      .mockResolvedValueOnce({ output: invalidRule })
      .mockResolvedValueOnce({ output: invalidRule })

    await expect(generator.generate('Some rule')).rejects.toThrow(
      'Generated rule failed schema validation after fix attempt',
    )
  })

  it('should throw when fix attempt returns null', async () => {
    const invalidRule = {
      id: 'INVALID',
      name: 'Bad Rule',
      severity: 'error' as const,
      glob: 'src/**/*.ts',
      prompt: 'Check something',
    }

    mockGenerateText
      .mockResolvedValueOnce({ output: invalidRule })
      .mockResolvedValueOnce({ output: null })

    await expect(generator.generate('Some rule')).rejects.toThrow(
      'AI returned no valid response during fix attempt',
    )
  })

  it('should generate rule with all required fields', async () => {
    mockGenerateText.mockResolvedValue({ output: validRule })

    const result = await generator.generate('Any description')

    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('name')
    expect(result).toHaveProperty('severity')
    expect(result).toHaveProperty('glob')
    expect(result).toHaveProperty('prompt')
  })

  it('should generate rule with optional exclude field', async () => {
    const ruleWithExclude = {
      ...validRule,
      exclude: 'node_modules/**',
    }
    mockGenerateText.mockResolvedValue({ output: ruleWithExclude })

    const result = await generator.generate('Forbid console.log but skip node_modules')

    expect(result.exclude).toBe('node_modules/**')
  })

  it('should use sonnet model for generation', async () => {
    mockGenerateText.mockResolvedValue({ output: validRule })

    await generator.generate('Any description')

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { modelId: 'anthropic/claude-sonnet-4.5' },
      }),
    )
  })
})
