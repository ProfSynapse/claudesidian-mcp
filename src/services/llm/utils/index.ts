/**
 * Utilities module exports
 * Essential utility functions and managers for the lab kit
 */

export { ConfigManager, type LabKitConfig } from './ConfigManager';
export { Logger, ComponentLogger, logger, createLogger, type LogLevel, type LogEntry } from './Logger';
export { 
  RetryManager, 
  RetryPatterns, 
  retryManager, 
  type RetryConfig, 
  type CircuitBreakerConfig,
  type CircuitState 
} from './RetryManager';
export { 
  ValidationUtils, 
  CommonSchemas, 
  type ValidationResult, 
  type SchemaValidationRule 
} from './ValidationUtils';
export {
  CacheManager,
  LRUCache,
  FileCache,
  BaseCache,
  type CacheEntry,
  type CacheConfig,
  type CacheMetrics
} from './CacheManager';

/**
 * Quick setup function for basic lab kit initialization
 */
import { ConfigManager } from './ConfigManager';
import { Logger, createLogger } from './Logger';

export interface QuickSetupOptions {
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  enableFileLogging?: boolean;
  logDirectory?: string;
  configPath?: string;
  validateConfig?: boolean;
}

export async function quickSetup(options: QuickSetupOptions = {}): Promise<{
  config: ConfigManager;
  logger: Logger;
  isReady: boolean;
  summary: any;
}> {
  // Initialize configuration
  const config = ConfigManager.getInstance();
  
  if (options.configPath) {
    config.loadFromFile(options.configPath);
  }

  // Initialize logging
  const logger = Logger.getInstance({
    level: options.logLevel || 'info',
    enableFile: options.enableFileLogging || false,
    logDirectory: options.logDirectory || './logs'
  });

  logger.info('🚀 Synaptic Lab Kit initializing...');

  // Validate configuration if requested
  if (options.validateConfig) {
    const summary = config.getConfigSummary();
    
    if (summary.providers.configured.length === 0) {
      logger.warn('No LLM providers configured - add API keys to environment or config file');
    } else {
      logger.info(`Configured providers: ${summary.providers.configured.join(', ')}`);
    }

    if (!summary.database.configured) {
      logger.warn('Database not configured - some features may not work');
    }

    if (summary.embeddings.configured.length === 0) {
      logger.warn('No embedding providers configured - vector operations will not work');
    }
  }

  const isReady = config.getConfiguredProviders().length > 0;
  const summary = config.getConfigSummary();

  logger.info(`✅ Lab Kit initialization ${isReady ? 'completed' : 'completed with warnings'}`);

  return {
    config,
    logger,
    isReady,
    summary
  };
}

/**
 * Environment validation helper
 */
export function validateEnvironment(): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
} {
  const result = {
    isValid: true,
    errors: [] as string[],
    warnings: [] as string[],
    recommendations: [] as string[]
  };

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0] || '0');
  
  if (majorVersion < 18) {
    result.errors.push(`Node.js version ${nodeVersion} is not supported. Please use Node.js 18 or higher.`);
    result.isValid = false;
  }

  // Check for required environment variables
  const requiredEnvVars = [
    'OPENAI_API_KEY',
    'GOOGLE_API_KEY', 
    'ANTHROPIC_API_KEY',
    'MISTRAL_API_KEY',
    'OPENROUTER_API_KEY',
    'REQUESTY_API_KEY',
    'PERPLEXITY_API_KEY'
  ];

  const configuredVars = requiredEnvVars.filter(varName => process.env[varName]);
  
  if (configuredVars.length === 0) {
    result.errors.push('No LLM provider API keys found in environment variables');
    result.isValid = false;
  } else if (configuredVars.length < 2) {
    result.warnings.push('Only one LLM provider configured - consider adding more for comparison testing');
  }

  // Check database configuration
  const hasSupabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;
  if (!hasSupabase) {
    result.warnings.push('Supabase not configured - database features will not be available');
    result.recommendations.push('Add SUPABASE_URL and SUPABASE_ANON_KEY to enable database functionality');
  }

  // Check embedding providers
  const embeddingVars = [
    'VOYAGE_API_KEY',
    'COHERE_API_KEY'
  ];
  
  const configuredEmbeddings = embeddingVars.filter(varName => process.env[varName]);
  if (configuredEmbeddings.length === 0 && !process.env.OPENAI_API_KEY) {
    result.warnings.push('No dedicated embedding providers configured');
    result.recommendations.push('Consider adding VOYAGE_API_KEY or COHERE_API_KEY for optimal embedding performance');
  }

  return result;
}

/**
 * Create a validation report for the current setup
 */
export function createSetupReport(): string {
  const config = ConfigManager.getInstance();
  const envValidation = validateEnvironment();
  const summary = config.getConfigSummary();

  let report = '# Synaptic Lab Kit Setup Report\n\n';
  
  // Environment validation
  report += '## Environment Validation\n\n';
  if (envValidation.isValid) {
    report += '✅ Environment validation passed\n\n';
  } else {
    report += '❌ Environment validation failed\n\n';
    report += '**Errors:**\n';
    envValidation.errors.forEach(error => {
      report += `- ${error}\n`;
    });
    report += '\n';
  }

  if (envValidation.warnings.length > 0) {
    report += '**Warnings:**\n';
    envValidation.warnings.forEach(warning => {
      report += `- ${warning}\n`;
    });
    report += '\n';
  }

  if (envValidation.recommendations.length > 0) {
    report += '**Recommendations:**\n';
    envValidation.recommendations.forEach(rec => {
      report += `- ${rec}\n`;
    });
    report += '\n';
  }

  // Configuration summary
  report += '## Configuration Summary\n\n';
  report += `**LLM Providers:** ${summary.providers.configured.join(', ') || 'None'}\n`;
  report += `**Database:** ${summary.database.configured ? 'Configured' : 'Not configured'}\n`;
  report += `**Embedding Providers:** ${summary.embeddings.configured.join(', ') || 'None'}\n`;
  report += `**Log Level:** ${summary.logging.level}\n\n`;

  // Readiness status
  report += '## Readiness Status\n\n';
  if (summary.providers.configured.length > 0) {
    report += '✅ Ready for testing\n';
  } else {
    report += '❌ Not ready - no providers configured\n';
  }

  return report;
}

/**
 * Performance monitoring utilities
 */
export class PerformanceMonitor {
  private static timers: Map<string, number> = new Map();
  private static logger = createLogger('Performance');

  static startTimer(name: string): void {
    this.timers.set(name, Date.now());
  }

  static endTimer(name: string, logResult = true): number {
    const startTime = this.timers.get(name);
    if (!startTime) {
      throw new Error(`Timer '${name}' was not started`);
    }

    const duration = Date.now() - startTime;
    this.timers.delete(name);

    if (logResult) {
      this.logger.performance(name, duration);
    }

    return duration;
  }

  static async timeAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    this.startTimer(name);
    try {
      const result = await operation();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }

  static time<T>(name: string, operation: () => T): T {
    this.startTimer(name);
    try {
      const result = operation();
      this.endTimer(name);
      return result;
    } catch (error) {
      this.endTimer(name);
      throw error;
    }
  }
}