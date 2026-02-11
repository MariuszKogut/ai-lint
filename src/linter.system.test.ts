import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import dotenv from 'dotenv'
import { describe, expect, it } from 'vitest'
import { AnthropicClient } from './anthropic-client.js'
import { ConfigLoader } from './config-loader.js'
import type { LintJob } from './types.js'

// Load .env for OPEN_ROUTER_KEY
dotenv.config()

const TEST_DATA = join(__dirname, '..', '__test-data__')
const configPath = join(TEST_DATA, 'system-test-config.yml')
const filePath = join(TEST_DATA, 'system-test-file.ts')

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

describe('System Test — Real OpenRouter API', () => {
  it('should detect hardcoded secrets in test file', async () => {
    const key = process.env.OPEN_ROUTER_KEY
    if (!key) {
      console.log('Skipping: OPEN_ROUTER_KEY not set')
      return
    }

    const config = new ConfigLoader().load(configPath)
    const rule = config.rules[0]
    const fileContent = readFileSync(filePath, 'utf-8')

    const client = new AnthropicClient(config.model)
    const job: LintJob = {
      rule,
      filePath: 'system-test-file.ts',
      fileContent,
      fileHash: sha256(fileContent),
      promptHash: sha256(rule.prompt),
    }

    const result = await client.lint(job)

    console.log('Result:', JSON.stringify(result, null, 2))

    expect(result.rule_id).toBe('no_hardcoded_secrets')
    expect(result.pass).toBe(false)
    expect(result.message).toBeTruthy()
    expect(result.cached).toBe(false)
    expect(result.duration_ms).toBeGreaterThan(0)
  })
})
