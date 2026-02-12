import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { LintResult, LintSummary } from './types.js'

export function createEmptySummary(): LintSummary {
  return {
    total_files: 0,
    total_rules_applied: 0,
    passed: 0,
    errors: 0,
    warnings: 0,
    cached: 0,
    duration_ms: 0,
  }
}

export function writeReportOnlyReport(
  reportFile: string,
  payload: {
    results: LintResult[]
    summary: LintSummary
    exitCode: number
    error?: string
  },
): string {
  const reportPath = resolve(reportFile)
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        mode: 'report-only',
        generated_at: new Date().toISOString(),
        exit_code: payload.exitCode,
        summary: payload.summary,
        results: payload.results,
        error: payload.error,
      },
      null,
      2,
    ),
    'utf-8',
  )
  return reportPath
}

export function suppressConsoleOutput(): () => void {
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error

  console.log = () => {}
  console.warn = () => {}
  console.error = () => {}

  return () => {
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
  }
}
