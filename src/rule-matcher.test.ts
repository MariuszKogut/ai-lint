import { describe, expect, it } from 'vitest'
import { RuleMatcher } from './rule-matcher.js'
import type { LintRule } from './types.js'

describe('RuleMatcher', () => {
  describe('matchFile', () => {
    it('matches files with simple glob pattern', () => {
      const rules: LintRule[] = [
        {
          id: 'test_rule',
          name: 'Test Rule',
          severity: 'error',
          glob: 'src/routes/*.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('src/routes/user.ts')).toHaveLength(1)
      expect(matcher.matchFile('src/routes/user.ts')[0].id).toBe('test_rule')
    })

    it('does not match files that do not fit the glob pattern', () => {
      const rules: LintRule[] = [
        {
          id: 'test_rule',
          name: 'Test Rule',
          severity: 'error',
          glob: 'src/routes/*.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('src/lib/util.ts')).toHaveLength(0)
      expect(matcher.matchFile('src/routes/nested/user.ts')).toHaveLength(0)
      expect(matcher.matchFile('other/routes/user.ts')).toHaveLength(0)
    })

    it('excludes files matching the exclude pattern', () => {
      const rules: LintRule[] = [
        {
          id: 'no_test_files',
          name: 'No Test Files',
          severity: 'error',
          glob: 'src/**/*.ts',
          exclude: 'src/**/*.test.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('src/lib/util.ts')).toHaveLength(1)
      expect(matcher.matchFile('src/lib/util.test.ts')).toHaveLength(0)
      expect(matcher.matchFile('src/routes/user.test.ts')).toHaveLength(0)
      expect(matcher.matchFile('src/routes/user.ts')).toHaveLength(1)
    })

    it('returns multiple rules when multiple rules match the same file', () => {
      const rules: LintRule[] = [
        {
          id: 'rule_one',
          name: 'Rule One',
          severity: 'error',
          glob: 'src/**/*.ts',
          prompt: 'Prompt 1',
        },
        {
          id: 'rule_two',
          name: 'Rule Two',
          severity: 'warning',
          glob: 'src/routes/*.ts',
          prompt: 'Prompt 2',
        },
        {
          id: 'rule_three',
          name: 'Rule Three',
          severity: 'error',
          glob: 'src/lib/*.ts',
          prompt: 'Prompt 3',
        },
      ]
      const matcher = new RuleMatcher(rules)

      const result = matcher.matchFile('src/routes/user.ts')
      expect(result).toHaveLength(2)
      expect(result.map((r) => r.id)).toContain('rule_one')
      expect(result.map((r) => r.id)).toContain('rule_two')
      expect(result.map((r) => r.id)).not.toContain('rule_three')
    })

    it('returns empty array when no rules match', () => {
      const rules: LintRule[] = [
        {
          id: 'test_rule',
          name: 'Test Rule',
          severity: 'error',
          glob: 'src/routes/*.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('other/file.ts')).toHaveLength(0)
      expect(matcher.matchFile('README.md')).toHaveLength(0)
    })

    it('matches nested glob patterns correctly', () => {
      const rules: LintRule[] = [
        {
          id: 'nested_rule',
          name: 'Nested Rule',
          severity: 'error',
          glob: 'src/**/*.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('src/a/b/c.ts')).toHaveLength(1)
      expect(matcher.matchFile('src/deep/nested/path/file.ts')).toHaveLength(1)
      expect(matcher.matchFile('src/file.ts')).toHaveLength(1)
    })

    it('handles exclude patterns with multiple glob levels', () => {
      const rules: LintRule[] = [
        {
          id: 'exclude_multiple',
          name: 'Exclude Multiple',
          severity: 'error',
          glob: 'src/**/*.ts',
          exclude: 'src/**/*.{test,spec}.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('src/lib/util.ts')).toHaveLength(1)
      expect(matcher.matchFile('src/lib/util.test.ts')).toHaveLength(0)
      expect(matcher.matchFile('src/lib/util.spec.ts')).toHaveLength(0)
      expect(matcher.matchFile('src/deep/nested/file.spec.ts')).toHaveLength(0)
    })

    it('matches files with Windows-style backslash paths', () => {
      const rules: LintRule[] = [
        {
          id: 'test_rule',
          name: 'Test Rule',
          severity: 'error',
          glob: 'src/**/*.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('src\\routes\\user.ts')).toHaveLength(1)
      expect(matcher.matchFile('src\\deep\\nested\\file.ts')).toHaveLength(1)
    })

    it('applies exclude patterns with Windows-style paths', () => {
      const rules: LintRule[] = [
        {
          id: 'no_tests',
          name: 'No Tests',
          severity: 'error',
          glob: 'src/**/*.ts',
          exclude: 'src/**/*.test.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      expect(matcher.matchFile('src\\lib\\util.ts')).toHaveLength(1)
      expect(matcher.matchFile('src\\lib\\util.test.ts')).toHaveLength(0)
    })
  })

  describe('matchFiles', () => {
    it('returns correct Map for multiple files', () => {
      const rules: LintRule[] = [
        {
          id: 'route_rule',
          name: 'Route Rule',
          severity: 'error',
          glob: 'src/routes/*.ts',
          prompt: 'Prompt 1',
        },
        {
          id: 'all_ts',
          name: 'All TS',
          severity: 'warning',
          glob: 'src/**/*.ts',
          prompt: 'Prompt 2',
        },
      ]
      const matcher = new RuleMatcher(rules)

      const files = ['src/routes/user.ts', 'src/lib/util.ts', 'README.md']

      const result = matcher.matchFiles(files)

      expect(result.size).toBe(3)
      expect(result.get('src/routes/user.ts')).toHaveLength(2)
      expect(result.get('src/lib/util.ts')).toHaveLength(1)
      expect(result.get('README.md')).toHaveLength(0)
    })

    it('handles empty file list', () => {
      const rules: LintRule[] = [
        {
          id: 'test_rule',
          name: 'Test Rule',
          severity: 'error',
          glob: 'src/**/*.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      const result = matcher.matchFiles([])
      expect(result.size).toBe(0)
    })

    it('applies exclude patterns in batch matching', () => {
      const rules: LintRule[] = [
        {
          id: 'no_tests',
          name: 'No Tests',
          severity: 'error',
          glob: 'src/**/*.ts',
          exclude: 'src/**/*.test.ts',
          prompt: 'Test prompt',
        },
      ]
      const matcher = new RuleMatcher(rules)

      const files = ['src/lib/util.ts', 'src/lib/util.test.ts', 'src/routes/user.ts']

      const result = matcher.matchFiles(files)

      expect(result.get('src/lib/util.ts')).toHaveLength(1)
      expect(result.get('src/lib/util.test.ts')).toHaveLength(0)
      expect(result.get('src/routes/user.ts')).toHaveLength(1)
    })
  })

  describe('allGlobs', () => {
    it('returns all unique glob patterns from rules', () => {
      const rules: LintRule[] = [
        {
          id: 'rule_one',
          name: 'Rule One',
          severity: 'error',
          glob: 'src/**/*.ts',
          prompt: 'Prompt 1',
        },
        {
          id: 'rule_two',
          name: 'Rule Two',
          severity: 'warning',
          glob: 'src/routes/*.ts',
          prompt: 'Prompt 2',
        },
        {
          id: 'rule_three',
          name: 'Rule Three',
          severity: 'error',
          glob: 'src/**/*.tsx',
          prompt: 'Prompt 3',
        },
      ]
      const matcher = new RuleMatcher(rules)

      const globs = matcher.allGlobs()

      expect(globs).toHaveLength(3)
      expect(globs).toContain('src/**/*.ts')
      expect(globs).toContain('src/routes/*.ts')
      expect(globs).toContain('src/**/*.tsx')
    })

    it('deduplicates glob patterns', () => {
      const rules: LintRule[] = [
        {
          id: 'rule_one',
          name: 'Rule One',
          severity: 'error',
          glob: 'src/**/*.ts',
          prompt: 'Prompt 1',
        },
        {
          id: 'rule_two',
          name: 'Rule Two',
          severity: 'warning',
          glob: 'src/**/*.ts',
          prompt: 'Prompt 2',
        },
        {
          id: 'rule_three',
          name: 'Rule Three',
          severity: 'error',
          glob: 'src/routes/*.ts',
          prompt: 'Prompt 3',
        },
      ]
      const matcher = new RuleMatcher(rules)

      const globs = matcher.allGlobs()

      expect(globs).toHaveLength(2)
      expect(globs).toContain('src/**/*.ts')
      expect(globs).toContain('src/routes/*.ts')
    })

    it('returns empty array when no rules exist', () => {
      const matcher = new RuleMatcher([])

      const globs = matcher.allGlobs()

      expect(globs).toHaveLength(0)
    })
  })
})
