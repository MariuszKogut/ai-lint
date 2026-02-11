import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FileResolver } from './file-resolver'

vi.mock('node:child_process')

describe('FileResolver.resolveChanged', () => {
  let tempDir: string
  let resolver: FileResolver

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'file-resolver-changed-test-'))
    resolver = new FileResolver('main', tempDir)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(tempDir, { recursive: true, force: true })
  })

  test('parses git diff output correctly', async () => {
    const mockOutput = 'src/file1.ts\nsrc/file2.ts\nsrc/file3.ts\n'

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
