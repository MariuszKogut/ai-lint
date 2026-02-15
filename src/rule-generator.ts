import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, Output } from 'ai'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { z } from 'zod'
import schema from './schema.json' with { type: 'json' }
import type { LintRule } from './types.js'

const ruleDefinition = (schema as Record<string, unknown>).definitions as Record<string, unknown>
const ruleSchema = ruleDefinition.rule as Record<string, unknown>

const RULE_YAML_STRUCTURE = `Rule YAML structure:
  id: string (snake_case, lowercase, e.g. "no_console_log")
  name: string (human-readable, e.g. "No console.log statements")
  severity: "error" | "warning"
  glob: string (file glob pattern, e.g. "src/**/*.ts")
  exclude: string (optional, exclusion glob pattern)
  prompt: string (the AI prompt that describes what to check)`

const SYSTEM_PROMPT = `You are a lint rule generator. Given a description of what a lint rule should do, generate a complete YAML rule definition.

${RULE_YAML_STRUCTURE}

Rules for generating:
- id: must be snake_case, start with lowercase letter, only lowercase letters, digits, and underscores
- name: short, descriptive human-readable name
- severity: choose "error" for things that must be fixed, "warning" for suggestions
- glob: choose an appropriate file glob pattern based on the description
- prompt: write a clear, specific prompt that an AI linter can use to check files against this rule. The prompt should explain what to look for and how to determine pass/fail.

Respond ONLY with the rule object, no additional text.`

const FIX_SYSTEM_PROMPT = `You are a lint rule generator. The previously generated rule failed schema validation. Fix the rule to match the required schema.

${RULE_YAML_STRUCTURE}

Schema constraints:
- id: must match pattern ^[a-z][a-z0-9_]*$ (snake_case, starts with lowercase letter)
- name: minimum length 1
- severity: must be exactly "error" or "warning"
- glob: minimum length 1
- prompt: minimum length 1
- No additional properties allowed (only: id, name, severity, glob, exclude, prompt)

Respond ONLY with the fixed rule object, no additional text.`

const generatedRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  severity: z.enum(['error', 'warning']),
  glob: z.string(),
  exclude: z.string().optional(),
  prompt: z.string(),
})

export class RuleGenerator {
  private static ajvInstance: Ajv | null = null

  private getAjv(): Ajv {
    if (!RuleGenerator.ajvInstance) {
      RuleGenerator.ajvInstance = new Ajv({ allErrors: true, verbose: true })
      addFormats(RuleGenerator.ajvInstance)
    }
    return RuleGenerator.ajvInstance
  }

  private validateRule(rule: z.infer<typeof generatedRuleSchema>): string[] {
    const ajv = this.getAjv()
    const validate = ajv.compile(ruleSchema)
    const valid = validate(rule)
    if (valid) return []
    return (validate.errors || []).map((err) => {
      const path = err.instancePath || 'root'
      return `${path}: ${err.message}`
    })
  }

  async generate(description: string): Promise<LintRule> {
    const openrouter = createOpenRouter({ apiKey: process.env.OPEN_ROUTER_KEY })
    const model = openrouter('anthropic/claude-sonnet-4.5')

    const { output } = await generateText({
      model,
      output: Output.object({ schema: generatedRuleSchema }),
      system: SYSTEM_PROMPT,
      prompt: description,
      temperature: 0.7,
      maxOutputTokens: 1024,
    })

    if (!output) {
      throw new Error('AI returned no valid response')
    }

    const errors = this.validateRule(output)
    if (errors.length === 0) {
      return output as LintRule
    }

    // Auto-fix: send back to AI with validation errors and schema structure
    const fixPrompt = `The following generated rule has validation errors:

Rule:
${JSON.stringify(output, null, 2)}

Validation errors:
${errors.map((e) => `- ${e}`).join('\n')}

Please fix the rule to pass schema validation.`

    const { output: fixedOutput } = await generateText({
      model,
      output: Output.object({ schema: generatedRuleSchema }),
      system: FIX_SYSTEM_PROMPT,
      prompt: fixPrompt,
      temperature: 0,
      maxOutputTokens: 1024,
    })

    if (!fixedOutput) {
      throw new Error('AI returned no valid response during fix attempt')
    }

    const fixErrors = this.validateRule(fixedOutput)
    if (fixErrors.length > 0) {
      throw new Error(
        `Generated rule failed schema validation after fix attempt:\n${fixErrors.map((e) => `  - ${e}`).join('\n')}`,
      )
    }

    return fixedOutput as LintRule
  }
}
