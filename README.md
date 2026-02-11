# ai-lint

AI-powered code linter with custom YAML rules. Define your own lint rules as natural-language prompts, and let AI models analyze your code against them. Uses [OpenRouter](https://openrouter.ai/) to access Gemini, Claude, GPT and other models.

## Why?

AI coding assistants are incredibly productive — but they make mistakes. They introduce business logic into route handlers, leak internal error details to users, create god functions, or forget to use parameterized queries. Traditional linters can't catch these semantic and architectural violations because they don't understand intent.

**ai-lint lets you control AI with AI.** Write the rules that matter to your codebase in plain English, and let a language model enforce them on every commit. It catches exactly the kind of "smart but sloppy" mistakes that slip through code review.

The rules are especially powerful when generated with tools like [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or similar AI coding assistants. Describe what you want to enforce, let the AI draft the rule — done. When you encounter false positives (e.g. a FAQ page that legitimately contains error messages), just refine the `exclude` pattern or make the prompt more specific. The feedback loop is fast because the rules are just YAML and natural language.

## Installation

```bash
# Clone and install
git clone https://github.com/Handmade-Systems/tool-ai-linter.git
cd tool-ai-linter
npm install
npm run build

# Make globally available
npm link
```

Or install directly from npm:

```bash
npm install -g ai-lint
```

### Requirements

- Node.js 20+
- An [OpenRouter](https://openrouter.ai/) API key
- A git repository (for `--changed` mode and `.gitignore` filtering)

## Setup

ai-lint uses [OpenRouter](https://openrouter.ai/) as API gateway. This gives you access to multiple models (Gemini, Claude, GPT, etc.) with a single API key.

1. Create an account at [openrouter.ai](https://openrouter.ai/)
2. Generate an API key under [Keys](https://openrouter.ai/keys)
3. Set the key as environment variable:

```bash
export OPEN_ROUTER_KEY=sk-or-v1-...
```

Or create a `.env` file in your project root:

```
OPEN_ROUTER_KEY=sk-or-v1-...
```

### .gitignore

Add these entries to your project's `.gitignore`:

```gitignore
# ai-lint cache (regenerated automatically)
.ai-linter/

# Environment variables with API keys
.env
```

## Quick Start

1. Create a `.ai-linter.yml` in your project root:

```yaml
model: gemini-flash    # default, cheapest option
concurrency: 5
git_base: main

rules:
  - id: no_logic_in_routes
    name: "No business logic in route handlers"
    severity: error
    glob: "src/routes/**/*.ts"
    prompt: |
      Check if this route handler contains business logic.
      Route handlers should only: parse the request, call a service/use-case,
      and return a response. Any validation logic, data transformation,
      database queries, or conditional business rules should live in a
      separate service layer. Flag if you see more than trivial
      request/response mapping.

  - id: no_direct_db_in_components
    name: "React components must not access the database directly"
    severity: error
    glob: "src/components/**/*.tsx"
    prompt: |
      Check if this React component imports or calls database clients
      directly (e.g. prisma, drizzle, knex, mongoose, sql, pool.query).
      Data fetching should happen in server actions, API routes, or
      dedicated data-access layers — never inside component code.

  - id: error_messages_no_internals
    name: "User-facing errors must not leak internals"
    severity: error
    glob: "src/**/*.ts"
    exclude: "src/**/*.test.ts"
    prompt: |
      Check if error messages returned to the client expose internal
      details like stack traces, database table names, internal file paths,
      SQL queries, or third-party service URLs. User-facing error responses
      should contain generic messages. Internal details should only be logged
      server-side.
```

2. Run the linter:

```bash
# Lint all files matching rule globs
ai-lint lint --all

# Lint only git-changed files (compared to main branch)
ai-lint lint --changed

# Lint specific files
ai-lint lint src/foo.ts src/bar.ts

# Use a custom config file
ai-lint lint --all --config my-rules.yml

# Override git base branch
ai-lint lint --changed --base develop

# Verbose mode (show API vs cache per check)
ai-lint lint --all --verbose
```

3. Generate rules interactively:

```bash
ai-lint generate-rule
# Describe what the rule should check:
# > Ensure all API endpoints validate request bodies with zod
```

## Writing Rules with AI

The best way to create rules is with an AI coding assistant like Claude Code:

1. **Describe the problem:** "We keep getting PRs where route handlers contain database queries directly"
2. **Let the AI draft the rule:** It generates the YAML with id, glob pattern, and prompt
3. **Test it:** Run `ai-lint lint --all` and check the results
4. **Refine on false positives:** If a file like `src/pages/faq.tsx` is flagged incorrectly, add an `exclude` pattern or make the prompt more specific (e.g. "Ignore files that only contain static content")

This feedback loop is fast because rules are just YAML and natural language — no AST visitors, no plugin APIs, no compilation step.

## Commands

### `ai-lint lint`

Run lint rules against files.

```
ai-lint lint [files...]
  --all              Lint all files matching rule globs
  --changed          Lint only git-changed files (vs git_base)
  --base <branch>    Override git_base branch
  --config <path>    Config file path (default: .ai-linter.yml)
  --verbose          Show detailed progress (API vs cache per check)
```

Exit codes:
- `0` — all rules passed (or only warnings)
- `1` — at least one error
- `2` — configuration or runtime error

### `ai-lint validate`

Validate your config file against the JSON schema without running any lints.

```
ai-lint validate
  --config <path>    Config file path (default: .ai-linter.yml)
```

### `ai-lint generate-rule`

Interactively generate a new lint rule using AI. Describes your intent in plain English, and the AI creates the YAML rule for you. Appends it to your config file after confirmation.

### `ai-lint cache clear`

Delete the lint result cache.

### `ai-lint cache status`

Show cache statistics (number of entries, size on disk).

## Config Reference

The config file (`.ai-linter.yml`) is validated against a JSON schema (`src/schema.json`).

### Top-level fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `"gemini-flash"` \| `"haiku"` \| `"sonnet"` \| `"opus"` | `"gemini-flash"` | Default AI model for all rules |
| `concurrency` | `number` (1-20) | `5` | Max parallel API calls |
| `git_base` | `string` | `"main"` | Base branch for `--changed` mode |
| `rules` | `array` | *(required)* | List of lint rules |

### Available models

| Model | OpenRouter ID | Cost (Input/Output per 1M tokens) | Best for |
|-------|--------------|------|----------|
| `gemini-flash` | `google/gemini-2.5-flash` | $0.15 / $0.60 | Default — fast, cheap, good at code |
| `haiku` | `anthropic/claude-haiku-4.5` | $1.00 / $5.00 | Higher quality, 10x more expensive |
| `sonnet` | `anthropic/claude-sonnet-4.5` | $3.00 / $15.00 | Best quality for complex rules |
| `opus` | `anthropic/claude-opus-4.6` | $15.00 / $75.00 | Overkill for linting, but available |

### Rule fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | yes | Unique identifier (snake_case) |
| `name` | `string` | yes | Human-readable display name |
| `severity` | `"error"` \| `"warning"` | yes | Severity level |
| `glob` | `string` | yes | Glob pattern for file matching |
| `exclude` | `string` | no | Glob pattern to exclude files |
| `prompt` | `string` | yes | Natural-language lint instruction |
| `model` | `"gemini-flash"` \| `"haiku"` \| `"sonnet"` \| `"opus"` | no | Override the default model for this rule |

## How It Works

1. **Config loading** — reads `.ai-linter.yml` and validates it against the JSON schema
2. **File resolution** — resolves files via `--all` (glob), `--changed` (git diff), or explicit paths; respects `.gitignore`
3. **Rule matching** — for each file, finds all rules whose `glob` matches and `exclude` doesn't
4. **Caching** — checks if (file content hash + rule prompt hash) is already cached; skips API calls for cached results
5. **AI linting** — sends each (file, rule) pair via OpenRouter to the configured AI model, which responds with `{ pass, message, line }`
6. **Reporting** — groups violations by file and prints them to the console

## Caching

Results are cached in `.ai-linter/cache.json` based on:
- SHA-256 hash of the file content
- SHA-256 hash of the rule prompt

The cache is automatically invalidated when either the file or the prompt changes. Use `ai-lint cache clear` to force a fresh run.

## Example Rules

These rules show the kind of architectural and semantic checks that traditional linters can't enforce — the sweet spot for an AI linter.

### Architecture & Separation of Concerns

```yaml
- id: no_logic_in_routes
  name: "No business logic in route handlers"
  severity: error
  glob: "src/routes/**/*.ts"
  prompt: |
    Check if this route handler contains business logic.
    Route handlers should only: parse the request, call a service/use-case,
    and return a response. Any validation logic, data transformation,
    database queries, or conditional business rules should live in a
    separate service layer. Flag if you see more than trivial
    request/response mapping.

- id: no_direct_db_in_components
  name: "React components must not access the database directly"
  severity: error
  glob: "src/components/**/*.tsx"
  prompt: |
    Check if this React component imports or calls database clients
    directly (e.g. prisma, drizzle, knex, mongoose, sql, pool.query).
    Data fetching should happen in server actions, API routes, or
    dedicated data-access layers — never inside component code.
```

### Security

```yaml
- id: error_messages_no_internals
  name: "User-facing errors must not leak internals"
  severity: error
  glob: "src/**/*.ts"
  exclude: "src/**/*.test.ts"
  prompt: |
    Check if error messages returned to the client expose internal
    details like stack traces, database table names, internal file paths,
    SQL queries, or third-party service URLs. User-facing error responses
    should contain generic messages. Internal details should only be logged
    server-side.

- id: no_secrets_in_code
  name: "No hardcoded secrets or credentials"
  severity: error
  glob: "src/**/*.{ts,tsx}"
  prompt: |
    Check if this file contains hardcoded secrets, API keys, passwords,
    tokens, or connection strings. Look for patterns like long random
    strings assigned to variables named key, secret, token, password,
    or authorization headers with Bearer tokens. Environment variables
    via process.env are fine.
```

### Code Quality

```yaml
- id: no_god_functions
  name: "Functions should not exceed reasonable complexity"
  severity: warning
  glob: "src/**/*.ts"
  exclude: "src/**/*.test.ts"
  prompt: |
    Check if any function in this file is excessively complex.
    Signs: more than 4 levels of nesting, more than 5 early returns,
    mixing multiple concerns in one function body, or functions longer
    than ~60 lines. Suggest splitting if found.

- id: no_raw_sql_strings
  name: "Use query builder or parameterized queries"
  severity: error
  glob: "src/**/*.ts"
  prompt: |
    Check if this file constructs SQL queries by concatenating or
    interpolating strings. All database queries should use parameterized
    queries or a query builder (e.g. Prisma, Drizzle, Knex). Template
    literals with ${} inside SQL strings are a red flag.
```

## Development

```bash
npm run build          # Build with tsup
npm run check          # Biome lint + format check
npm test               # Unit tests
npm run test:coverage  # Tests with coverage report
npm run dev            # Run CLI directly via tsx
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## Support

If you find this tool useful, consider supporting development:

[Buy Me a Coffee](https://buymeacoffee.com/mariuszk)

## License

MIT
