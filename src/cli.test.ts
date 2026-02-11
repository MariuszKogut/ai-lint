import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('CLI', () => {
  const tsxPath = 'npx'
  const cliPath = path.join(__dirname, 'cli.ts')
  const testConfigPath = path.join(__dirname, '../__test-data__/valid-config.yml')
  const invalidConfigPath = path.join(__dirname, '../__test-data__/invalid-missing-rules.yml')
  const cacheDir = path.join(process.cwd(), '.ai-linter')

  // Helper to run CLI commands via tsx
  const runCli = (args: string[], options: any = {}) => {
    return execa(tsxPath, ['tsx', cliPath, ...args], options)
  }

  beforeEach(async () => {
    // Clean up cache before each test
    try {
      await fs.rm(cacheDir, { recursive: true, force: true })
    } catch {
      // Ignore if doesn't exist
    }
  })

  afterEach(async () => {
    // Clean up cache after each test
    try {
      await fs.rm(cacheDir, { recursive: true, force: true })
    } catch {
      // Ignore if doesn't exist
    }
  })

  describe('validate command', () => {
    it('should validate a valid config', async () => {
      const { stdout, exitCode } = await runCli(['validate', '--config', testConfigPath])

      expect(exitCode).toBe(0)
      expect(stdout).toContain('✓ Configuration is valid')
      expect(stdout).toContain('Model: haiku')
      expect(stdout).toContain('Rules: 2')
    })

    it('should exit with code 2 for invalid config', async () => {
      const result = await runCli(['validate', '--config', invalidConfigPath], {
        reject: false,
      })

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('Configuration error')
    })

    it('should exit with code 2 for missing config file', async () => {
      const result = await runCli(['validate', '--config', 'nonexistent.yml'], {
        reject: false,
      })

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('Configuration error')
    })
  })

  describe('cache commands', () => {
    it('should show empty cache status', async () => {
      const { stdout, exitCode } = await runCli(['cache', 'status'])

      expect(exitCode).toBe(0)
      expect(stdout).toContain('Cache entries: 0')
      expect(stdout).toContain('Cache size: 0.00 KB')
    })

    it('should clear cache', async () => {
      // Create cache dir and file
      await fs.mkdir(cacheDir, { recursive: true })
      await fs.writeFile(path.join(cacheDir, 'cache.json'), '{}')

      const { stdout, exitCode } = await runCli(['cache', 'clear'])

      expect(exitCode).toBe(0)
      expect(stdout).toContain('✓ Cache cleared')

      // Verify cache is cleared
      try {
        await fs.access(path.join(cacheDir, 'cache.json'))
        expect.fail('Cache file should not exist')
      } catch {
        // Expected - cache file should not exist
      }
    })
  })

  describe('lint command', () => {
    it('should show error when no mode specified and no files given', async () => {
      const { stdout, exitCode } = await runCli(['lint', '--config', testConfigPath], {
        env: { ...process.env, OPEN_ROUTER_KEY: 'test-key' },
      })

      expect(exitCode).toBe(0)
      expect(stdout).toContain('No files to lint')
    })

    it('should exit with code 2 when OPEN_ROUTER_KEY is missing', async () => {
      const result = await runCli(['lint', '--all', '--config', testConfigPath], {
        env: { ...process.env, OPEN_ROUTER_KEY: '' },
        reject: false,
      })

      expect(result.exitCode).toBe(2)
      expect(result.stderr).toContain('OPEN_ROUTER_KEY')
    })

    it('should resolve files with --all without crashing', async () => {
      const result = await runCli(['lint', '--all', '--config', testConfigPath], {
        env: { ...process.env, OPEN_ROUTER_KEY: 'test-key' },
        reject: false,
      })

      // Should not crash with "Patterns must be a string" error
      expect(result.stderr).not.toContain('Patterns must be a string')
      expect(result.stdout).toContain('files checked')
    })

    it('should resolve files with --changed without crashing', async () => {
      const result = await runCli(['lint', '--changed', '--config', testConfigPath], {
        env: { ...process.env, OPEN_ROUTER_KEY: 'test-key' },
        reject: false,
      })

      // Should not crash with "[object Object]" in git command
      expect(result.stderr).not.toContain('[object Object]')
    })

    it('should resolve explicit files without crashing', async () => {
      const result = await runCli(['lint', '--config', testConfigPath, 'src/cli.ts'], {
        env: { ...process.env, OPEN_ROUTER_KEY: 'test-key' },
        reject: false,
      })

      // Should not crash with type errors
      expect(result.stderr).not.toContain('argument must be of type')
      expect(result.stdout).toContain('file checked')
    })
  })

  describe('help', () => {
    it('should show help message', async () => {
      const { stdout, exitCode } = await runCli(['--help'])

      expect(exitCode).toBe(0)
      expect(stdout).toContain('AI-powered code linter')
      expect(stdout).toContain('Commands:')
      expect(stdout).toContain('lint')
      expect(stdout).toContain('validate')
      expect(stdout).toContain('cache')
    })

    it('should show lint command help', async () => {
      const { stdout, exitCode } = await runCli(['lint', '--help'])

      expect(exitCode).toBe(0)
      expect(stdout).toContain('Lint files against configured rules')
      expect(stdout).toContain('--all')
      expect(stdout).toContain('--changed')
      expect(stdout).toContain('--base')
    })
  })
})
