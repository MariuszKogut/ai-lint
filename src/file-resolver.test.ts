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
    // Create a temporary directory for tests with a git repo
    tempDir = mkdtempSync(path.join(tmpdir(), 'file-resolver-test-'))
    execSync('git init', { cwd: tempDir, stdio: 'ignore' })
    resolver = new FileResolver('main', tempDir)
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('resolveExplicit', () => {
    test('returns existing files', () => {
      writeFileSync(path.join(tempDir, 'file1.ts'), 'content')
      writeFileSync(path.join(tempDir, 'file2.ts'), 'content')

      const result = resolver.resolveExplicit(['file1.ts', 'file2.ts'])

      expect(result).toEqual(['file1.ts', 'file2.ts'])
    })

    test('warns for missing files', () => {
      writeFileSync(path.join(tempDir, 'exists.ts'), 'content')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = resolver.resolveExplicit(['exists.ts', 'missing.ts'])

      expect(result).toEqual(['exists.ts'])
      expect(warnSpy).toHaveBeenCalledWith('Warning: File does not exist: missing.ts')

      warnSpy.mockRestore()
    })

    test('handles absolute and relative paths', () => {
      const fileName = 'test-file.ts'
      writeFileSync(path.join(tempDir, fileName), 'content')

      const relativeResult = resolver.resolveExplicit([fileName])
      expect(relativeResult).toEqual([fileName])

      const absolutePath = path.join(tempDir, fileName)
      const absoluteResult = resolver.resolveExplicit([absolutePath])
      expect(absoluteResult).toEqual([fileName])
    })

    test('returns empty array for no files', () => {
      const result = resolver.resolveExplicit([])
      expect(result).toEqual([])
    })

    test('excludes gitignored files', () => {
      writeFileSync(path.join(tempDir, 'tracked.ts'), 'content')
      writeFileSync(path.join(tempDir, 'ignored.ts'), 'content')
      writeFileSync(path.join(tempDir, '.gitignore'), 'ignored.ts\n')

      const result = resolver.resolveExplicit(['tracked.ts', 'ignored.ts'])

      expect(result).toEqual(['tracked.ts'])
    })
  })

  describe('resolveAll', () => {
    test('finds files matching glob patterns', async () => {
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
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'file1.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'file2.ts'), 'content')

      const result = await resolver.resolveAll(['src/**/*.ts', 'src/file1.ts', 'src/**/*'])

      const uniqueResults = [...new Set(result)]
      expect(result.length).toBe(uniqueResults.length)
    })

    test('returns empty array for no globs', async () => {
      const result = await resolver.resolveAll([])
      expect(result).toEqual([])
    })

    test('handles multiple glob patterns', async () => {
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
      mkdirSync(path.join(tempDir, 'node_modules', 'pkg'), { recursive: true })
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })

      writeFileSync(path.join(tempDir, 'node_modules', 'pkg', 'index.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'content')

      const result = await resolver.resolveAll(['**/*.ts', '**/*'])

      expect(result).not.toContain('node_modules/pkg/index.ts')
      expect(result).toContain('src/app.ts')
    })

    test('handles nested directories', async () => {
      mkdirSync(path.join(tempDir, 'src', 'deep', 'nested', 'path'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'deep', 'nested', 'path', 'file.ts'), 'content')

      const result = await resolver.resolveAll(['src/**/*.ts'])

      expect(result).toContain('src/deep/nested/path/file.ts')
    })

    test('excludes gitignored files', async () => {
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'content')
      writeFileSync(path.join(tempDir, 'src', 'generated.ts'), 'content')
      writeFileSync(path.join(tempDir, '.gitignore'), 'src/generated.ts\n')

      const result = await resolver.resolveAll(['src/**/*.ts'])

      expect(result).toContain('src/app.ts')
      expect(result).not.toContain('src/generated.ts')
    })

    test('excludes gitignored directories', async () => {
      mkdirSync(path.join(tempDir, 'src'), { recursive: true })
      mkdirSync(path.join(tempDir, 'dist'), { recursive: true })
      writeFileSync(path.join(tempDir, 'src', 'app.ts'), 'content')
      writeFileSync(path.join(tempDir, 'dist', 'app.ts'), 'content')
      writeFileSync(path.join(tempDir, '.gitignore'), 'dist/\n')

      const result = await resolver.resolveAll(['**/*.ts'])

      expect(result).toContain('src/app.ts')
      expect(result).not.toContain('dist/app.ts')
    })
  })
})
