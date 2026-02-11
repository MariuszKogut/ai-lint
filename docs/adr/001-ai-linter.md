# ADR 001 — AI Linter (Full Spec)

**Status:** Accepted
**Datum:** 2026-02-11

---

## 1. Anforderungen

| ID | Anforderung | Prioritaet | Status |
| --- | --- | --- | --- |
| AL-001 | YAML-basierte Lint-Regeln mit Glob-Pattern Matching | Must Have | ⬜ |
| AL-002 | Datei-Level Linting: jede Datei einzeln gegen passende Regeln pruefen | Must Have | ⬜ |
| AL-003 | Git-Modus: nur geaenderte Dateien linten (diff gegen Branch) | Must Have | ⬜ |
| AL-004 | Globaler Modus: alle Dateien linten die zu Regeln matchen | Must Have | ⬜ |
| AL-005 | Expliziter Modus: einzelne Dateien per CLI-Argument angeben | Must Have | ⬜ |
| AL-006 | Content-Hash Caching (SHA-256) — keine Datei doppelt linten | Must Have | ⬜ |
| AL-007 | Cache invalidieren wenn Datei sich aendert | Must Have | ⬜ |
| AL-008 | Cache invalidieren wenn Regel-Prompt sich aendert | Must Have | ⬜ |
| AL-009 | Severity-Levels: error (Exit-Code 1) und warning (Exit-Code 0) | Must Have | ⬜ |
| AL-010 | Styled Terminal-Output (Datei, Severity, Regel, Beschreibung) | Must Have | ⬜ |
| AL-011 | Parallele API-Calls mit konfigurierbarem Concurrency-Limit | Must Have | ⬜ |
| AL-012 | Anthropic API als Backend (direkt, kein CLI) | Must Have | ⬜ |
| AL-013 | Config-Validierung per JSON Schema | Should Have | ⬜ |
| AL-014 | Exclude-Pattern pro Regel (z.B. Test-Dateien ausschliessen) | Should Have | ⬜ |
| AL-015 | Model-Override pro Regel (z.B. Haiku fuer einfache, Sonnet fuer komplexe Regeln) | Should Have | ⬜ |
| AL-016 | Cache-Management CLI (clear, status) | Should Have | ⬜ |

---

## 2. Entscheidungen

| # | Frage | Entscheidung |
| --- | --- | --- |
| 1 | Regel-Format? | **YAML-Datei** — `.ai-linter.yml` im Projekt-Root. Passt zum bestehenden YAML-Stack. |
| 2 | AI-Backend? | **Nur API (kein CLI)** — Anthropic SDK direkt. Schneller, mehr Kontrolle, keine CLI-Dependency. |
| 3 | Cache-Strategie? | **Content-Hash (SHA-256)** — SHA-256 des Dateiinhalts + Regel-Prompt-Hash. Absolut zuverlaessig. |
| 4 | Auto-Fix? | **Nein, nur Report** — Linter meldet Probleme mit Beschreibung und Severity. Kein Code-Eingriff. |
| 5 | Regel-Scope? | **Datei + Glob-Pattern** — Regeln matchen per Glob auf Dateien. Kein Cross-File-Kontext. |
| 6 | Output-Format? | **Styled Terminal** — Farbige Ausgabe mit chalk. Kein JSON/HTML/SARIF in v1. |
| 7 | Severity? | **error + warning** — Errors setzen Exit-Code 1, Warnings nur informativ (Exit-Code 0). |
| 8 | API Provider? | **Anthropic API (Claude)** — `@anthropic-ai/sdk`. Haiku fuer Speed, Sonnet fuer Qualitaet. |
| 9 | Git-Modus? | **Diff gegen Branch** — `git diff --name-only <base>...HEAD`. Default-Base aus Config, ueberschreibbar per `--base`. |
| 10 | Parallelitaet? | **Ja, mit Concurrency-Limit** — `p-limit` mit konfigurierbarem Limit (Default: 5). |
| 11 | Cache-Ort? | **`.ai-linter/` im Projekt** — Pro-Projekt isoliert, in `.gitignore`. |
| 12 | Presets/Extends? | **Nein** — Jedes Projekt definiert eigene Regeln. Kein Import, keine Abhaengigkeiten. |
| 13 | Code-Stil? | **Klassen bevorzugen** — Module als Klassen statt Dateien mit vielen losen Funktionen. Bessere Kapselung, Testbarkeit (Dependency Injection), klare Verantwortlichkeiten. |

---

## 3. Config-Format (`.ai-linter.yml`)

```yaml
model: haiku                     # Default-Modell (haiku | sonnet | opus)
concurrency: 5                   # Max parallele API-Calls
git_base: main                   # Branch fuer --changed Modus

rules:
  - id: no_logic_in_routes
    name: "No business logic in route files"
    severity: error
    glob: "src/routes/**/*.ts"
    prompt: |
      This file is a route handler. It should only contain:
      - Route definitions
      - Input validation
      - Calling service functions
      - Returning responses
      It must NOT contain business logic, database queries,
      or complex transformations.

  - id: max_file_length
    name: "File should not exceed 300 lines"
    severity: warning
    glob: "src/**/*.ts"
    prompt: |
      Check if this file exceeds 300 lines.
      If so, suggest how it could be split.

  - id: no_console_log
    name: "No console.log in production code"
    severity: error
    glob: "src/**/*.{ts,tsx}"
    exclude: "src/**/*.test.*"
    prompt: |
      Check if this file contains console.log statements
      that are not wrapped in a debug/development condition.
```

### JSON Schema Validierung

| Feld | Typ | Required | Constraint |
| --- | --- | --- | --- |
| `model` | string | Nein | Enum: `haiku`, `sonnet`, `opus`. Default: `haiku` |
| `concurrency` | number | Nein | Min: 1, Max: 20. Default: 5 |
| `git_base` | string | Nein | Default: `main` |
| `rules` | array | Ja | Min: 1 Regel |
| `rules[].id` | string | Ja | Pattern: `^[a-z][a-z0-9_]*$`, unique |
| `rules[].name` | string | Ja | Display-Name |
| `rules[].severity` | string | Ja | Enum: `error`, `warning` |
| `rules[].glob` | string | Ja | Glob-Pattern fuer Datei-Matching |
| `rules[].exclude` | string | Nein | Glob-Pattern zum Ausschliessen |
| `rules[].prompt` | string | Ja | AI-Prompt fuer diese Regel |
| `rules[].model` | string | Nein | Override Default-Modell |

---

## 4. CLI Interface

```bash
# Einzelne Dateien linten (gegen alle passenden Regeln)
ai-linter lint src/routes/user.ts src/routes/auth.ts

# Alle Dateien die zu mindestens einer Regel matchen
ai-linter lint --all

# Nur geaenderte Dateien (git diff gegen Branch)
ai-linter lint --changed                  # diff gegen git_base aus Config
ai-linter lint --changed --base=develop   # custom Branch

# Config validieren
ai-linter validate

# Cache verwalten
ai-linter cache clear
ai-linter cache status
```

### Exit-Codes

| Code | Bedeutung |
| --- | --- |
| 0 | Alle Regeln bestanden (oder nur Warnings) |
| 1 | Mindestens ein Error gefunden |
| 2 | Config-Fehler oder interner Fehler |

---

## 5. Architektur

### Projektstruktur

```
src/
  cli.ts                  # Commander CLI (lint, validate, cache)
  config-loader.ts        # YAML laden + JSON-Schema validieren
  rule-matcher.ts         # Glob-Pattern → Dateien matchen
  file-resolver.ts        # Git-Diff + Glob → finale Dateiliste
  cache-manager.ts        # SHA-256 Hash Cache (.ai-linter/cache.json)
  linter-engine.ts        # Orchestrierung: Match → Filter → Lint → Report
  anthropic-client.ts     # Anthropic SDK Wrapper (Lint-Prompt bauen + senden)
  reporter.ts             # Styled Terminal-Output (chalk)
  types.ts                # Alle TypeScript Interfaces
  schema.json             # JSON Schema fuer .ai-linter.yml

  config-loader.test.ts   # Config laden + validieren
  rule-matcher.test.ts    # Glob-Matching Logik
  file-resolver.test.ts   # Git-Diff + Datei-Aufloesung
  cache-manager.test.ts   # Cache read/write/invalidate
  linter-engine.test.ts   # Orchestrierung + Parallelitaet
  anthropic-client.test.ts # API-Call Mocking
  reporter.test.ts        # Output-Formatierung
  e2e.test.ts             # Full Workflow mit gemocktem API

__test-data__/            # YAML Fixtures + Fake-Quellcode-Dateien
```

### Datenfluss

```
                    .ai-linter.yml
                         |
                    +----v----+
                    | Config   |  Laden + JSON Schema Validieren
                    | Loader   |
                    +----+----+
                         |
         +---------------+---------------+
         |               |               |
    +----v----+    +-----v-----+   +-----v-----+
    |  Rule    |    |   File    |   |  Cache     |
    |  Matcher |    |  Resolver |   |  Manager   |
    | (glob -> |    | (git diff |   | (SHA-256   |
    |  files)  |    |  files)   |   |  lookup)   |
    +----+----+    +-----+-----+   +-----+-----+
         |               |               |
         +---------------+---------------+
                         |
                    +----v----+
                    |  Linter  |  Jobs erstellen
                    |  Engine  |  Cache filtern
                    |          |  Parallel ausfuehren
                    +----+----+
                         |
              +----------+----------+
              |          |          |  p-limit(concurrency)
         +----v--+ +----v--+ +----v--+
         |Anthropic|Anthropic|Anthropic|
         | Client | Client  | Client  |
         +----+--+ +----+--+ +----+--+
              |          |          |
              +----------+----------+
                         |
                    +----v----+
                    | Cache    |  Neue Ergebnisse speichern
                    | Manager  |
                    +----+----+
                         |
                    +----v----+
                    | Reporter |  Styled Terminal Output
                    | (chalk)  |
                    +---------+
```

### Modul-Verantwortlichkeiten (Klassen-basiert)

> **Konvention:** Jedes Modul exportiert eine Klasse statt loser Funktionen. Vorteile: Kapselung, Dependency Injection fuer Tests, klare Verantwortlichkeiten.

| Klasse | Datei | Verantwortung |
| --- | --- | --- |
| `ConfigLoader` | `config-loader.ts` | YAML parsen, JSON Schema validieren, Defaults aufloesen |
| `RuleMatcher` | `rule-matcher.ts` | Fuer eine Datei alle passenden Regeln finden (Glob + Exclude) |
| `FileResolver` | `file-resolver.ts` | Dateiliste bestimmen: explizit, `--all` (Glob), `--changed` (Git Diff) |
| `CacheManager` | `cache-manager.ts` | Cache lesen/schreiben, SHA-256 berechnen, Cache-Key = `rule_id:file_hash:prompt_hash` |
| `LinterEngine` | `linter-engine.ts` | Jobs erstellen, Cache filtern, parallel ausfuehren, Ergebnisse sammeln |
| `AnthropicClient` | `anthropic-client.ts` | Prompt bauen, Anthropic API aufrufen, Response parsen (JSON aus AI-Antwort) |
| `Reporter` | `reporter.ts` | Terminal-Ausgabe: Farben, Gruppierung nach Datei, Summary-Zeile |
| — | `cli.ts` | Commander Setup, instanziiert Klassen und verdrahtet Dependencies |

**Beispiel Dependency Injection:**

```typescript
// cli.ts — Verdrahtung
const config = new ConfigLoader().load('.ai-linter.yml')
const cache = new CacheManager('.ai-linter')
const client = new AnthropicClient(config.model)
const matcher = new RuleMatcher(config.rules)
const resolver = new FileResolver(config.git_base)
const reporter = new Reporter()
const engine = new LinterEngine({ cache, client, matcher, resolver, reporter })

const results = await engine.run(files, config)
```

```typescript
// linter-engine.test.ts — Testbarkeit durch DI
const mockClient = { lint: vi.fn().mockResolvedValue({ pass: true, message: 'OK' }) }
const engine = new LinterEngine({ client: mockClient, ... })
```

---

## 6. Core Types

```typescript
// --- Config Types ---

type Model = 'haiku' | 'sonnet' | 'opus'
type Severity = 'error' | 'warning'

interface LinterConfig {
  model: Model
  concurrency: number
  git_base: string
  rules: LintRule[]
}

interface LintRule {
  id: string           // unique, snake_case
  name: string         // display name
  severity: Severity
  glob: string         // file matching pattern
  exclude?: string     // exclude pattern
  prompt: string       // AI prompt for this rule
  model?: Model        // override default model
}

// --- Execution Types ---

interface LintJob {
  rule: LintRule
  filePath: string
  fileContent: string
  fileHash: string     // SHA-256 of file content
  promptHash: string   // SHA-256 of rule prompt
}

interface LintResult {
  rule_id: string
  rule_name: string
  file: string
  severity: Severity
  pass: boolean
  message: string      // AI explanation
  line?: number        // optional line reference
  duration_ms: number
  cached: boolean      // true if from cache
}

// --- Cache Types ---

interface CacheEntry {
  file_hash: string
  prompt_hash: string
  rule_id: string
  result: LintResult
  timestamp: string    // ISO 8601
}

// Cache-Datei: .ai-linter/cache.json
interface CacheStore {
  version: 1
  entries: Record<string, CacheEntry>  // key: `${rule_id}:${filePath}`
}

// --- Reporter Types ---

interface LintSummary {
  total_files: number
  total_rules_applied: number
  passed: number
  errors: number
  warnings: number
  cached: number
  duration_ms: number
}
```

---

## 7. Anthropic API Integration

### Prompt-Struktur

```
System:
  You are a code linter. Analyze the given file against the provided rule.
  Respond ONLY with a valid JSON object, no additional text.
  Format: { "pass": boolean, "message": string, "line": number | null }
  - "pass": true if the file complies with the rule, false otherwise
  - "message": brief explanation (1-3 sentences). If pass=true, confirm compliance.
    If pass=false, describe the violation.
  - "line": approximate line number of the first violation, or null

User:
  ## Rule: {rule.name}
  {rule.prompt}

  ## File: {filePath}
  ```{ext}
  {fileContent}
  ```
```

### Model Mapping

| Config-Wert | Anthropic Model ID |
| --- | --- |
| `haiku` | `claude-haiku-4-5-20251001` |
| `sonnet` | `claude-sonnet-4-5-20250929` |
| `opus` | `claude-opus-4-6` |

### API-Call Parameter

| Parameter | Wert |
| --- | --- |
| `max_tokens` | 1024 |
| `temperature` | 0 (deterministic) |
| `model` | Aus Config / Regel-Override |

### Error Handling

| Fehler | Verhalten |
| --- | --- |
| 401 Unauthorized | Abbruch mit Hinweis: `ANTHROPIC_API_KEY` pruefen |
| 429 Rate Limited | Retry mit exponential backoff (max 3 Versuche) |
| 500+ Server Error | Retry mit exponential backoff (max 3 Versuche) |
| JSON Parse Error | Result als `pass: false`, Message: "AI response was not valid JSON" |
| Timeout (30s) | Result als `pass: false`, Message: "API call timed out" |

---

## 8. Cache-Strategie

### Cache-Key Berechnung

```
key    = `${rule_id}:${filePath}`
valid  = entry.file_hash === SHA-256(fileContent)
       AND entry.prompt_hash === SHA-256(rule.prompt)
```

Ein Cache-Eintrag ist nur gueltig wenn **sowohl** der Dateiinhalt **als auch** der Regel-Prompt unveraendert sind. Aendert sich der Prompt einer Regel, werden alle betroffenen Dateien neu gelintet.

### Cache-Datei

```
.ai-linter/
  cache.json           # Alle Cache-Eintraege
```

### Cache-Lebenszyklus

1. **Vor dem Lint:** Cache laden, fuer jeden Job pruefen ob gueltiger Eintrag existiert
2. **Cache Hit:** Job ueberspringen, Ergebnis aus Cache nehmen (markiert als `cached: true`)
3. **Cache Miss:** API-Call ausfuehren, Ergebnis in Cache schreiben
4. **Nach dem Lint:** Cache speichern (nur aktuelle Eintraege, verwaiste werden entfernt)

### `.gitignore` Eintrag

```
.ai-linter/
```

---

## 9. Terminal-Output Design

### Einzelne Violation

```
  src/routes/user.ts
    error  no_logic_in_routes  Contains direct database query on line 42.
                               Move to a service function.
    warn   max_file_length     File has 312 lines. Consider splitting into
                               user-queries.ts and user-mutations.ts.
```

### Summary

```
  2 problems (1 error, 1 warning) in 1 file
  12 files checked, 8 cached, 4.2s
```

### Farben (chalk)

| Element | Farbe |
| --- | --- |
| Dateiname | White, bold |
| `error` | Red |
| `warn` | Yellow |
| Rule-ID | Dim/gray |
| Message | Default |
| Summary errors | Red, bold |
| Summary warnings | Yellow, bold |
| "cached" / Timing | Dim/gray |
| "All rules passed" | Green |

---

## 10. Abhaengigkeiten

### Neue Pakete

| Paket | Zweck |
| --- | --- |
| `@anthropic-ai/sdk` | Anthropic API Client |
| `p-limit` | Concurrency-Limiting fuer parallele API-Calls |
| `micromatch` | Glob-Pattern Matching (schnell, feature-rich) |

### Bestehende Pakete (wiederverwendet aus claude-code-workflow)

| Paket | Zweck |
| --- | --- |
| `commander` | CLI Framework |
| `chalk` | Terminal-Farben |
| `yaml` | YAML Parsing |
| `ajv` + `ajv-formats` | JSON Schema Validierung |
| `vitest` | Tests |
| `tsup` | Build |
| `@biomejs/biome` | Lint + Format |
| `tsx` | TypeScript Execution (Dev) |

### Entfernte Pakete (nicht mehr benoetigt)

| Paket | Grund |
| --- | --- |
| `execa` | Kein CLI-Subprocess mehr, direkte API-Calls |
| `ora` | Kein Spinner noetig, Output ist synchron pro Datei |
| `stream-json` | Kein JSON-Streaming von CLI |
| `dotenv` | Kann bleiben oder durch Node 20 `--env-file` ersetzt werden |

---

## 11. Was NICHT im Scope v1 ist

| Feature | Grund |
| --- | --- |
| Auto-Fix | Nur Report. Zu riskant fuer v1, spaeter nachruestbar. |
| HTML/JSON Report | Terminal-Output reicht fuer v1. |
| SARIF Output | GitHub Code Scanning Integration spaeter. |
| Cross-File Regeln | Komplex. Jede Datei wird isoliert geprueft. |
| Presets / Extends | YAGNI. Eigene Regeln pro Projekt genuegen. |
| Inline-Annotations | Kein `// ai-linter-disable` in v1. |
| MCP Integration | Kein MCP-Server in v1. |
| Pre-Commit Hook | Doku reicht: `ai-linter lint --changed` manuell in Hook einbinden. |
| Multi-Provider | Nur Anthropic. Kein OpenAI, kein Ollama in v1. |
| Watch Mode | Kein File-Watcher. Manuell oder per CI ausfuehren. |

---

## 12. Tests

### Unit-Tests

| # | Test | Modul |
| --- | --- | --- |
| 1 | YAML laden + validieren (happy path) | `config-loader` |
| 2 | Fehlende Pflichtfelder → klare Fehlermeldung | `config-loader` |
| 3 | Doppelte Rule-IDs → Fehler | `config-loader` |
| 4 | Ungueltige Severity → Fehler | `config-loader` |
| 5 | Glob-Pattern matcht korrekte Dateien | `rule-matcher` |
| 6 | Exclude-Pattern schliesst Dateien aus | `rule-matcher` |
| 7 | Git Diff liefert geaenderte Dateien | `file-resolver` |
| 8 | `--all` Modus sammelt alle Glob-Matches | `file-resolver` |
| 9 | Explizite Dateien werden gegen passende Regeln gemapped | `file-resolver` |
| 10 | Cache Hit: unveraenderte Datei + Prompt → cached Result | `cache-manager` |
| 11 | Cache Miss: geaenderte Datei → kein Cache Hit | `cache-manager` |
| 12 | Cache Miss: geaenderter Prompt → kein Cache Hit | `cache-manager` |
| 13 | Cache Clear loescht cache.json | `cache-manager` |
| 14 | Cache Status zeigt Anzahl Eintraege + Groesse | `cache-manager` |
| 15 | Anthropic API-Call: happy path → LintResult | `anthropic-client` |
| 16 | Anthropic API-Call: ungueltige JSON-Antwort → pass=false | `anthropic-client` |
| 17 | Anthropic API-Call: Rate Limit → Retry | `anthropic-client` |
| 18 | Linter Engine: Jobs erstellen aus Rules × Files | `linter-engine` |
| 19 | Linter Engine: cached Jobs ueberspringen | `linter-engine` |
| 20 | Linter Engine: Concurrency-Limit einhalten | `linter-engine` |
| 21 | Linter Engine: Exit-Code 1 bei Errors, 0 bei nur Warnings | `linter-engine` |
| 22 | Reporter: korrekte Farben und Formatierung | `reporter` |
| 23 | Reporter: Summary mit Zahlen | `reporter` |

### E2E-Tests (gemockte API)

| # | Test |
| --- | --- |
| 1 | Vollstaendiger Lint-Durchlauf: Config laden → Dateien matchen → API mocken → Report |
| 2 | `--changed` Modus: nur Git-Diff-Dateien werden gelintet |
| 3 | Cache: zweiter Durchlauf ohne Datei-Aenderung → alle cached |
| 4 | Cache: Datei aendern → nur geaenderte Datei neu gelintet |
| 5 | Cache: Regel-Prompt aendern → betroffene Dateien neu gelintet |
| 6 | Fehlerhafte Config → Exit-Code 2 mit Fehlermeldung |
| 7 | Keine Violations → Exit-Code 0, "All rules passed" |
| 8 | Mix aus Errors und Warnings → Exit-Code 1 |

---

## 13. Implementierungsplan

> **Anleitung:**
> 1. Arbeite die Aufgaben **der Reihe nach** ab
> 2. Nach jeder erledigten Aufgabe: ⬜ → ✅ aendern
> 3. Nach jeder Phase: Quality Gate ausfuehren
> 4. Bei Fehlern: Erst fixen, dann weiter

### Phase 1: Projektstruktur + Config

- ⬜ **1.1** Bestehende claude-code-workflow Dateien aufraumen (alte Module entfernen oder separieren)
- ⬜ **1.2** `package.json` anpassen: Name, Dependencies (+ `@anthropic-ai/sdk`, `p-limit`, `micromatch`; - `execa`, `stream-json`, `ora`)
- ⬜ **1.3** `types.ts` erstellen mit allen Interfaces (LinterConfig, LintRule, LintJob, LintResult, CacheStore, etc.)
- ⬜ **1.4** `schema.json` erstellen fuer `.ai-linter.yml` Validierung
- ⬜ **1.5** `config-loader.ts` implementieren (YAML laden, Schema validieren, Defaults auflösen)
- ⬜ **1.6** `config-loader.test.ts` mit allen Validierungs-Tests

**Quality Gate Phase 1:**
- ⬜ `npx biome check` bestanden
- ⬜ `npx vitest run` bestanden

### Phase 2: File Resolution + Caching

- ⬜ **2.1** `rule-matcher.ts` implementieren (micromatch: Glob + Exclude)
- ⬜ **2.2** `rule-matcher.test.ts`
- ⬜ **2.3** `file-resolver.ts` implementieren (explizite Dateien, `--all`, `--changed` via git diff)
- ⬜ **2.4** `file-resolver.test.ts`
- ⬜ **2.5** `cache-manager.ts` implementieren (SHA-256, cache.json read/write, invalidation)
- ⬜ **2.6** `cache-manager.test.ts`

**Quality Gate Phase 2:**
- ⬜ `npx biome check` bestanden
- ⬜ `npx vitest run` bestanden

### Phase 3: Anthropic Client + Linter Engine

- ⬜ **3.1** `anthropic-client.ts` implementieren (Prompt bauen, API-Call, JSON-Response parsen, Retry-Logik)
- ⬜ **3.2** `anthropic-client.test.ts` (API gemockt)
- ⬜ **3.3** `linter-engine.ts` implementieren (Jobs erstellen, Cache filtern, p-limit parallel ausfuehren)
- ⬜ **3.4** `linter-engine.test.ts`

**Quality Gate Phase 3:**
- ⬜ `npx biome check` bestanden
- ⬜ `npx vitest run` bestanden

### Phase 4: Reporter + CLI

- ⬜ **4.1** `reporter.ts` implementieren (chalk-styled Output, Summary)
- ⬜ **4.2** `reporter.test.ts`
- ⬜ **4.3** `cli.ts` implementieren (Commander: lint, validate, cache Befehle)
- ⬜ **4.4** `e2e.test.ts` — vollstaendige Workflows mit gemockter API

**Quality Gate Phase 4:**
- ⬜ `npx biome check` bestanden
- ⬜ `npx vitest run` bestanden

### Phase 5: Polish + System Tests

- ⬜ **5.1** README.md aktualisieren
- ⬜ **5.2** `tsup.config.ts` anpassen (Entry Point, Shebang)
- ⬜ **5.3** System-Test mit echter Anthropic API (optional, teuer)
- ⬜ **5.4** `.ai-linter.yml` Beispiel-Config im Repo

**Quality Gate Phase 5:**
- ⬜ `npx biome check` bestanden
- ⬜ `npx vitest run` bestanden
- ⬜ `npm run build` bestanden

---

## 14. Marktanalyse

### Bestehende AI-Linter-Tools

| Tool | Ansatz | Staerke | Schwaeche |
| --- | --- | --- | --- |
| [AI-Lint](https://github.com/ToyB0x/ai-lint) | MCP-basiert, Rule Registry | Agent-Integration | Experimentell, kein CLI-Linter |
| [Lint.ai](https://www.lint.ai/) | PR/Commit-basiert, Bash-Regeln | CI-Integration | Closed Beta, keine lokale Ausfuehrung |
| [CodeRabbit](https://www.coderabbit.ai/blog/ai-native-universal-linter-ast-grep-llm) | AST-Grep + LLM via RAG | Praezise Pattern-Erkennung | PR-Review-Fokus, kein lokaler Linter |
| [Factory.ai](https://factory.ai/news/using-linters-to-direct-agents) | Lint-Rules als Agent-Steuerung | Agent-Workflow | Plattform-gebunden |
| [Cursor BugBot](https://www.qodo.ai/blog/best-ai-code-review-tools-2026/) | Bug-Detection ueber Diffs | Findet echte Bugs | Nur in Cursor IDE |

### Differenzierung unseres AI-Linters

| Aspekt | Andere Tools | Unser Ansatz |
| --- | --- | --- |
| Ausfuehrung | PR/CI Cloud | **Lokal, CLI-first** |
| Regeln | Vordefiniert oder Platform-spezifisch | **Custom YAML-Prompts pro Projekt** |
| Caching | Keins oder Cloud-basiert | **Lokaler SHA-256 Cache** |
| Scope | Meist PR-Diffs | **Datei, Git-Diff, oder Global** |
| Integration | GitHub/GitLab bound | **Standalone CLI, ueberall nutzbar** |
