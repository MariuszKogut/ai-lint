# ai-linter

AI-powered code linter with custom YAML rules. Define your own lint rules as natural-language prompts, and let Claude analyze your code against them.

## Installation

```bash
npm install
npm run build
npm link  # makes 'ai-linter' globally available
```

## Setup

Set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Quick Start

1. Create a `.ai-linter.yml` in your project root:

```yaml
model: haiku
concurrency: 5
git_base: main

rules:
  - id: no_console_log
    name: "No console.log in production code"
    severity: error
    glob: "src/**/*.ts"
    exclude: "src/**/*.test.ts"
    prompt: |
      Check if this file contains console.log statements.
      Logging should use a proper logger, not console.log.

  - id: test_assertions
    name: "Tests must have assertions"
    severity: warning
    glob: "src/**/*.test.ts"
    prompt: |
      Check if every test (it/test block) has at least one expect() call.
      Tests without assertions are useless.
```

2. Run the linter:

```bash
# Lint all files matching rule globs
ai-linter lint --all

# Lint only git-changed files (compared to main branch)
ai-linter lint --changed

# Lint specific files
ai-linter lint src/foo.ts src/bar.ts

# Use a custom config file
ai-linter lint --all --config my-rules.yml

# Override git base branch
ai-linter lint --changed --base develop
```

## Commands

### `ai-linter lint`

Run lint rules against files.

```
ai-linter lint [files...]
  --all              Lint all files matching rule globs
  --changed          Lint only git-changed files (vs git_base)
  --base <branch>    Override git_base branch
  --config <path>    Config file path (default: .ai-linter.yml)
```

Exit codes:
- `0` — all rules passed (or only warnings)
- `1` — at least one error
- `2` — configuration or runtime error

### `ai-linter validate`

Validate your config file against the JSON schema without running any lints.

```
ai-linter validate
  --config <path>    Config file path (default: .ai-linter.yml)
```

This checks:
- YAML syntax
- JSON Schema conformance (valid fields, types, enums)
- Unique rule IDs
- Required fields (`id`, `name`, `severity`, `glob`, `prompt`)
- Valid severity values (`error`, `warning`)
- Valid model values (`haiku`, `sonnet`, `opus`)
- Rule ID format (snake_case: `^[a-z][a-z0-9_]*$`)

Example output:

```
$ ai-linter validate
Configuration is valid
  Model: haiku
  Concurrency: 5
  Git base: main
  Rules: 3 (no_console_log, test_assertions, max_complexity)
```

### `ai-linter cache clear`

Delete the lint result cache.

```
ai-linter cache clear
```

### `ai-linter cache status`

Show cache statistics (number of entries, size on disk).

```
ai-linter cache status
```

## Config Reference

The config file (`.ai-linter.yml`) is validated against a JSON schema (`src/schema.json`).

### Top-level fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `"haiku"` \| `"sonnet"` \| `"opus"` | `"haiku"` | Default Claude model for all rules |
| `concurrency` | `number` (1–20) | `5` | Max parallel API calls |
| `git_base` | `string` | `"main"` | Base branch for `--changed` mode |
| `rules` | `array` | *(required)* | List of lint rules |

### Rule fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | yes | Unique identifier (snake_case) |
| `name` | `string` | yes | Human-readable display name |
| `severity` | `"error"` \| `"warning"` | yes | Severity level |
| `glob` | `string` | yes | Glob pattern for file matching |
| `exclude` | `string` | no | Glob pattern to exclude files |
| `prompt` | `string` | yes | Natural-language lint instruction |
| `model` | `"haiku"` \| `"sonnet"` \| `"opus"` | no | Override the default model |

## How It Works

1. **Config loading** — reads `.ai-linter.yml` and validates it against the JSON schema
2. **File resolution** — resolves files via `--all` (glob), `--changed` (git diff), or explicit paths
3. **Rule matching** — for each file, finds all rules whose `glob` matches and `exclude` doesn't
4. **Caching** — checks if (file content hash + rule prompt hash) is already cached; skips API calls for cached results
5. **AI linting** — sends each (file, rule) pair to the Anthropic API; Claude responds with `{ pass, message, line }`
6. **Reporting** — groups violations by file and prints them to the console

## Caching

Results are cached in `.ai-linter/cache.json` based on:
- SHA-256 hash of the file content
- SHA-256 hash of the rule prompt

The cache is automatically invalidated when either the file or the prompt changes. Use `ai-linter cache clear` to force a fresh run.

## Development

```bash
npm run build          # Build with tsup
npm run check          # Biome lint + format check
npm test               # Unit tests
npm run dev            # Run CLI directly via tsx
```

## License

MIT
