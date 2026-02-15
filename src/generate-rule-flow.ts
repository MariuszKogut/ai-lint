import fs from 'node:fs'
import YAML from 'yaml'
import type { RuleGenerator } from './rule-generator.js'
import type { LintRule } from './types.js'

export interface PromptIO {
  question(prompt: string): Promise<string>
  close(): void
}

export interface GenerateRuleFlowDeps {
  configPath: string
  io: PromptIO
  generator: Pick<RuleGenerator, 'generate'>
  log: (message: string) => void
  defaultConfigContent: string
}

export async function runGenerateRuleFlow({
  configPath,
  io,
  generator,
  log,
  defaultConfigContent,
}: GenerateRuleFlowDeps): Promise<void> {
  try {
    const description = await io.question('Describe what the rule should check:\n> ')

    if (!description.trim()) {
      throw new Error('Description cannot be empty')
    }

    log('\nGenerating rule...')
    const rule = await generator.generate(description.trim())

    log('\nGenerated rule:\n')
    log(YAML.stringify([rule]).trim())

    const answer = await io.question('\nAdd this rule to config? (y/n) ')
    if (answer.trim().toLowerCase() !== 'y') {
      log('Aborted.')
      return
    }

    let config: Record<string, unknown>
    if (fs.existsSync(configPath)) {
      config = YAML.parse(fs.readFileSync(configPath, 'utf-8')) || {}
    } else {
      config = YAML.parse(defaultConfigContent) || {}
      log(`Creating ${configPath}...`)
    }

    if (!Array.isArray(config.rules)) {
      config.rules = []
    }
    ;(config.rules as LintRule[]).push(rule)

    fs.writeFileSync(configPath, YAML.stringify(config), 'utf-8')
    log(`Rule "${rule.id}" added to ${configPath}`)
  } finally {
    io.close()
  }
}
