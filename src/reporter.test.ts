import type { SpyInstance } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Reporter } from './reporter.js'
import type { LintResult, LintSummary } from './types.js'

describe('Reporter', () => {
  let reporter: Reporter
  let consoleLogSpy: SpyInstance

  beforeEach(() => {
    reporter = new Reporter()
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('reports errors with red severity label and arrow prefix', () => {
    const results: LintResult[] = [
      {
        rule_id: 'no_console_log',
        rule_name: 'No console.log',
        file: 'src/test.ts',
        severity: 'error',
        pass: false,
        message: 'Contains console.log statement',
        duration_ms: 100,
        cached: false,
      },
    ]
    const summary: LintSummary = {
      total_files: 1,
      total_rules_applied: 1,
      passed: 0,
      errors: 1,
      warnings: 0,
      cached: 0,
      duration_ms: 100,
    }

    reporter.report(results, summary)

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n')
    expect(output).toContain('src/test.ts')
    expect(output).toContain('error')
    expect(output).toContain('no_console_log')
    expect(output).toContain('Contains console.log statement')
    expect(output).toContain('⎿')
  })

  it('reports warnings with yellow severity label', () => {
    const results: LintResult[] = [
      {
        rule_id: 'max_file_length',
        rule_name: 'File length',
        file: 'src/long.ts',
        severity: 'warning',
        pass: false,
        message: 'File exceeds 300 lines',
        duration_ms: 100,
        cached: false,
      },
    ]
    const summary: LintSummary = {
      total_files: 1,
      total_rules_applied: 1,
      passed: 0,
      errors: 0,
      warnings: 1,
      cached: 0,
      duration_ms: 100,
    }

    reporter.report(results, summary)

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n')
    expect(output).toContain('src/long.ts')
    expect(output).toContain('warn')
    expect(output).toContain('max_file_length')
    expect(output).toContain('File exceeds 300 lines')
  })

  it('prints line number when available', () => {
    const results: LintResult[] = [
      {
        rule_id: 'no_console_log',
        rule_name: 'No console.log',
        file: 'src/test.ts',
        severity: 'error',
        pass: false,
        message: 'Contains console.log statement',
        line: 42,
        duration_ms: 100,
        cached: false,
      },
    ]
    const summary: LintSummary = {
      total_files: 1,
      total_rules_applied: 1,
      passed: 0,
      errors: 1,
      warnings: 0,
      cached: 0,
      duration_ms: 100,
    }

    reporter.report(results, summary)

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n')
    expect(output).toContain('line 42')
  })

  it('groups results by file', () => {
    const results: LintResult[] = [
      {
        rule_id: 'rule1',
        rule_name: 'Rule 1',
        file: 'src/a.ts',
        severity: 'error',
        pass: false,
        message: 'Error in a.ts',
        duration_ms: 100,
        cached: false,
      },
      {
        rule_id: 'rule2',
        rule_name: 'Rule 2',
        file: 'src/a.ts',
        severity: 'warning',
        pass: false,
        message: 'Warning in a.ts',
        duration_ms: 100,
        cached: false,
      },
      {
        rule_id: 'rule3',
        rule_name: 'Rule 3',
        file: 'src/b.ts',
        severity: 'error',
        pass: false,
        message: 'Error in b.ts',
        duration_ms: 100,
        cached: false,
      },
    ]
    const summary: LintSummary = {
      total_files: 2,
      total_rules_applied: 3,
      passed: 0,
      errors: 2,
      warnings: 1,
      cached: 0,
      duration_ms: 300,
    }

    reporter.report(results, summary)

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n')
    expect(output).toContain('src/a.ts')
    expect(output).toContain('src/b.ts')
    expect(output).toContain('rule1')
    expect(output).toContain('rule2')
    expect(output).toContain('rule3')
  })

  it('shows "All rules passed" when no violations', () => {
    const results: LintResult[] = [
      {
        rule_id: 'rule1',
        rule_name: 'Rule 1',
        file: 'src/a.ts',
        severity: 'error',
        pass: true,
        message: 'Complies with rule',
        duration_ms: 100,
        cached: false,
      },
    ]
    const summary: LintSummary = {
      total_files: 1,
      total_rules_applied: 1,
      passed: 1,
      errors: 0,
      warnings: 0,
      cached: 0,
      duration_ms: 100,
    }

    reporter.report(results, summary)

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n')
    expect(output).toContain('All rules passed')
    expect(output).toContain('1 file checked')
    expect(output).toContain('⎿')
  })

  it('summary line has correct counts', () => {
    const results: LintResult[] = [
      {
        rule_id: 'rule1',
        rule_name: 'Rule 1',
        file: 'src/a.ts',
        severity: 'error',
        pass: false,
        message: 'Error',
        duration_ms: 100,
        cached: false,
      },
      {
        rule_id: 'rule2',
        rule_name: 'Rule 2',
        file: 'src/b.ts',
        severity: 'warning',
        pass: false,
        message: 'Warning',
        duration_ms: 100,
        cached: false,
      },
    ]
    const summary: LintSummary = {
      total_files: 2,
      total_rules_applied: 2,
      passed: 0,
      errors: 1,
      warnings: 1,
      cached: 0,
      duration_ms: 200,
    }

    reporter.report(results, summary)

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n')
    expect(output).toContain('2 problems')
    expect(output).toContain('1 error')
    expect(output).toContain('1 warning')
    expect(output).toContain('2 files checked')
    expect(output).toContain('0 cached')
    expect(output).toContain('0.2s')
  })

  it('handles empty results array', () => {
    const results: LintResult[] = []
    const summary: LintSummary = {
      total_files: 0,
      total_rules_applied: 0,
      passed: 0,
      errors: 0,
      warnings: 0,
      cached: 0,
      duration_ms: 0,
    }

    reporter.report(results, summary)

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n')
    expect(output).toContain('All rules passed')
    expect(output).toContain('0 files checked')
  })
})
