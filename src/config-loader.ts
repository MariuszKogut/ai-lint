import fs from 'node:fs'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import YAML from 'yaml'
import schema from './schema.json' with { type: 'json' }
import type { LinterConfig } from './types.js'

export class ConfigLoader {
  private static ajvInstance: Ajv | null = null

  /**
   * Get cached AJV instance (lazy singleton)
   */
  private getAjv(): Ajv {
    if (!ConfigLoader.ajvInstance) {
      ConfigLoader.ajvInstance = new Ajv({
        allErrors: true,
        verbose: true,
      })
      addFormats(ConfigLoader.ajvInstance)
    }
    return ConfigLoader.ajvInstance
  }

  /**
   * Load and validate .ai-lint.yml config
   */
  load(filePath: string): LinterConfig {
    // Read YAML file
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const rawConfig = YAML.parse(fileContent)

    // Validate with JSON Schema
    const ajv = this.getAjv()
    const validate = ajv.compile(schema)
    const valid = validate(rawConfig)

    if (!valid) {
      const errors = this.formatValidationErrors(validate.errors || [])
      throw new Error(`Config validation failed:\n${errors}`)
    }

    // Apply defaults
    const config: LinterConfig = {
      model: rawConfig.model ?? 'gemini-flash',
      concurrency: rawConfig.concurrency ?? 5,
      git_base: rawConfig.git_base ?? 'main',
      rules: rawConfig.rules,
    }

    // Validate unique rule IDs (custom validation not in schema)
    this.validateUniqueRuleIds(config.rules)

    return config
  }

  /**
   * Validate that all rule IDs are unique
   */
  private validateUniqueRuleIds(rules: LinterConfig['rules']): void {
    const ids = new Set<string>()
    const duplicates: string[] = []

    for (const rule of rules) {
      if (ids.has(rule.id)) {
        duplicates.push(rule.id)
      }
      ids.add(rule.id)
    }

    if (duplicates.length > 0) {
      throw new Error(
        `Duplicate rule IDs found: ${duplicates.join(', ')}. Each rule must have a unique ID.`,
      )
    }
  }

  /**
   * Format AJV validation errors into readable messages
   */
  private formatValidationErrors(errors: Ajv.ErrorObject[]): string {
    // Filter out verbose oneOf errors for cleaner messages
    const filteredErrors = errors.filter(
      (err) => err.keyword !== 'oneOf' && err.keyword !== 'additionalProperties',
    )

    if (filteredErrors.length === 0 && errors.length > 0) {
      // If we filtered everything out, use original errors
      return errors
        .map((err) => {
          const path = err.instancePath || 'root'
          return `  - ${path}: ${err.message}`
        })
        .join('\n')
    }

    return filteredErrors
      .map((err) => {
        const path = err.instancePath || 'root'
        const field = err.params.missingProperty ? `${path}/${err.params.missingProperty}` : path

        // Custom messages for common validation failures
        if (err.keyword === 'required') {
          return `  - ${field}: is required`
        }
        if (err.keyword === 'pattern') {
          return `  - ${field}: ${err.message} (expected format: lowercase with underscores, e.g., 'my_rule_id')`
        }
        if (err.keyword === 'enum') {
          return `  - ${field}: ${err.message}, allowed values: ${err.params.allowedValues?.join(', ')}`
        }
        if (err.keyword === 'minItems') {
          return `  - ${field}: must have at least ${err.params.limit} items`
        }

        return `  - ${field}: ${err.message}`
      })
      .join('\n')
  }
}
