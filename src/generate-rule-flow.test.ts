import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { type PromptIO, runGenerateRuleFlow } from './generate-rule-flow.js'
import type { LintRule } from './types.js'

const DEFAULT_CONFIG_CONTENT = `rules: []`

const GENERATED_RULE: LintRule = {
  id: 'no_console_log',
  name: 'No console.log statements',
  severity: 'error',
  glob: 'src/**/*.ts',
  prompt: 'Check for console.log statements',
}

describe('runGenerateRuleFlow', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  function createTempConfigPath(): string {
    const dir = mkdtempSync(join(tmpdir(), 'generate-rule-flow-'))
    tempDirs.push(dir)
    return join(dir, '.ai-lint.yml')
  }

  function createIO(answers: string[]): PromptIO {
    let index = 0
    return {
      question: vi.fn(async () => answers[index++] ?? ''),
      close: vi.fn(),
    }
  }

  it('throws on empty description and closes prompt', async () => {
    const io = createIO(['   '])
    const configPath = createTempConfigPath()
    const generator = { generate: vi.fn() }

    await expect(
      runGenerateRuleFlow({
        configPath,
        io,
        generator,
        log: vi.fn(),
        defaultConfigContent: DEFAULT_CONFIG_CONTENT,
      }),
    ).rejects.toThrow('Description cannot be empty')

    expect(generator.generate).not.toHaveBeenCalled()
    expect(io.close).toHaveBeenCalledTimes(1)
  })

  it('aborts without writing when user declines confirmation', async () => {
    const io = createIO(['No console logs', 'n'])
    const configPath = createTempConfigPath()
    const log = vi.fn()
    const generator = { generate: vi.fn().mockResolvedValue(GENERATED_RULE) }

    await runGenerateRuleFlow({
      configPath,
      io,
      generator,
      log,
      defaultConfigContent: DEFAULT_CONFIG_CONTENT,
    })

    expect(log).toHaveBeenCalledWith('Aborted.')
    expect(io.close).toHaveBeenCalledTimes(1)
  })

  it('creates config file and adds generated rule when file does not exist', async () => {
    const io = createIO(['No console logs', 'y'])
    const configPath = createTempConfigPath()
    const log = vi.fn()
    const generator = { generate: vi.fn().mockResolvedValue(GENERATED_RULE) }

    await runGenerateRuleFlow({
      configPath,
      io,
      generator,
      log,
      defaultConfigContent: DEFAULT_CONFIG_CONTENT,
    })

    const written = YAML.parse(readFileSync(configPath, 'utf-8')) as { rules: LintRule[] }
    expect(written.rules).toHaveLength(1)
    expect(written.rules[0].id).toBe('no_console_log')
    expect(io.close).toHaveBeenCalledTimes(1)
  })

  it('appends generated rule to existing config', async () => {
    const io = createIO(['No secrets', 'y'])
    const configPath = createTempConfigPath()
    writeFileSync(
      configPath,
      YAML.stringify({
        model: 'haiku',
        concurrency: 5,
        git_base: 'main',
        rules: [
          {
            id: 'existing_rule',
            name: 'Existing',
            severity: 'warning',
            glob: '**/*.ts',
            prompt: 'existing prompt',
          },
        ],
      }),
      'utf-8',
    )

    const generator = {
      generate: vi.fn().mockResolvedValue({
        ...GENERATED_RULE,
        id: 'no_secrets',
      }),
    }

    await runGenerateRuleFlow({
      configPath,
      io,
      generator,
      log: vi.fn(),
      defaultConfigContent: DEFAULT_CONFIG_CONTENT,
    })

    const written = YAML.parse(readFileSync(configPath, 'utf-8')) as { rules: LintRule[] }
    expect(written.rules).toHaveLength(2)
    expect(written.rules[0].id).toBe('existing_rule')
    expect(written.rules[1].id).toBe('no_secrets')
    expect(io.close).toHaveBeenCalledTimes(1)
  })
})
