import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnthropicClient } from './anthropic-client.js'
import type { CacheManager } from './cache-manager.js'
import { LinterEngine, type Reporter } from './linter-engine.js'
import type { RuleMatcher } from './rule-matcher.js'
import type { LintResult, LintRule, LinterConfig } from './types.js'

describe('LinterEngine', () => {
  let mockCache: CacheManager
  let mockClient: AnthropicClient
  let mockMatcher: RuleMatcher
  let mockReporter: Reporter
  let engine: LinterEngine
  let config: LinterConfig

  // Test rules
  const rule1: LintRule = {
    id: 'no_console',
    name: 'No console.log',
    severity: 'error',
    glob: '**/*.ts',
    prompt: 'Check for console.log',
  }

  const rule2: LintRule = {
    id: 'max_length',
    name: 'Max 300 lines',
    severity: 'warning',
    glob: '**/*.ts',
    prompt: 'Check file length',
  }

  beforeEach(() => {
    // Setup config
    config = {
      model: 'haiku',
      concurrency: 5,
      git_base: 'main',
      rules: [rule1, rule2],
    }

    // Mock CacheManager
    mockCache = {
      load: vi.fn(),
      save: vi.fn(),
      lookup: vi.fn().mockReturnValue(null),
      store: vi.fn(),
      clear: vi.fn(),
      status: vi.fn().mockReturnValue({ entries: 0, sizeBytes: 0 }),
    } as unknown as CacheManager

    // Mock AnthropicClient
    mockClient = {
      lint: vi.fn().mockResolvedValue({
        rule_id: 'test',
        rule_name: 'Test Rule',
        file: 'test.ts',
        severity: 'error',
        pass: true,
        message: 'All good',
        duration_ms: 100,
        cached: false,
      }),
    } as unknown as AnthropicClient

    // Mock RuleMatcher
    mockMatcher = {
      matchFile: vi.fn(),
      matchFiles: vi.fn(),
      allGlobs: vi.fn(),
    } as unknown as RuleMatcher

    // Mock Reporter
    mockReporter = {
      report: vi.fn(),
    }

    // Create engine
    engine = new LinterEngine({
      cache: mockCache,
      client: mockClient,
      matcher: mockMatcher,
      reporter: mockReporter,
    })

    // Mock fs.readFileSync
    vi.mock('node:fs', async (importOriginal) => {
      const actual = await importOriginal<typeof import('node:fs')>()
      return {
        ...actual,
        readFileSync: vi.fn().mockReturnValue('file content'),
      }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates correct jobs from files × matching rules', async () => {
    vi.mocked(mockMatcher.matchFile).mockImplementation((filePath) => {
      if (filePath === 'src/file1.ts') return [rule1, rule2]
      if (filePath === 'src/file2.ts') return [rule1]
      return []
    })

    await engine.run(['src/file1.ts', 'src/file2.ts'], config)

    // Should call client.lint for each (file, rule) combination
    // file1.ts × 2 rules + file2.ts × 1 rule = 3 jobs
    expect(mockClient.lint).toHaveBeenCalledTimes(3)
  })

  it('cached jobs are skipped — client.lint not called for them', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule1])

    // Mock cache hit for the first file
    vi.mocked(mockCache.lookup).mockReturnValue({
      rule_id: 'no_console',
      rule_name: 'No console.log',
      file: 'src/file1.ts',
      severity: 'error',
      pass: true,
      message: 'Cached result',
      duration_ms: 50,
      cached: false, // Will be set to true by engine
    })

    await engine.run(['src/file1.ts'], config)

    // Should not call client.lint since result is cached
    expect(mockClient.lint).not.toHaveBeenCalled()

    // Should still call reporter with cached result
    expect(mockReporter.report).toHaveBeenCalled()
    const [[results]] = vi.mocked(mockReporter.report).mock.calls
    expect(results).toHaveLength(1)
    expect(results[0].cached).toBe(true)
  })

  it('uncached jobs call client.lint', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule1])
    vi.mocked(mockCache.lookup).mockReturnValue(null) // Cache miss

    await engine.run(['src/file1.ts'], config)

    // Should call client.lint for uncached job
    expect(mockClient.lint).toHaveBeenCalledTimes(1)
    expect(mockCache.store).toHaveBeenCalledTimes(1)
  })

  it('respects concurrency limit (verify p-limit is used)', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule1])

    const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`)

    // Track concurrent calls
    let currentConcurrent = 0
    let maxConcurrent = 0

    vi.mocked(mockClient.lint).mockImplementation(async () => {
      currentConcurrent++
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent)

      // Simulate async work
      await new Promise((resolve) => setTimeout(resolve, 10))

      currentConcurrent--
      return {
        rule_id: 'no_console',
        rule_name: 'No console.log',
        file: 'test.ts',
        severity: 'error',
        pass: true,
        message: 'OK',
        duration_ms: 10,
        cached: false,
      }
    })

    await engine.run(files, config)

    // Max concurrent should not exceed config.concurrency
    expect(maxConcurrent).toBeLessThanOrEqual(config.concurrency)
    expect(mockClient.lint).toHaveBeenCalledTimes(10)
  })

  it('exit code 1 when errors exist', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule1])

    vi.mocked(mockClient.lint).mockResolvedValue({
      rule_id: 'no_console',
      rule_name: 'No console.log',
      file: 'src/file1.ts',
      severity: 'error',
      pass: false,
      message: 'Found console.log',
      duration_ms: 100,
      cached: false,
    })

    const result = await engine.run(['src/file1.ts'], config)

    expect(result.exitCode).toBe(1)
    expect(result.summary.errors).toBe(1)
  })

  it('exit code 0 when only warnings', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule2])

    vi.mocked(mockClient.lint).mockResolvedValue({
      rule_id: 'max_length',
      rule_name: 'Max 300 lines',
      file: 'src/file1.ts',
      severity: 'warning',
      pass: false,
      message: 'File too long',
      duration_ms: 100,
      cached: false,
    })

    const result = await engine.run(['src/file1.ts'], config)

    expect(result.exitCode).toBe(0)
    expect(result.summary.warnings).toBe(1)
    expect(result.summary.errors).toBe(0)
  })

  it('exit code 0 when all pass', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule1])

    vi.mocked(mockClient.lint).mockResolvedValue({
      rule_id: 'no_console',
      rule_name: 'No console.log',
      file: 'src/file1.ts',
      severity: 'error',
      pass: true,
      message: 'No issues found',
      duration_ms: 100,
      cached: false,
    })

    const result = await engine.run(['src/file1.ts'], config)

    expect(result.exitCode).toBe(0)
    expect(result.summary.passed).toBe(1)
    expect(result.summary.errors).toBe(0)
  })

  it('summary counts are correct', async () => {
    vi.mocked(mockMatcher.matchFile).mockImplementation((filePath) => {
      if (filePath === 'src/file1.ts') return [rule1, rule2]
      if (filePath === 'src/file2.ts') return [rule1]
      return []
    })

    // Mock different results
    const results: LintResult[] = [
      // file1.ts × rule1 → error
      {
        rule_id: 'no_console',
        rule_name: 'No console.log',
        file: 'src/file1.ts',
        severity: 'error',
        pass: false,
        message: 'Error found',
        duration_ms: 100,
        cached: false,
      },
      // file1.ts × rule2 → warning
      {
        rule_id: 'max_length',
        rule_name: 'Max 300 lines',
        file: 'src/file1.ts',
        severity: 'warning',
        pass: false,
        message: 'Warning found',
        duration_ms: 100,
        cached: false,
      },
      // file2.ts × rule1 → pass
      {
        rule_id: 'no_console',
        rule_name: 'No console.log',
        file: 'src/file2.ts',
        severity: 'error',
        pass: true,
        message: 'All good',
        duration_ms: 100,
        cached: false,
      },
    ]

    let callIndex = 0
    vi.mocked(mockClient.lint).mockImplementation(async () => results[callIndex++])

    const result = await engine.run(['src/file1.ts', 'src/file2.ts'], config)

    expect(result.summary.total_files).toBe(2)
    expect(result.summary.total_rules_applied).toBe(3)
    expect(result.summary.errors).toBe(1)
    expect(result.summary.warnings).toBe(1)
    expect(result.summary.passed).toBe(1)
    expect(result.summary.cached).toBe(0)
  })

  it('cache is saved after run', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule1])

    await engine.run(['src/file1.ts'], config)

    expect(mockCache.save).toHaveBeenCalledTimes(1)
  })

  it('files with no matching rules are skipped entirely', async () => {
    // No rules match any files
    vi.mocked(mockMatcher.matchFile).mockReturnValue([])

    const result = await engine.run(['src/file1.ts', 'src/file2.ts'], config)

    // No jobs should be created
    expect(mockClient.lint).not.toHaveBeenCalled()
    expect(result.summary.total_files).toBe(0)
    expect(result.summary.total_rules_applied).toBe(0)
  })

  it('mixed cached and uncached jobs are handled correctly', async () => {
    vi.mocked(mockMatcher.matchFile).mockReturnValue([rule1])

    // First file is cached, second is not
    vi.mocked(mockCache.lookup).mockImplementation((_ruleId, filePath) => {
      if (filePath === 'src/file1.ts') {
        return {
          rule_id: 'no_console',
          rule_name: 'No console.log',
          file: 'src/file1.ts',
          severity: 'error',
          pass: true,
          message: 'Cached',
          duration_ms: 50,
          cached: false,
        }
      }
      return null
    })

    await engine.run(['src/file1.ts', 'src/file2.ts'], config)

    // Only one call to client.lint (for file2.ts)
    expect(mockClient.lint).toHaveBeenCalledTimes(1)

    // Both results should be in report
    const [[results]] = vi.mocked(mockReporter.report).mock.calls
    expect(results).toHaveLength(2)
    expect(results[0].cached).toBe(true) // file1
    expect(results[1].cached).toBe(false) // file2
  })
})
