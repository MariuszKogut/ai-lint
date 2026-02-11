#!/usr/bin/env node
import { Command } from 'commander'
import { AnthropicClient } from './anthropic-client'
import { CacheManager } from './cache-manager'
import { ConfigLoader } from './config-loader'
import { FileResolver } from './file-resolver'
import { LinterEngine } from './linter-engine'
import { Reporter } from './reporter'
import { RuleMatcher } from './rule-matcher'

const program = new Command()

program
  .name('ai-linter')
  .description('AI-powered code linter with custom YAML rules')
  .version('1.0.0')

// --- lint command ---
program
  .command('lint')
  .description('Lint files against configured rules')
  .argument('[files...]', 'Explicit files to lint')
  .option('--all', 'Lint all files matching rule globs')
  .option('--changed', 'Lint only git-changed files')
  .option('--base <branch>', 'Override git_base (used with --changed)')
  .option('--config <path>', 'Config file path', '.ai-linter.yml')
  .action(async (files: string[], options) => {
    try {
      // 1. Load config
      const loader = new ConfigLoader()
      const config = loader.load(options.config)

      // 2. Check for API key
      if (!process.env.ANTHROPIC_API_KEY) {
        console.error('Error: ANTHROPIC_API_KEY environment variable is required')
        process.exit(2)
      }

      // 3. Load cache
      const cache = new CacheManager('.ai-linter')
      cache.load()

      // 4. Resolve files based on mode
      const gitBase = options.base || config.git_base
      const resolver = new FileResolver(gitBase, process.cwd())

      let filesToLint: string[]
      if (options.all) {
        filesToLint = await resolver.resolveAll(config.rules)
      } else if (options.changed) {
        filesToLint = await resolver.resolveChanged(config.rules)
      } else if (files.length > 0) {
        filesToLint = await resolver.resolveExplicit(files, config.rules)
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

      // 6. Create and run engine
      const engine = new LinterEngine({
        cache,
        client,
        matcher,
        reporter,
      })

      const exitCode = await engine.run(filesToLint, config)

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
  .option('--config <path>', 'Config file path', '.ai-linter.yml')
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

// --- cache commands ---
const cacheCmd = program.command('cache').description('Manage cache')

cacheCmd
  .command('clear')
  .description('Clear cache')
  .action(() => {
    try {
      const cache = new CacheManager('.ai-linter')
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
      const cache = new CacheManager('.ai-linter')
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
