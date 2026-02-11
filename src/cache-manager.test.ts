import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CacheManager } from './cache-manager.js'
import type { LintResult } from './types.js'

describe('CacheManager', () => {
  let tempDir: string
  let cacheDir: string
  let manager: CacheManager

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'cache-test-'))
    cacheDir = join(tempDir, '.ai-lint')
    manager = new CacheManager(cacheDir)
  })

  afterEach(() => {
    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('hash()', () => {
    it('produces consistent SHA-256 hex string', () => {
      const content = 'Hello, World!'
      const hash1 = CacheManager.hash(content)
      const hash2 = CacheManager.hash(content)

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(64) // SHA-256 produces 64 hex characters
      expect(hash1).toMatch(/^[a-f0-9]{64}$/)
    })

    it('produces different hashes for different content', () => {
      const hash1 = CacheManager.hash('content A')
      const hash2 = CacheManager.hash('content B')

      expect(hash1).not.toBe(hash2)
    })
  })

  describe('store + lookup', () => {
    it('returns cached result when hashes match', () => {
      const ruleId = 'test_rule'
      const filePath = 'src/test.ts'
      const fileHash = CacheManager.hash('file content')
      const promptHash = CacheManager.hash('prompt content')
      const result: LintResult = {
        rule_id: ruleId,
        rule_name: 'Test Rule',
        file: filePath,
        severity: 'error',
        pass: true,
        message: 'All good',
        duration_ms: 100,
        cached: false,
      }

      manager.store(ruleId, filePath, fileHash, promptHash, result)
      const cached = manager.lookup(ruleId, filePath, fileHash, promptHash)

      expect(cached).toEqual(result)
    })
  })

  describe('lookup', () => {
    it('returns null when file hash differs (file changed)', () => {
      const ruleId = 'test_rule'
      const filePath = 'src/test.ts'
      const fileHash = CacheManager.hash('original content')
      const promptHash = CacheManager.hash('prompt')
      const result: LintResult = {
        rule_id: ruleId,
        rule_name: 'Test Rule',
        file: filePath,
        severity: 'error',
        pass: true,
        message: 'OK',
        duration_ms: 100,
        cached: false,
      }

      manager.store(ruleId, filePath, fileHash, promptHash, result)

      // Lookup with different file hash (file changed)
      const changedFileHash = CacheManager.hash('modified content')
      const cached = manager.lookup(ruleId, filePath, changedFileHash, promptHash)

      expect(cached).toBeNull()
    })

    it('returns null when prompt hash differs (rule changed)', () => {
      const ruleId = 'test_rule'
      const filePath = 'src/test.ts'
      const fileHash = CacheManager.hash('file content')
      const promptHash = CacheManager.hash('original prompt')
      const result: LintResult = {
        rule_id: ruleId,
        rule_name: 'Test Rule',
        file: filePath,
        severity: 'error',
        pass: true,
        message: 'OK',
        duration_ms: 100,
        cached: false,
      }

      manager.store(ruleId, filePath, fileHash, promptHash, result)

      // Lookup with different prompt hash (rule changed)
      const changedPromptHash = CacheManager.hash('modified prompt')
      const cached = manager.lookup(ruleId, filePath, fileHash, changedPromptHash)

      expect(cached).toBeNull()
    })

    it('returns null when no entry exists', () => {
      const cached = manager.lookup('nonexistent_rule', 'src/nowhere.ts', 'filehash', 'prompthash')

      expect(cached).toBeNull()
    })
  })

  describe('save + load', () => {
    it('persists to disk and reads back correctly', () => {
      const ruleId = 'test_rule'
      const filePath = 'src/test.ts'
      const fileHash = CacheManager.hash('content')
      const promptHash = CacheManager.hash('prompt')
      const result: LintResult = {
        rule_id: ruleId,
        rule_name: 'Test Rule',
        file: filePath,
        severity: 'warning',
        pass: false,
        message: 'Found issue',
        duration_ms: 200,
        cached: false,
      }

      // Store and save
      manager.store(ruleId, filePath, fileHash, promptHash, result)
      manager.save()

      // Create new manager instance and load
      const newManager = new CacheManager(cacheDir)
      newManager.load()
      const cached = newManager.lookup(ruleId, filePath, fileHash, promptHash)

      expect(cached).toEqual(result)
    })
  })

  describe('clear()', () => {
    it('deletes cache.json', () => {
      const ruleId = 'test_rule'
      const filePath = 'src/test.ts'
      const fileHash = CacheManager.hash('content')
      const promptHash = CacheManager.hash('prompt')
      const result: LintResult = {
        rule_id: ruleId,
        rule_name: 'Test Rule',
        file: filePath,
        severity: 'error',
        pass: true,
        message: 'OK',
        duration_ms: 100,
        cached: false,
      }

      manager.store(ruleId, filePath, fileHash, promptHash, result)
      manager.save()

      // Verify it exists
      expect(manager.status().entries).toBe(1)

      // Clear
      manager.clear()

      // Verify it's gone
      expect(manager.status().entries).toBe(0)
      expect(manager.status().sizeBytes).toBe(0)
    })

    it('handles clearing non-existent cache gracefully', () => {
      // Clear without ever saving
      expect(() => manager.clear()).not.toThrow()
      expect(manager.status().entries).toBe(0)
    })
  })

  describe('status()', () => {
    it('returns correct entry count and file size', () => {
      const ruleId1 = 'rule_1'
      const ruleId2 = 'rule_2'
      const filePath = 'src/test.ts'
      const fileHash = CacheManager.hash('content')
      const promptHash = CacheManager.hash('prompt')
      const result: LintResult = {
        rule_id: ruleId1,
        rule_name: 'Rule 1',
        file: filePath,
        severity: 'error',
        pass: true,
        message: 'OK',
        duration_ms: 100,
        cached: false,
      }

      manager.store(ruleId1, filePath, fileHash, promptHash, result)
      manager.store(ruleId2, filePath, fileHash, promptHash, { ...result, rule_id: ruleId2 })
      manager.save()

      const status = manager.status()

      expect(status.entries).toBe(2)
      expect(status.sizeBytes).toBeGreaterThan(0)
    })

    it('returns zero size when cache file does not exist', () => {
      const status = manager.status()

      expect(status.entries).toBe(0)
      expect(status.sizeBytes).toBe(0)
    })
  })

  describe('load()', () => {
    it('handles missing cache file gracefully (empty store)', () => {
      // Load without any cache file
      expect(() => manager.load()).not.toThrow()

      const status = manager.status()
      expect(status.entries).toBe(0)
    })
  })

  describe('save()', () => {
    it('creates directory if missing', () => {
      // Create a manager with a nested path that doesn't exist
      const deepPath = join(tempDir, 'nested', 'deep', '.ai-lint')
      const deepManager = new CacheManager(deepPath)

      const ruleId = 'test_rule'
      const filePath = 'src/test.ts'
      const fileHash = CacheManager.hash('content')
      const promptHash = CacheManager.hash('prompt')
      const result: LintResult = {
        rule_id: ruleId,
        rule_name: 'Test Rule',
        file: filePath,
        severity: 'error',
        pass: true,
        message: 'OK',
        duration_ms: 100,
        cached: false,
      }

      deepManager.store(ruleId, filePath, fileHash, promptHash, result)

      // Should create all nested directories
      expect(() => deepManager.save()).not.toThrow()

      // Verify it was saved
      const newManager = new CacheManager(deepPath)
      newManager.load()
      const cached = newManager.lookup(ruleId, filePath, fileHash, promptHash)
      expect(cached).toEqual(result)
    })
  })
})
