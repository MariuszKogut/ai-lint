import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { ConfigLoader } from './config-loader.js'

describe('ConfigLoader', () => {
  const loader = new ConfigLoader()
  const testDataDir = path.resolve(import.meta.dirname, '../__test-data__')

  test('1. Load valid config — returns LinterConfig with all fields', () => {
    const config = loader.load(path.join(testDataDir, 'valid-config.yml'))

    expect(config).toMatchObject({
      model: 'haiku',
      concurrency: 5,
      git_base: 'main',
    })

    expect(config.rules).toHaveLength(2)
    expect(config.rules[0]).toMatchObject({
      id: 'no_console_log',
      name: 'No console.log in production code',
      severity: 'error',
      glob: 'src/**/*.ts',
      exclude: 'src/**/*.test.ts',
      prompt: expect.stringContaining('console.log'),
    })
    expect(config.rules[1]).toMatchObject({
      id: 'max_file_length',
      name: 'File should not exceed 300 lines',
      severity: 'warning',
      glob: 'src/**/*.{ts,tsx}',
      prompt: expect.stringContaining('300 lines'),
    })
  })

  test('2. Defaults applied — model=haiku, concurrency=5, git_base=main when not specified', () => {
    // Create temporary config with minimal fields
    const tmpPath = path.join(testDataDir, 'minimal-config.yml')
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: test_rule
    name: "Test Rule"
    severity: error
    glob: "**/*.ts"
    prompt: "Test prompt"
`,
    )

    try {
      const config = loader.load(tmpPath)

      expect(config.model).toBe('gemini-flash')
      expect(config.concurrency).toBe(5)
      expect(config.git_base).toBe('main')
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })

  test('3. Missing rules array — throws with clear error', () => {
    expect(() => loader.load(path.join(testDataDir, 'invalid-missing-rules.yml'))).toThrow(
      /must have required property 'rules'|is required/i,
    )
  })

  test('4. Duplicate rule IDs — throws error', () => {
    expect(() => loader.load(path.join(testDataDir, 'invalid-duplicate-ids.yml'))).toThrow(
      /Duplicate rule IDs found: no_console_log/,
    )
  })

  test('5. Invalid severity value — throws error', () => {
    expect(() => loader.load(path.join(testDataDir, 'invalid-severity.yml'))).toThrow(
      /must be equal to one of the allowed values|allowed values: error, warning/i,
    )
  })

  test('6. Missing required fields (id, name, prompt, glob, severity) — throws for each', () => {
    const tmpPath = path.join(testDataDir, 'missing-field.yml')

    // Missing id
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - name: "Test"
    severity: error
    glob: "**/*.ts"
    prompt: "Test"
`,
    )
    expect(() => loader.load(tmpPath)).toThrow(/id.*is required/i)

    // Missing name
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: test_rule
    severity: error
    glob: "**/*.ts"
    prompt: "Test"
`,
    )
    expect(() => loader.load(tmpPath)).toThrow(/name.*is required/i)

    // Missing severity
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: test_rule
    name: "Test"
    glob: "**/*.ts"
    prompt: "Test"
`,
    )
    expect(() => loader.load(tmpPath)).toThrow(/severity.*is required/i)

    // Missing glob
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: test_rule
    name: "Test"
    severity: error
    prompt: "Test"
`,
    )
    expect(() => loader.load(tmpPath)).toThrow(/glob.*is required/i)

    // Missing prompt
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: test_rule
    name: "Test"
    severity: error
    glob: "**/*.ts"
`,
    )
    expect(() => loader.load(tmpPath)).toThrow(/prompt.*is required/i)

    fs.unlinkSync(tmpPath)
  })

  test('7. Invalid rule ID pattern (uppercase, spaces) — throws error', () => {
    const tmpPath = path.join(testDataDir, 'invalid-rule-id.yml')

    // Uppercase ID
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: NoConsoleLog
    name: "Test"
    severity: error
    glob: "**/*.ts"
    prompt: "Test"
`,
    )
    expect(() => loader.load(tmpPath)).toThrow(/pattern|lowercase with underscores/i)

    // Space in ID
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: no console log
    name: "Test"
    severity: error
    glob: "**/*.ts"
    prompt: "Test"
`,
    )
    expect(() => loader.load(tmpPath)).toThrow(/pattern|lowercase with underscores/i)

    fs.unlinkSync(tmpPath)
  })

  test('8. Rule-level model override preserved after defaults merge', () => {
    const tmpPath = path.join(testDataDir, 'rule-model-override.yml')
    fs.writeFileSync(
      tmpPath,
      `
rules:
  - id: test_rule_haiku
    name: "Test Haiku"
    severity: error
    glob: "**/*.ts"
    prompt: "Test"
    model: haiku
  - id: test_rule_sonnet
    name: "Test Sonnet"
    severity: warning
    glob: "**/*.tsx"
    prompt: "Test"
    model: sonnet
`,
    )

    try {
      const config = loader.load(tmpPath)

      expect(config.model).toBe('gemini-flash') // default
      expect(config.rules[0].model).toBe('haiku')
      expect(config.rules[1].model).toBe('sonnet')
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })

  test('9. Empty rules array (minItems: 1) — throws error', () => {
    const tmpPath = path.join(testDataDir, 'empty-rules.yml')
    fs.writeFileSync(
      tmpPath,
      `
model: haiku
rules: []
`,
    )

    try {
      expect(() => loader.load(tmpPath)).toThrow(/must have at least 1 items/i)
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })
})
