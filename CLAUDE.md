# ai-linter

AI-powered code linter with custom YAML rules and Anthropic API.

## Tech Stack

- TypeScript, Node.js 20+
- tsup (Build), vitest (Tests), Biome (Lint/Format)
- YAML-based lint rule configuration
- Anthropic API (Claude) for AI-powered linting

## Commands

```bash
npm run build          # Build with tsup
npm run check          # Biome lint + format check
npm test               # Unit tests (mocked)
npm run dev            # Run CLI via tsx (no build needed)
```

## Project Structure

```
src/
  cli.ts                # CLI entry (commander)
  config-loader.ts      # YAML loading + JSON Schema validation
  file-resolver.ts      # File glob resolution (--all, --changed, explicit)
  rule-matcher.ts       # Match files to applicable rules
  anthropic-client.ts   # Anthropic API calls with retry
  linter-engine.ts      # Orchestration: files x rules -> results
  cache-manager.ts      # Content-hash based result caching
  reporter.ts           # Console output formatting
  types.ts              # All TypeScript interfaces
  schema.json           # JSON Schema for .ai-linter.yml
__test-data__/          # YAML fixtures for config-loader tests
docs/adr/               # Architecture Decision Records
```

## Conventions

- Config file: `.ai-linter.yml` (validated against `src/schema.json`)
- Cache directory: `.ai-linter/cache.json`
- Tests: unit tests with vitest, mocked Anthropic API
- English language in UI texts and prompts
