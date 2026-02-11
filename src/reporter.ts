import chalk from 'chalk'
import type { LintResult, LintSummary } from './types.js'

export class Reporter {
  report(results: LintResult[], summary: LintSummary): void {
    if (results.length === 0 || (summary.errors === 0 && summary.warnings === 0)) {
      console.log(chalk.green('All rules passed'))
      console.log(this.formatSummary(summary))
      return
    }

    // Group results by file
    const byFile = this.groupByFile(results)

    // Output violations grouped by file
    for (const [file, fileResults] of Object.entries(byFile)) {
      console.log(chalk.white.bold(`  ${file}`))
      for (const result of fileResults) {
        const severityLabel =
          result.severity === 'error' ? chalk.red('error') : chalk.yellow('warn')
        const ruleId = chalk.dim(result.rule_id)
        const message = result.message
        console.log(`    ${severityLabel}  ${ruleId}  ${message}`)
      }
    }

    console.log()
    console.log(this.formatProblemsLine(results, summary))
    console.log(this.formatSummary(summary))
  }

  private groupByFile(results: LintResult[]): Record<string, LintResult[]> {
    const grouped: Record<string, LintResult[]> = {}
    for (const result of results) {
      if (!result.pass) {
        if (!grouped[result.file]) {
          grouped[result.file] = []
        }
        grouped[result.file].push(result)
      }
    }
    return grouped
  }

  private formatProblemsLine(results: LintResult[], summary: LintSummary): string {
    const total = summary.errors + summary.warnings
    const errorPart =
      summary.errors > 0
        ? `${chalk.red.bold(summary.errors)} ${summary.errors === 1 ? 'error' : 'errors'}`
        : ''
    const warningPart =
      summary.warnings > 0
        ? `${chalk.yellow.bold(summary.warnings)} ${summary.warnings === 1 ? 'warning' : 'warnings'}`
        : ''

    const parts = [errorPart, warningPart].filter(Boolean)
    const problemsDesc = parts.join(', ')

    const fileCount = Object.keys(this.groupByFile(results)).length

    return `  ${total} ${total === 1 ? 'problem' : 'problems'} (${problemsDesc}) in ${fileCount} ${fileCount === 1 ? 'file' : 'files'}`
  }

  private formatSummary(summary: LintSummary): string {
    const files = chalk.dim(
      `${summary.total_files} ${summary.total_files === 1 ? 'file' : 'files'} checked`,
    )
    const cached = chalk.dim(`${summary.cached} cached`)
    const duration = chalk.dim(`${(summary.duration_ms / 1000).toFixed(1)}s`)
    return `  ${files}, ${cached}, ${duration}`
  }
}
