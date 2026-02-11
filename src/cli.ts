#!/usr/bin/env node
import fs from 'node:fs'
import { createRequire } from 'node:module'
import readline from 'node:readline/promises'
import { Command } from 'commander'
import dotenv from 'dotenv'
import YAML from 'yaml'
import { AnthropicClient } from './anthropic-client'
import { CacheManager } from './cache-manager'
import { ConfigLoader } from './config-loader'
import { FileResolver } from './file-resolver'
import { LinterEngine } from './linter-engine'
import { Reporter } from './reporter'
import { RuleGenerator } from './rule-generator'
import { RuleMatcher } from './rule-matcher'

dotenv.config({ quiet: true })

const require = createRequire(import.meta.url)
const { version: PKG_VERSION } = require('../package.json')

const DEFAULT_CONFIG_CONTENT = `# ai-lint configuration
# See: https://github.com/handmade-systems/ai-lint

# model: gemini-flash    # Default AI model (gemini-flash | haiku | sonnet | opus)
# concurrency: 5         # Max parallel API calls
# git_base: main         # Base branch for --changed mode

rules: []
# Example rule:
#   - id: no_console_log
#     name: No console.log statements
#     severity: warning
#     glob: "src/**/*.ts"
#     prompt: >
#       Check that the file does not contain any console.log statements.
#       Debug logging should use a proper logger instead.
`

const program = new Command()

program
  .name('ai-lint')
  .description('AI-powered code linter with custom YAML rules')
  .version(PKG_VERSION)

// --- lint command ---
program
  .command('lint')
  .description('Lint files against configured rules')
  .argument('[files...]', 'Explicit files to lint')
  .option('--all', 'Lint all files matching rule globs')
  .option('--changed', 'Lint only git-changed files')
  .option('--base <branch>', 'Override git_base (used with --changed)')
  .option('--config <path>', 'Config file path', '.ai-lint.yml')
  .option('--verbose', 'Show detailed progress (API calls vs cache hits)')
  .action(async (files: string[], options) => {
    try {
      // 1. Load config
      const loader = new ConfigLoader()
      const config = loader.load(options.config)

      // 2. Check for API key
      if (!process.env.OPEN_ROUTER_KEY) {
        console.error('Error: OPEN_ROUTER_KEY environment variable is required')
        process.exit(2)
      }

      // 3. Load cache
      const cache = new CacheManager('.ai-lint')
      cache.load()

      // 4. Resolve files based on mode
      const gitBase = options.base || config.git_base
      const resolver = new FileResolver(gitBase, process.cwd())

      let filesToLint: string[]
      if (options.all) {
        const globs = config.rules.map((r) => r.glob)
        filesToLint = await resolver.resolveAll(globs)
      } else if (options.changed) {
        filesToLint = await resolver.resolveChanged()
      } else if (files.length > 0) {
        filesToLint = resolver.resolveExplicit(files)
      } else {
        console.log('No files to lint. Use --all, --changed, or specify explicit files.')
        process.exit(0)
      }

      // Check if we have files to lint
      if (filesToLint.length === 0) {
        console.log('No files to lint.')
        process.exit(0)
      }

      // 5. Create dependencies
      const client = new AnthropicClient(config.model)
      const matcher = new RuleMatcher(config.rules)
      const reporter = new Reporter()

      console.log(
        `Linting ${filesToLint.length} files against ${config.rules.length} rules (model: ${config.model})...\n`,
      )

      // 6. Create and run engine
      const engine = new LinterEngine({
        cache,
        client,
        matcher,
        reporter,
        onProgress: (completed, total, job, cached) => {
          if (options.verbose) {
            const tag = cached ? 'cache' : 'api'
            console.log(`  [${completed}/${total}] (${tag}) ${job.rule.id} — ${job.filePath}`)
          } else {
            process.stdout.write(`\r  [${completed}/${total}] ${job.rule.id} — ${job.filePath}`)
            if (completed === total) process.stdout.write('\n\n')
          }
        },
      })

      const { exitCode } = await engine.run(filesToLint, config)

      // 7. Exit with appropriate code
      process.exit(exitCode)
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`)
      } else {
        console.error('An unexpected error occurred')
      }
      process.exit(2)
    }
  })

// --- validate command ---
program
  .command('validate')
  .description('Validate config file')
  .option('--config <path>', 'Config file path', '.ai-lint.yml')
  .action((options) => {
    try {
      const loader = new ConfigLoader()
      const config = loader.load(options.config)

      console.log('✓ Configuration is valid')
      console.log(`  Model: ${config.model}`)
      console.log(`  Concurrency: ${config.concurrency}`)
      console.log(`  Git base: ${config.git_base}`)
      console.log(`  Rules: ${config.rules.length} (${config.rules.map((r) => r.id).join(', ')})`)
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Configuration error: ${error.message}`)
      } else {
        console.error('An unexpected error occurred')
      }
      process.exit(2)
    }
  })

// --- generate-rule command ---
program
  .command('generate-rule')
  .description('Interactively generate a new lint rule using AI')
  .option('--config <path>', 'Config file path', '.ai-lint.yml')
  .action(async (options) => {
    try {
      // 1. Check for API key
      if (!process.env.OPEN_ROUTER_KEY) {
        console.error('Error: OPEN_ROUTER_KEY environment variable is required')
        process.exit(2)
      }

      const configPath = options.config

      // 2. Interactive prompt for rule description
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      const description = await rl.question('Describe what the rule should check:\n> ')

      if (!description.trim()) {
        console.error('Error: Description cannot be empty')
        rl.close()
        process.exit(2)
      }

      // 3. Generate rule via AI
      console.log('\nGenerating rule...')
      const generator = new RuleGenerator()
      const rule = await generator.generate(description.trim())

      // 4. Show YAML preview
      console.log('\nGenerated rule:\n')
      console.log(YAML.stringify([rule]).trim())

      // 5. Confirm
      const answer = await rl.question('\nAdd this rule to config? (y/n) ')
      rl.close()

      if (answer.trim().toLowerCase() !== 'y') {
        console.log('Aborted.')
        return
      }

      // 6. Create config file if needed, then append rule
      let config: Record<string, unknown>
      if (fs.existsSync(configPath)) {
        config = YAML.parse(fs.readFileSync(configPath, 'utf-8')) || {}
      } else {
        config = YAML.parse(DEFAULT_CONFIG_CONTENT) || {}
        console.log(`Creating ${configPath}...`)
      }
      if (!Array.isArray(config.rules)) {
        config.rules = []
      }
      ;(config.rules as unknown[]).push(rule)
      fs.writeFileSync(configPath, YAML.stringify(config), 'utf-8')
      console.log(`Rule "${rule.id}" added to ${configPath}`)
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`)
      } else {
        console.error('An unexpected error occurred')
      }
      process.exit(2)
    }
  })

// --- cache commands ---
const cacheCmd = program.command('cache').description('Manage cache')

cacheCmd
  .command('clear')
  .description('Clear cache')
  .action(() => {
    try {
      const cache = new CacheManager('.ai-lint')
      cache.clear()
      console.log('✓ Cache cleared')
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`)
      } else {
        console.error('An unexpected error occurred')
      }
      process.exit(2)
    }
  })

cacheCmd
  .command('status')
  .description('Show cache stats')
  .action(() => {
    try {
      const cache = new CacheManager('.ai-lint')
      cache.load()
      const stats = cache.status()
      console.log(`Cache entries: ${stats.entries}`)
      console.log(`Cache size: ${(stats.sizeBytes / 1024).toFixed(2)} KB`)
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`)
      } else {
        console.error('An unexpected error occurred')
      }
      process.exit(2)
    }
  })

program.parse()
