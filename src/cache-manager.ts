import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CacheEntry, CacheStore, LintResult } from './types.js'

export class CacheManager {
  private cacheStore: CacheStore
  private cacheFilePath: string

  constructor(private cacheDir: string) {
    this.cacheFilePath = join(cacheDir, 'cache.json')
    this.cacheStore = { version: 1, entries: {} }
  }

  /**
   * Load cache from disk. If the file doesn't exist, start with empty store.
   */
  load(): void {
    let content: string

    try {
      content = readFileSync(this.cacheFilePath, 'utf-8')
    } catch (error) {
      // Missing cache file is expected for first run
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        this.cacheStore = { version: 1, entries: {} }
        return
      }

      console.warn(
        `Warning: Failed to read cache file "${this.cacheFilePath}". Starting with empty cache.`,
      )
      this.cacheStore = { version: 1, entries: {} }
      return
    }

    try {
      this.cacheStore = JSON.parse(content) as CacheStore
    } catch {
      console.warn(
        `Warning: Cache file "${this.cacheFilePath}" is invalid JSON. Starting with empty cache.`,
      )
      this.cacheStore = { version: 1, entries: {} }
    }
  }

  /**
   * Write cache to disk. Creates directory if it doesn't exist.
   */
  save(): void {
    mkdirSync(this.cacheDir, { recursive: true })
    writeFileSync(this.cacheFilePath, JSON.stringify(this.cacheStore, null, 2), 'utf-8')
  }

  /**
   * Lookup a cached result for a given rule + file + hashes.
   * Returns null if not found or if hashes don't match.
   */
  lookup(
    ruleId: string,
    filePath: string,
    fileHash: string,
    promptHash: string,
  ): LintResult | null {
    const key = `${ruleId}:${filePath}`
    const entry = this.cacheStore.entries[key]

    if (!entry) {
      return null
    }

    // Cache is only valid if BOTH hashes match
    if (entry.file_hash !== fileHash || entry.prompt_hash !== promptHash) {
      return null
    }

    return entry.result
  }

  /**
   * Store a lint result in the cache.
   */
  store(
    ruleId: string,
    filePath: string,
    fileHash: string,
    promptHash: string,
    result: LintResult,
  ): void {
    const key = `${ruleId}:${filePath}`
    const entry: CacheEntry = {
      file_hash: fileHash,
      prompt_hash: promptHash,
      rule_id: ruleId,
      result,
      timestamp: new Date().toISOString(),
    }
    this.cacheStore.entries[key] = entry
  }

  /**
   * Delete the cache file from disk.
   */
  clear(): void {
    try {
      unlinkSync(this.cacheFilePath)
    } catch {
      // File doesn't exist - nothing to clear
    }
    this.cacheStore = { version: 1, entries: {} }
  }

  /**
   * Get cache statistics.
   */
  status(): { entries: number; sizeBytes: number } {
    const entries = Object.keys(this.cacheStore.entries).length
    let sizeBytes = 0

    try {
      const stats = statSync(this.cacheFilePath)
      sizeBytes = stats.size
    } catch {
      // File doesn't exist
      sizeBytes = 0
    }

    return { entries, sizeBytes }
  }

  /**
   * Compute SHA-256 hash of a string.
   */
  static hash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex')
  }
}
