# 🤖 ai-lint

AI-powered code linter with custom YAML rules. Write your rules in plain English, pick an AI model, and let it review your code. Works with Gemini, Claude, GPT and more via [OpenRouter](https://openrouter.ai/).

## 💡 Why?

AI coding assistants are awesome — but they make mistakes. They shove business logic into route handlers, leak stack traces to users, create god functions, or forget parameterized queries. Traditional linters can't catch these because they don't understand *intent*.

**ai-lint lets you control AI with AI.** Write the rules that matter to *your* codebase in plain English, and let a language model enforce them on every commit. It catches exactly the kind of "smart but sloppy" mistakes that slip through code review.

The rules are especially powerful when generated with tools like [Claude Code](https://docs.anthropic.com/en/docs/claude-code) or similar AI coding assistants. Describe what you want to enforce, let the AI draft the rule — done. When you run into false positives (e.g. a FAQ page that legitimately mentions error messages), just tweak the `exclude` pattern or make the prompt more specific. The feedback loop is fast because rules are just YAML and natural language.

## 📦 Installation

```bash
npm i -g @handmade-systems/ai-lint
```

Or clone and build locally:

```bash
git clone https://github.com/MariuszKogut/ai-lint.git
cd ai-lint
npm install && npm run build
npm link   # makes ai-lint available globally
```

### Requirements

- Node.js 20+
- An [OpenRouter](https://openrouter.ai/) API key
- A git repo (for `--changed` mode and `.gitignore` filtering)

## 🔑 Setup

ai-lint uses [OpenRouter](https://openrouter.ai/) as API gateway — one key, all models.

1. Create an account at [openrouter.ai](https://openrouter.ai/)
2. Grab an API key from [Keys](https://openrouter.ai/keys)
3. Set it:

```bash
export OPEN_ROUTER_KEY=sk-or-v1-...
```

Or drop a `.env` file in your project root:

```
OPEN_ROUTER_KEY=sk-or-v1-...
```

## 🚀 Quick Start

**1.** Create a `.ai-lint.yml` in your project root:

```yaml
model: gemini-flash    # cheapest and fastest
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
      and return a response. Any validation, data transformation,
      database queries, or business rules should live in a service layer.

  - id: no_direct_db_in_components
    name: "React components must not access the database"
    severity: error
    glob: "src/components/**/*.tsx"
    prompt: |
      Check if this React component imports or calls database clients
      directly (e.g. prisma, drizzle, knex, mongoose, pool.query).
      Data fetching belongs in server actions, API routes, or
      dedicated data-access layers — not in component code.

  - id: error_messages_no_internals
    name: "Don't leak internals in error messages"
    severity: error
    glob: "src/**/*.ts"
    exclude: "src/**/*.test.ts"
    prompt: |
      Check if error messages returned to the client expose internal
      details like stack traces, table names, file paths, SQL queries,
      or service URLs. User-facing errors should be generic.
      Internal details belong in server-side logs only.
```

**2.** Add these to your `.gitignore`:

```gitignore
# ai-lint cache (auto-generated)
.ai-lint/

# API keys
.env
```

**3.** Run it:

```bash
# Lint everything
ai-lint lint --all

# Only git-changed files (compared to main)
ai-lint lint --changed

# Specific files
ai-lint lint src/foo.ts src/bar.ts

# Verbose mode — shows API vs cache per check
ai-lint lint --all --verbose
```

**4.** Generate rules interactively:

```bash
ai-lint generate-rule
# > Ensure all API endpoints validate request bodies with zod
```

## ✍️ Writing Rules with AI

The best way to create rules is with an AI coding assistant like Claude Code:

1. **Describe the problem:** "We keep getting PRs where route handlers contain database queries directly"
2. **Let the AI draft the rule** — it generates the YAML with id, glob pattern, and prompt
3. **Test it:** `ai-lint lint --all`
4. **Refine on false positives:** If `src/pages/faq.tsx` gets flagged incorrectly, add an `exclude` pattern or make the prompt more specific (e.g. "Ignore files that only contain static content")

No AST visitors, no plugin APIs, no compilation step — just YAML and natural language. 🎯

## 📋 Commands

### `ai-lint lint`

```
ai-lint lint [files...]
  --all              Lint all files matching rule globs
  --changed          Lint only git-changed files (vs git_base)
  --base <branch>    Override git_base branch
  --config <path>    Config file (default: .ai-lint.yml)
  --verbose          Show API vs cache per check
```

Exit codes: `0` = all passed, `1` = errors found, `2` = config/runtime error

### `ai-lint validate`

Check your config file without running any lints.

```
ai-lint validate
  --config <path>    Config file (default: .ai-lint.yml)
```

### `ai-lint generate-rule`

Interactively generate a new rule with AI. Describe what to check, get YAML back, confirm to append. Creates the config file if it doesn't exist yet.

```
ai-lint generate-rule
  --config <path>    Config file (default: .ai-lint.yml)
```

### `ai-lint cache clear`

Delete the result cache.

### `ai-lint cache status`

Show cache statistics (entries, size on disk).

## ⚙️ Config Reference

Config file: `.ai-lint.yml` (validated against a JSON schema)

### Top-level

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `model` | `"gemini-flash"` \| `"haiku"` \| `"sonnet"` \| `"opus"` | `"gemini-flash"` | AI model for all rules |
| `concurrency` | `1-20` | `5` | Max parallel API calls |
| `git_base` | `string` | `"main"` | Base branch for `--changed` |
| `rules` | `array` | *(required)* | Your lint rules |

### 🏷️ Models

| Model | OpenRouter ID | Cost (in/out per 1M tokens) | Best for |
|-------|--------------|------|----------|
| `gemini-flash` | `google/gemini-2.5-flash` | $0.15 / $0.60 | Default — fast, cheap, solid 🏃 |
| `haiku` | `anthropic/claude-haiku-4.5` | $1.00 / $5.00 | Higher quality, 10x pricier |
| `sonnet` | `anthropic/claude-sonnet-4.5` | $3.00 / $15.00 | Best quality for tricky rules |
| `opus` | `anthropic/claude-opus-4.6` | $15.00 / $75.00 | Overkill, but available 🤷 |

### Rule fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | yes | Unique ID (snake_case) |
| `name` | `string` | yes | Human-readable name |
| `severity` | `"error"` \| `"warning"` | yes | Severity level |
| `glob` | `string` | yes | File matching pattern |
| `exclude` | `string` | no | Files to skip |
| `prompt` | `string` | yes | What to check (natural language) |
| `model` | model string | no | Override model for this rule |

## 🔧 How It Works

1. **Config** — loads `.ai-lint.yml`, validates against JSON schema
2. **Files** — resolves via `--all` (glob), `--changed` (git diff), or explicit paths; respects `.gitignore`
3. **Matching** — finds rules whose `glob` matches and `exclude` doesn't
4. **Cache** — skips API calls if (file hash + prompt hash) is already cached
5. **AI** — sends each (file, rule) pair to the AI model via OpenRouter
6. **Report** — groups violations by file, prints to console

## 💾 Caching

Results are cached in `.ai-lint/cache.json` based on SHA-256 hashes of file content and rule prompt. Cache auto-invalidates when either changes. Force a fresh run with `ai-lint cache clear`.

## 📝 Example Rules

These are the kinds of checks that traditional linters simply can't do — architectural and semantic rules that require understanding intent.

### 🏗️ Architecture

```yaml
- id: no_logic_in_routes
  name: "No business logic in route handlers"
  severity: error
  glob: "src/routes/**/*.ts"
  prompt: |
    Check if this route handler contains business logic.
    Route handlers should only: parse the request, call a service,
    and return a response. Anything else belongs in a service layer.

- id: no_direct_db_in_components
  name: "React components must not access the database"
  severity: error
  glob: "src/components/**/*.tsx"
  prompt: |
    Check if this React component imports or calls database clients
    directly. Data fetching belongs in server actions, API routes,
    or data-access layers — not in component code.
```

### 🔒 Security

```yaml
- id: error_messages_no_internals
  name: "Don't leak internals in error messages"
  severity: error
  glob: "src/**/*.ts"
  exclude: "src/**/*.test.ts"
  prompt: |
    Check if error messages returned to the client expose internal
    details like stack traces, table names, file paths, SQL queries,
    or service URLs. User-facing errors should be generic.

- id: no_secrets_in_code
  name: "No hardcoded secrets"
  severity: error
  glob: "src/**/*.{ts,tsx}"
  prompt: |
    Check for hardcoded secrets, API keys, passwords, tokens, or
    connection strings. Environment variables via process.env are fine.
```

### 🧹 Code Quality

```yaml
- id: no_god_functions
  name: "Functions shouldn't be god functions"
  severity: warning
  glob: "src/**/*.ts"
  exclude: "src/**/*.test.ts"
  prompt: |
    Check if any function is excessively complex: more than 4 nesting
    levels, more than 5 early returns, mixed concerns, or 60+ lines.
    Suggest splitting if found.

- id: no_raw_sql_strings
  name: "Use parameterized queries"
  severity: error
  glob: "src/**/*.ts"
  prompt: |
    Check if SQL queries are built by concatenating or interpolating
    strings. Use parameterized queries or a query builder instead.
    Template literals with ${} inside SQL are a red flag.
```

## 🛠️ Development

```bash
npm run build          # Build with tsup
npm run check          # Biome lint + format check
npm test               # Unit tests
npm run test:coverage  # Tests with coverage report
npm run dev            # Run CLI via tsx
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, code style, and PR guidelines.

## ☕ Support

If ai-lint saves you time, consider buying me a coffee:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-☕-yellow)](https://buymeacoffee.com/mariuszk)

## 📄 License

MIT
