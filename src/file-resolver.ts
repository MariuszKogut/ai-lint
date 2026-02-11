import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'

/**
 * FileResolver resolves file paths from different sources:
 * - Explicit file paths provided by the user
 * - Changed files from git diff
 * - All files matching glob patterns
 */
export class FileResolver {
  constructor(
    private gitBase: string,
    private cwd: string = process.cwd(),
  ) {}

  /**
   * Validates that explicit file paths exist.
   * Returns absolute paths for existing files, warns for missing ones.
   */
  resolveExplicit(filePaths: string[]): string[] {
    const resolvedPaths: string[] = []

    for (const filePath of filePaths) {
      // Convert to absolute path
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(this.cwd, filePath)

      if (existsSync(absolutePath)) {
        // Convert back to relative path
        const relativePath = path.relative(this.cwd, absolutePath)
        resolvedPaths.push(relativePath)
      } else {
        console.warn(`Warning: File does not exist: ${filePath}`)
      }
    }

    return resolvedPaths
  }

  /**
   * Returns files changed in git diff against the specified base branch.
   * Uses gitBase from constructor as default, or custom base if provided.
   */
  async resolveChanged(base?: string): Promise<string[]> {
    const baseBranch = base ?? this.gitBase

    try {
      // Run git diff to get changed files
      const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
        cwd: this.cwd,
        encoding: 'utf-8',
      })

      // Parse output and filter to existing files
      const changedFiles = output
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
        .map((filePath) => path.relative(this.cwd, path.resolve(this.cwd, filePath)))
        .filter((filePath) => {
          const absolutePath = path.resolve(this.cwd, filePath)
          return existsSync(absolutePath)
        })

      return changedFiles
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to get changed files from git: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Finds all files matching any of the provided glob patterns.
   * Returns deduplicated list of relative file paths.
   */
  async resolveAll(globs: string[]): Promise<string[]> {
    if (globs.length === 0) {
      return []
    }

    try {
      // Use fast-glob to find all matching files
      const files = await fg(globs, {
        cwd: this.cwd,
        dot: false, // Don't match dotfiles by default
        ignore: ['node_modules/**', '.git/**'],
        onlyFiles: true,
        unique: true, // Automatically deduplicate results
      })

      // Return relative paths
      return files.map((filePath) => path.relative(this.cwd, path.resolve(this.cwd, filePath)))
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to resolve glob patterns: ${error.message}`)
      }
      throw error
    }
  }
}
