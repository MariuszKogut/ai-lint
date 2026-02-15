import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptySummary, suppressConsoleOutput, writeReportOnlyReport } from './report-only.js'
import type { LintResult } from './types.js'

describe('report-only helpers', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  it('writes JSON report with expected shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-only-test-'))
    tempDirs.push(dir)
    const reportPath = join(dir, '.ai-lint', 'report.json')

    const results: LintResult[] = [
      {
        rule_id: 'r1',
        rule_name: 'Rule 1',
        file: 'src/a.ts',
        severity: 'error',
        pass: false,
        message: 'Violation',
        line: 12,
        duration_ms: 50,
        cached: false,
      },
    ]

    const writtenPath = writeReportOnlyReport(reportPath, {
      results,
      summary: createEmptySummary(),
      exitCode: 1,
      error: 'boom',
    })

    const data = JSON.parse(readFileSync(writtenPath, 'utf-8')) as Record<string, unknown>
    expect(data.mode).toBe('report-only')
    expect(data.exit_code).toBe(1)
    expect(data.error).toBe('boom')
    expect(Array.isArray(data.results)).toBe(true)
  })

  it('suppresses console output until restored', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const restore = suppressConsoleOutput()

    console.log('hidden log')
    console.warn('hidden warn')
    console.error('hidden error')

    expect(logSpy).toHaveBeenCalledTimes(0)
    expect(warnSpy).toHaveBeenCalledTimes(0)
    expect(errorSpy).toHaveBeenCalledTimes(0)

    restore()
    console.log('visible log')

    expect(logSpy).toHaveBeenCalledWith('visible log')

    logSpy.mockRestore()
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
