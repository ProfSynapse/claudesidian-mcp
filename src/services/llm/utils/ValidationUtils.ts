/**
 * Validation Utilities
 * Comprehensive validation functions for lab kit operations
 * Based on patterns from existing validation services
 */


export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SchemaValidationRule {
  field: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'url';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  allowedValues?: any[];
  customValidator?: (value: any) => string | null;
}

export class ValidationUtils {
  /**
   * Validate test configuration
   */
  static validateTestConfig(config: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Required fields
    if (!config.name || typeof config.name !== 'string') {
      result.errors.push('Test name is required and must be a string');
      result.isValid = false;
    }

    if (!config.provider || typeof config.provider !== 'string') {
      result.errors.push('Provider is required and must be a string');
      result.isValid = false;
    }

    if (!config.scenarios || !Array.isArray(config.scenarios) || config.scenarios.length === 0) {
      result.errors.push('At least one test scenario is required');
      result.isValid = false;
    }

    // Validate scenarios
    if (config.scenarios && Array.isArray(config.scenarios)) {
      config.scenarios.forEach((scenario: any, index: number) => {
        const scenarioResult = this.validateTestScenario(scenario);
        if (!scenarioResult.isValid) {
          result.errors.push(...scenarioResult.errors.map(err => `Scenario ${index + 1}: ${err}`));
          result.isValid = false;
        }
        result.warnings.push(...scenarioResult.warnings.map(warn => `Scenario ${index + 1}: ${warn}`));
      });
    }

    // Validate evaluation criteria
    if (config.evaluation) {
      const evalResult = this.validateEvaluationConfig(config.evaluation);
      if (!evalResult.isValid) {
        result.errors.push(...evalResult.errors);
        result.isValid = false;
      }
      result.warnings.push(...evalResult.warnings);
    }

    return result;
  }

  /**
   * Validate test scenario
   */
  static validateTestScenario(scenario: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!scenario.id || typeof scenario.id !== 'string') {
      result.errors.push('Scenario ID is required and must be a string');
      result.isValid = false;
    }

    if (!scenario.userInput || typeof scenario.userInput !== 'string') {
      result.errors.push('User input is required and must be a string');
      result.isValid = false;
    }

    if (scenario.expectedOutput && typeof scenario.expectedOutput !== 'string') {
      result.errors.push('Expected output must be a string if provided');
      result.isValid = false;
    }

    // Validate metadata
    if (scenario.metadata && typeof scenario.metadata !== 'object') {
      result.errors.push('Scenario metadata must be an object');
      result.isValid = false;
    }

    // Check for overly long inputs
    if (scenario.userInput && scenario.userInput.length > 10000) {
      result.warnings.push('User input is very long (>10,000 characters) - may affect performance');
    }

    return result;
  }

  /**
   * Validate evaluation configuration
   */
  static validateEvaluationConfig(evaluation: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!evaluation.criteria || !Array.isArray(evaluation.criteria)) {
      result.errors.push('Evaluation criteria must be an array');
      result.isValid = false;
      return result;
    }

    evaluation.criteria.forEach((criterion: any, index: number) => {
      if (!criterion.name || typeof criterion.name !== 'string') {
        result.errors.push(`Criterion ${index + 1}: name is required and must be a string`);
        result.isValid = false;
      }

      if (!criterion.type || typeof criterion.type !== 'string') {
        result.errors.push(`Criterion ${index + 1}: type is required and must be a string`);
        result.isValid = false;
      }

      if (criterion.weight !== undefined) {
        if (typeof criterion.weight !== 'number' || criterion.weight < 0 || criterion.weight > 1) {
          result.errors.push(`Criterion ${index + 1}: weight must be a number between 0 and 1`);
          result.isValid = false;
        }
      }
    });

    return result;
  }

  /**
   * Validate optimization configuration
   */
  static validateOptimizationConfig(config: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!config.basePrompt || typeof config.basePrompt !== 'string') {
      result.errors.push('Base prompt is required and must be a string');
      result.isValid = false;
    }

    if (!config.testScenarios || !Array.isArray(config.testScenarios)) {
      result.errors.push('Test scenarios are required and must be an array');
      result.isValid = false;
    }

    if (config.generations && (typeof config.generations !== 'number' || config.generations < 1)) {
      result.errors.push('Generations must be a positive number');
      result.isValid = false;
    }

    if (config.populationSize && (typeof config.populationSize !== 'number' || config.populationSize < 2)) {
      result.errors.push('Population size must be at least 2');
      result.isValid = false;
    }

    if (config.mutationRate && (typeof config.mutationRate !== 'number' || config.mutationRate < 0 || config.mutationRate > 1)) {
      result.errors.push('Mutation rate must be a number between 0 and 1');
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate provider configuration
   */
  static validateProviderConfig(provider: string, config: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const providerValidators: Record<string, (config: any) => ValidationResult> = {
      openai: this.validateOpenAIConfig,
      google: this.validateGoogleConfig,
      anthropic: this.validateAnthropicConfig,
      mistral: this.validateMistralConfig,
      openrouter: this.validateOpenRouterConfig,
      requesty: this.validateRequestyConfig
    };

    const validator = providerValidators[provider.toLowerCase()];
    if (!validator) {
      result.errors.push(`Unknown provider: ${provider}`);
      result.isValid = false;
      return result;
    }

    return validator(config);
  }

  /**
   * Validate using custom schema
   */
  static validateSchema(data: any, rules: SchemaValidationRule[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    for (const rule of rules) {
      const value = this.getNestedValue(data, rule.field);
      const validation = this.validateField(value, rule);
      
      if (validation.error) {
        result.errors.push(`${rule.field}: ${validation.error}`);
        result.isValid = false;
      }

      if (validation.warning) {
        result.warnings.push(`${rule.field}: ${validation.warning}`);
      }
    }

    return result;
  }

  /**
   * Validate API response format
   */
  static validateAPIResponse(response: any, expectedFields: string[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!response || typeof response !== 'object') {
      result.errors.push('Response must be an object');
      result.isValid = false;
      return result;
    }

    for (const field of expectedFields) {
      if (!(field in response)) {
        result.errors.push(`Missing required field: ${field}`);
        result.isValid = false;
      }
    }

    return result;
  }

  /**
   * Validate test result
   */
  static validateTestResult(result: any): ValidationResult {
    const validationResult: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    const requiredFields = ['id', 'response', 'evaluation', 'timestamp'];
    const fieldValidation = this.validateAPIResponse(result, requiredFields);
    
    if (!fieldValidation.isValid) {
      validationResult.errors.push(...fieldValidation.errors);
      validationResult.isValid = false;
    }

    // Validate response structure
    if (result.response) {
      if (!result.response.content || typeof result.response.content !== 'string') {
        validationResult.errors.push('Response content is required and must be a string');
        validationResult.isValid = false;
      }

      if (result.response.tokens && typeof result.response.tokens !== 'number') {
        validationResult.errors.push('Response tokens must be a number');
        validationResult.isValid = false;
      }
    }

    // Validate evaluation structure
    if (result.evaluation) {
      if (typeof result.evaluation.overall !== 'number' || result.evaluation.overall < 0 || result.evaluation.overall > 1) {
        validationResult.errors.push('Evaluation overall score must be a number between 0 and 1');
        validationResult.isValid = false;
      }

      if (typeof result.evaluation.passed !== 'boolean') {
        validationResult.errors.push('Evaluation passed must be a boolean');
        validationResult.isValid = false;
      }
    }

    return validationResult;
  }

  // Private validation methods for specific providers

  private static validateOpenAIConfig(config: any): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      result.errors.push('OpenAI API key is required');
      result.isValid = false;
    }

    if (config.organization && typeof config.organization !== 'string') {
      result.errors.push('OpenAI organization must be a string');
      result.isValid = false;
    }

    return result;
  }

  private static validateGoogleConfig(config: any): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      result.errors.push('Google API key is required');
      result.isValid = false;
    }

    return result;
  }

  private static validateAnthropicConfig(config: any): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      result.errors.push('Anthropic API key is required');
      result.isValid = false;
    }

    return result;
  }

  private static validateMistralConfig(config: any): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      result.errors.push('Mistral API key is required');
      result.isValid = false;
    }

    return result;
  }

  private static validateOpenRouterConfig(config: any): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      result.errors.push('OpenRouter API key is required');
      result.isValid = false;
    }

    return result;
  }

  private static validateRequestyConfig(config: any): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      result.errors.push('Requesty API key is required');
      result.isValid = false;
    }

    return result;
  }

  // Helper methods

  private static validateField(value: any, rule: SchemaValidationRule): { error?: string; warning?: string } {
    // Check required
    if (rule.required && (value === undefined || value === null)) {
      return { error: 'is required' };
    }

    if (value === undefined || value === null) {
      return {}; // Optional field, skip validation
    }

    // Check type
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (rule.type === 'email' && actualType === 'string') {
      if (!this.isValidEmail(value)) {
        return { error: 'must be a valid email address' };
      }
    } else if (rule.type === 'url' && actualType === 'string') {
      if (!this.isValidUrl(value)) {
        return { error: 'must be a valid URL' };
      }
    } else if (rule.type !== actualType) {
      return { error: `must be of type ${rule.type}` };
    }

    // Check string constraints
    if (rule.type === 'string' && typeof value === 'string') {
      if (rule.minLength && value.length < rule.minLength) {
        return { error: `must be at least ${rule.minLength} characters long` };
      }
      if (rule.maxLength && value.length > rule.maxLength) {
        return { error: `must be no more than ${rule.maxLength} characters long` };
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        return { error: 'does not match the required pattern' };
      }
    }

    // Check number constraints
    if (rule.type === 'number' && typeof value === 'number') {
      if (rule.min !== undefined && value < rule.min) {
        return { error: `must be at least ${rule.min}` };
      }
      if (rule.max !== undefined && value > rule.max) {
        return { error: `must be no more than ${rule.max}` };
      }
    }

    // Check allowed values
    if (rule.allowedValues && !rule.allowedValues.includes(value)) {
      return { error: `must be one of: ${rule.allowedValues.join(', ')}` };
    }

    // Custom validation
    if (rule.customValidator) {
      const customError = rule.customValidator(value);
      if (customError) {
        return { error: customError };
      }
    }

    return {};
  }

  private static getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Common validation schemas
 */
export const CommonSchemas = {
  testConfig: [
    { field: 'name', type: 'string' as const, required: true, minLength: 1 },
    { field: 'provider', type: 'string' as const, required: true },
    { field: 'scenarios', type: 'array' as const, required: true },
    { field: 'description', type: 'string' as const, required: false },
    { field: 'timeout', type: 'number' as const, required: false, min: 1000 }
  ],

  scenario: [
    { field: 'id', type: 'string' as const, required: true, minLength: 1 },
    { field: 'userInput', type: 'string' as const, required: true, minLength: 1 },
    { field: 'expectedOutput', type: 'string' as const, required: false },
    { field: 'metadata', type: 'object' as const, required: false }
  ],

  optimizationConfig: [
    { field: 'basePrompt', type: 'string' as const, required: true, minLength: 10 },
    { field: 'testScenarios', type: 'array' as const, required: true },
    { field: 'generations', type: 'number' as const, required: false, min: 1, max: 100 },
    { field: 'populationSize', type: 'number' as const, required: false, min: 2, max: 50 },
    { field: 'mutationRate', type: 'number' as const, required: false, min: 0, max: 1 }
  ]
};