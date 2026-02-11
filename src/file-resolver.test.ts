import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FileResolver } from './file-resolver'

describe('FileResolver', () => {
  let tempDir: string
  let resolver: FileResolver

  beforeEach(() => {
    // Create a temporary directory for tests
    tempDir = mkdtempSync(path.join(tmpdir(), 'file-resolver-test-'))
    resolver = new FileResolver('main', tempDir)
  })

  afterEach(() => {
    // Clean up temporary directory
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('resolveExplicit', () => {
    test('returns existing files', () => {
      // Create test files
      writeFileSync(path.join(tempDir, 'file1.ts'), 'content')
      writeFileSync(path.join(tempDir, 'file2.ts'), 'content')

      const result = resolver.resolveExplicit(['file1.ts', 'file2.ts'])

      expect(result).toEqual(['file1.ts', 'file2.ts'])
    })

    test('warns for missing files', () => {
      // Create only one file
      writeFileSync(path.join(tempDir, 'exists.ts'), 'content')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = resolver.resolveExplicit(['exists.ts', 'missing.ts'])

      expect(result).toEqual(['exists.ts'])
      expect(warnSpy).toHaveBeenCalledWith('Warning: File does not exist: missing.ts')

      warnSpy.mockRestore()
    })

    test('handles absolute and relative paths', () => {
      // Create test file
      const fileName = 'test-file.ts'
      writeFileSync(path.join(tempDir, fileName), 'content')

      // Test with relative path
      const relativeResult = resolver.resolveExplicit([fileName])
      expect(relativeResult).toEqual([fileName])

      // Test with absolute path
      const absolutePath = path.join(tempDir, fileName)
      const absoluteResult = resolver.resolveExplicit([absolutePath])
      expect(absoluteResult).toEqual([fileName])
    })

    test('returns empty array for no files', () => {
      const result = resolver.resolveExplicit([])
      expect(result).toEqual([])
    })
  })

  describe('resolveChanged', () => {
    beforeEach(() => {
      // Mock execSync for git commands
      vi.mock('node:child_process')
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    test('parses git diff output correctly', async () => {
      const mockOutput = 'src/file1.ts\nsrc/file2.ts\nsrc/file3.ts\n'

      // Create the files that git reports as changed
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'file1.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file2.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file3.ts'), 'content')

      vi.mocked(execSync).mockReturnValue(mockOutput)

      const result = await resolver.resolveChanged()

      expect(result).toEqual(['src/file1.ts', 'src/file2.ts', 'src/file3.ts'])
      expect(execSync).toHaveBeenCalledWith('git diff --name-only main...HEAD', {
        cwd: tempDir,
        encoding: 'utf-8',
      })
    })

    test('uses custom base when provided', async () => {
      const mockOutput = 'file.ts\n'

      writeFileSync(path.join(tempDir, 'file.ts'), 'content')
      vi.mocked(execSync).mockReturnValue(mockOutput)

      await resolver.resolveChanged('develop')

      expect(execSync).toHaveBeenCalledWith('git diff --name-only develop...HEAD', {
        cwd: tempDir,
        encoding: 'utf-8',
      })
    })

    test('uses gitBase default when no base argument', async () => {
      const customResolver = new FileResolver('custom-branch', tempDir)
      const mockOutput = 'file.ts\n'

      writeFileSync(path.join(tempDir, 'file.ts'), 'content')
      vi.mocked(execSync).mockReturnValue(mockOutput)

      await customResolver.resolveChanged()

      expect(execSync).toHaveBeenCalledWith('git diff --name-only custom-branch...HEAD', {
        cwd: tempDir,
        encoding: 'utf-8',
      })
    })

    test('filters out non-existing files', async () => {
      // Git reports files, but only one exists
      const mockOutput = 'exists.ts\nmissing.ts\n'

      writeFileSync(path.join(tempDir, 'exists.ts'), 'content')
      vi.mocked(execSync).mockReturnValue(mockOutput)

      const result = await resolver.resolveChanged()

      expect(result).toEqual(['exists.ts'])
    })

    test('handles empty git diff output', async () => {
      vi.mocked(execSync).mockReturnValue('')

      const result = await resolver.resolveChanged()

      expect(result).toEqual([])
    })

    test('throws error on git command failure', async () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('fatal: not a git repository')
      })

      await expect(resolver.resolveChanged()).rejects.toThrow(
        'Failed to get changed files from git: fatal: not a git repository',
      )
    })
  })

  describe('resolveAll', () => {
    test('finds files matching glob patterns', async () => {
      // Create test files
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'file1.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file2.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file3.js'), 'content')

      const result = await resolver.resolveAll(['src/**/*.ts'])

      expect(result).toHaveLength(2)
      expect(result).toContain('src/file1.ts')
      expect(result).toContain('src/file2.ts')
      expect(result).not.toContain('src/file3.js')
    })

    test('deduplicates results', async () => {
      // Create test files
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'file1.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file2.ts'), 'content')

      // Use multiple globs that would match the same files
      const result = await resolver.resolveAll(['src/**/*.ts', 'src/file1.ts', 'src/**/*'])

      // fast-glob with unique: true should deduplicate automatically
      const uniqueResults = [...new Set(result)]
      expect(result.length).toBe(uniqueResults.length)
    })

    test('returns empty array for no globs', async () => {
      const result = await resolver.resolveAll([])
      expect(result).toEqual([])
    })

    test('handles multiple glob patterns', async () => {
      // Create test files with different extensions
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'file1.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file2.js'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file3.tsx'), 'content')

      const result = await resolver.resolveAll(['src/**/*.ts', 'src/**/*.js'])

      expect(result).toHaveLength(2)
      expect(result).toContain('src/file1.ts')
      expect(result).toContain('src/file2.js')
      expect(result).not.toContain('src/file3.tsx')
    })

    test('ignores node_modules and .git', async () => {
      // Create files in node_modules and .git
      mkdirSync(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true })
      mkdirSync(path.join(tempDir, '.git', 'objects'), { recursive: true })
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })

      writeFileSync(path.join(tempDir, 'node_modules', 'pkg', 'index.ts'), 'content')
      writeFileSync(path.join(tempDir, '.git', 'config'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'content')

      const result = await resolver.resolveAll(['**/*.ts', '**/*'])

      expect(result).not.toContain('node_modules/pkg/index.ts')
      expect(result).not.toContain('.git/config')
      expect(result).toContain('src/app.ts')
    })

    test('handles nested directories', async () => {
      // Create nested directory structure
      mkdirSync(path.join(tempDir, 'src', 'deep', 'nested', 'path'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'deep', 'nested', 'path', 'file.ts'), 'content')

      const result = await resolver.resolveAll(['src/**/*.ts'])

      expect(result).toContain('src/deep/nested/path/file.ts')
    })
  })
})
