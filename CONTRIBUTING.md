# Contributing to ai-lint

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/MariuszKogut/tool-ai-linter.git
cd tool-ai-linter
npm install
```

You'll need an [OpenRouter](https://openrouter.ai/) API key for system tests (unit tests use mocks):

```bash
export OPEN_ROUTER_KEY=sk-or-v1-...
```

## Commands

```bash
npm run build          # Build with tsup
npm run check          # Biome lint + format check
npm test               # Unit tests (mocked, no API key needed)
npm run test:coverage  # Tests with coverage report
npm run test:system    # System tests (requires API key)
npm run dev            # Run CLI directly via tsx
```

## Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting. Run `npm run check` before committing. The CI pipeline will reject PRs that don't pass.

No Prettier, no ESLint — just Biome.

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure `npm run check` and `npm test` pass
4. Push and open a PR against `main`
5. CI must be green before merging

## Project Structure

```
src/
  cli.ts                # CLI entry (commander)
  config-loader.ts      # YAML loading + JSON Schema validation
  file-resolver.ts      # File glob resolution (--all, --changed, explicit)
  rule-matcher.ts       # Match files to applicable rules
  anthropic-client.ts   # OpenRouter API calls with retry
  linter-engine.ts      # Orchestration: files x rules -> results
  cache-manager.ts      # Content-hash based result caching
  reporter.ts           # Console output formatting
  rule-generator.ts     # Interactive AI rule generation
  types.ts              # All TypeScript interfaces
  schema.json           # JSON Schema for .ai-linter.yml
```

## Adding New Models

To add a new model, update:
1. `src/types.ts` — add to the `Model` type
2. `src/anthropic-client.ts` — add OpenRouter model ID to `MODEL_MAP`
3. `src/schema.json` — add to both `model` enum arrays
4. `README.md` — update the model table

## Writing Rules

See the [README](README.md) for examples. Rules are YAML with a natural-language prompt — no AST knowledge required.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
