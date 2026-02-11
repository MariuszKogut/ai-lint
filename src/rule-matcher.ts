import micromatch from 'micromatch'
import type { LintRule } from './types.js'

/**
 * RuleMatcher matches files against lint rules using glob patterns.
 *
 * Responsibilities:
 * - Match files to rules based on glob patterns
 * - Apply exclude patterns to filter out unwanted matches
 * - Return all matching rules for a given file
 * - Collect all unique glob patterns from rules for file discovery
 */
export class RuleMatcher {
  constructor(private rules: LintRule[]) {}

  /**
   * Returns all rules whose glob matches the file and exclude pattern doesn't.
   * File path should be relative to cwd.
   *
   * @param filePath - Relative path to the file
   * @returns Array of matching lint rules
   */
  matchFile(filePath: string): LintRule[] {
    // Normalize backslashes to forward slashes for Windows compatibility
    const normalizedPath = filePath.replace(/\\/g, '/')

    return this.rules.filter((rule) => {
      // Check if file matches the glob pattern
      const matchesGlob = micromatch.isMatch(normalizedPath, rule.glob)
      if (!matchesGlob) {
        return false
      }

      // If there's an exclude pattern, check if file matches it
      if (rule.exclude) {
        const matchesExclude = micromatch.isMatch(normalizedPath, rule.exclude)
        if (matchesExclude) {
          return false
        }
      }

      return true
    })
  }

  /**
   * Batch operation: returns a Map of file paths to their matching rules.
   *
   * @param filePaths - Array of relative file paths
   * @returns Map from file path to array of matching rules
   */
  matchFiles(filePaths: string[]): Map<string, LintRule[]> {
    const result = new Map<string, LintRule[]>()

    for (const filePath of filePaths) {
      const matchingRules = this.matchFile(filePath)
      result.set(filePath, matchingRules)
    }

    return result
  }

  /**
   * Returns all unique glob patterns from all rules.
   * Useful for file discovery when using --all mode.
   *
   * @returns Array of unique glob patterns
   */
  allGlobs(): string[] {
    const globs = new Set<string>()

    for (const rule of this.rules) {
      globs.add(rule.glob)
    }

    return Array.from(globs)
  }
}
