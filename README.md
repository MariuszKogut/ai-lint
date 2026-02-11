# ai-linter

AI-powered code linter with custom YAML rules. Define your own lint rules as natural-language prompts, and let AI models analyze your code against them. Uses [OpenRouter](https://openrouter.ai/) to access Gemini, Claude, GPT and other models.

## Installation

```bash
npm install
npm run build
npm link  # makes 'ai-linter' globally available
```

## Setup

ai-linter uses [OpenRouter](https://openrouter.ai/) as API gateway. This gives you access to multiple models (Gemini, Claude, GPT, etc.) with einem einzigen API key.

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
- Valid model values (`gemini-flash`, `haiku`, `sonnet`, `opus`)
- Rule ID format (snake_case: `^[a-z][a-z0-9_]*$`)

Example output:

```
$ ai-linter validate
Configuration is valid
  Model: gemini-flash
  Concurrency: 5
  Git base: main
  Rules: 3 (no_logic_in_routes, no_direct_db_in_components, error_messages_no_internals)
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
| `model` | `"gemini-flash"` \| `"haiku"` \| `"sonnet"` \| `"opus"` | `"gemini-flash"` | Default AI model for all rules |
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
| `model` | `"gemini-flash"` \| `"haiku"` \| `"sonnet"` \| `"opus"` | no | Override the default model |

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

- id: single_responsibility_service
  name: "Services should have a single domain"
  severity: warning
  glob: "src/services/**/*.ts"
  prompt: |
    Check if this service file mixes multiple unrelated domains.
    A UserService should not contain order logic. A PaymentService
    should not send emails directly. If the file handles more than
    one clear domain, flag it.
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

- id: meaningful_variable_names
  name: "No cryptic abbreviations in domain code"
  severity: warning
  glob: "src/**/*.ts"
  exclude: "src/**/*.test.ts"
  prompt: |
    Check if this file uses cryptic variable or function names like
    mgr, proc, tmp, val, cb, fn, res (outside of route handlers),
    or single-letter names outside of short lambdas and loop indices.
    Domain code should use descriptive names.

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

### Testing

```yaml
- id: test_describes_behavior
  name: "Test names should describe behavior, not implementation"
  severity: warning
  glob: "src/**/*.test.ts"
  prompt: |
    Check if the test descriptions (describe/it/test strings) describe
    user-visible behavior or outcomes rather than implementation details.
    Bad: "should call handleSubmit", "should set state to loading".
    Good: "should show error message when email is invalid",
    "should redirect to dashboard after login".

- id: no_test_interdependence
  name: "Tests must not depend on execution order"
  severity: error
  glob: "src/**/*.test.ts"
  prompt: |
    Check if tests in this file share mutable state across test cases
    without proper setup/teardown. Look for: module-level let variables
    mutated inside tests, missing beforeEach resets, or tests that only
    pass when run after another specific test. Each test should be
    independently runnable.
```

## How It Works

1. **Config loading** — reads `.ai-linter.yml` and validates it against the JSON schema
2. **File resolution** — resolves files via `--all` (glob), `--changed` (git diff), or explicit paths
3. **Rule matching** — for each file, finds all rules whose `glob` matches and `exclude` doesn't
4. **Caching** — checks if (file content hash + rule prompt hash) is already cached; skips API calls for cached results
5. **AI linting** — sends each (file, rule) pair via OpenRouter to the configured AI model, which responds with `{ pass, message, line }`
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
