# Utilities & Infrastructure

Essential utilities for configuration management, logging, validation, and reliability patterns across the framework.

## 🎯 Purpose

The utilities provide the foundational infrastructure that powers the entire framework:
- **ConfigManager**: Environment and configuration management
- **Logger**: Structured logging with multiple outputs
- **RetryManager**: Retry logic with circuit breakers and exponential backoff
- **ValidationUtils**: Input validation and schema enforcement
- **Performance monitoring** and setup utilities

## ⚙️ ConfigManager

Centralized configuration management with environment variables, config files, and validation.

### Quick Setup
```typescript
import { ConfigManager, quickSetup } from './utils';

// Automatic setup with validation
const { config, logger, isReady, summary } = await quickSetup({
  logLevel: 'info',
  enableFileLogging: true,
  validateConfig: true
});

if (!isReady) {
  console.log('❌ Setup incomplete. Please check configuration.');
  console.log(summary);
  process.exit(1);
}

console.log('✅ Lab Kit ready for testing!');
```

### Manual Configuration
```typescript
const config = ConfigManager.getInstance();

// Check provider configuration
const configuredProviders = config.getConfiguredProviders();
console.log(`Configured providers: ${configuredProviders.join(', ')}`);

// Get specific provider config
const openaiConfig = config.getProvider('openai');
if (openaiConfig.apiKey) {
  console.log('✅ OpenAI configured');
} else {
  console.log('❌ OpenAI API key missing');
}

// Check database configuration
if (config.isDatabaseConfigured()) {
  console.log('✅ Database configured');
} else {
  console.log('⚠️ Database not configured - some features unavailable');
}
```

### Configuration Sources
The ConfigManager loads configuration from multiple sources in order of priority:

1. **Environment Variables** (highest priority)
2. **Config Files** (`lab-kit.config.json`, `.labkitrc`)
3. **Default Values** (lowest priority)

```typescript
// Environment variables
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...
SUPABASE_URL=https://project.supabase.co
LAB_KIT_LOG_LEVEL=debug

// Config file (lab-kit.config.json)
{
  "defaults": {
    "timeout": 30000,
    "retries": 3,
    "concurrency": 5
  },
  "logging": {
    "level": "info",
    "enableFileLogging": true
  }
}
```

### Configuration Validation
```typescript
// Get configuration summary
const summary = config.getConfigSummary();
console.log({
  providers: summary.providers.configured,     // ['openai', 'anthropic']
  database: summary.database.configured,      // true/false
  embeddings: summary.embeddings.configured,  // ['openai', 'voyage']
  readyForTesting: summary.providers.configured.length > 0
});

// Validate environment
import { validateEnvironment } from './utils';
const envValidation = validateEnvironment();

if (!envValidation.isValid) {
  console.log('❌ Environment validation failed:');
  envValidation.errors.forEach(error => console.log(`  • ${error}`));
}

if (envValidation.warnings.length > 0) {
  console.log('⚠️ Warnings:');
  envValidation.warnings.forEach(warning => console.log(`  • ${warning}`));
}
```

## 📝 Logger

Structured logging with multiple outputs, component isolation, and performance tracking.

### Basic Logging
```typescript
import { logger, createLogger } from './utils';

// Global logger
logger.info('Application started');
logger.warn('High memory usage detected');
logger.error('Failed to connect to database', { 
  error: 'Connection timeout',
  retryCount: 3 
});

// Component-specific logger
const testLogger = createLogger('TestRunner');
testLogger.info('Starting test execution', { 
  testId: 'test_123',
  scenarios: 15 
});
```

### Advanced Logging Features
```typescript
// Event-specific logging methods
logger.testEvent('test_started', 'test_123', {
  provider: 'openai',
  scenarios: 15,
  personas: 3
});

logger.optimizationEvent('generation_complete', 5, {
  bestScore: 0.85,
  improvement: 0.12
});

logger.apiCall('openai', 'chat.completions', 1234, 150, 0.003);

logger.performance('prompt_optimization', 45000, {
  generations: 10,
  improvements: 3
});
```

### File Logging & Configuration
```typescript
// Enable file logging
logger.enableFileLogging('./logs');

// Configure logging levels and outputs
logger.configure({
  level: 'debug',
  enableFile: true,
  logDirectory: './app-logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
});

// Component logger with context
const optimizerLogger = logger.child('PromptOptimizer');
optimizerLogger.info('Starting optimization', {
  basePrompt: 'Help users...',
  generations: 10,
  populationSize: 12
});
```

### Log Structure
```json
{
  "timestamp": "2025-01-10T15:30:45.123Z",
  "level": "info",
  "message": "Test completed successfully",
  "component": "TestRunner",
  "metadata": {
    "testId": "test_123",
    "accuracy": 0.85,
    "duration": 45000,
    "eventType": "test"
  }
}
```

## 🔄 RetryManager

Sophisticated retry logic with circuit breakers, exponential backoff, and failure pattern recognition.

### Basic Retry Usage
```typescript
import { RetryManager, RetryPatterns } from './utils';

const retryManager = RetryManager.getInstance();

// Basic retry with default configuration
const result = await retryManager.withRetry(
  async () => {
    // Operation that might fail
    return await unstableApiCall();
  },
  {
    maxAttempts: 3,
    baseDelay: 1000,
    exponentialBase: 2
  },
  'unstable_api_call'
);
```

### Convenient Retry Patterns
```typescript
// API calls with smart retry logic
const apiResult = await RetryPatterns.apiCall(async () => {
  return await llmProvider.generate(prompt);
}, 'llm_generation');

// Database operations
const dbResult = await RetryPatterns.databaseOperation(async () => {
  return await database.query('SELECT * FROM users');
}, 'user_query');

// File operations
const fileResult = await RetryPatterns.fileOperation(async () => {
  return await fs.writeFile('report.json', data);
}, 'report_write');
```

### Circuit Breaker Pattern
```typescript
// Protect against cascading failures
const result = await retryManager.withCircuitBreaker(
  async () => {
    return await externalService.call();
  },
  'external_service',
  {
    failureThreshold: 5,      // Open after 5 failures
    resetTimeout: 60000,      // Try again after 1 minute
    monitoringPeriod: 120000  // Monitor over 2 minutes
  }
);

// Check circuit breaker status
const state = retryManager.getCircuitState('external_service');
// 'closed' (normal) | 'open' (failing) | 'half-open' (testing)

// Get statistics
const stats = retryManager.getCircuitStats('external_service');
console.log({
  state: stats.state,
  failureRate: stats.failureRate,
  totalRequests: stats.totalRequests
});
```

### Combined Retry + Circuit Breaker
```typescript
// Ultimate reliability pattern
const result = await retryManager.withRetryAndCircuitBreaker(
  async () => {
    return await criticalOperation();
  },
  'critical_operation',
  // Retry config
  {
    maxAttempts: 3,
    baseDelay: 1000,
    retryCondition: (error) => error.status >= 500
  },
  // Circuit breaker config
  {
    failureThreshold: 5,
    resetTimeout: 30000
  }
);
```

### Custom Retry Conditions
```typescript
const result = await retryManager.withRetry(
  async () => {
    return await llmProvider.generate(prompt);
  },
  {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    jitter: true,
    retryCondition: (error) => {
      // Retry on rate limits and server errors
      if (error.status === 429) return true;
      if (error.status >= 500) return true;
      
      // Retry on network errors
      if (error.code === 'ECONNRESET') return true;
      if (error.code === 'ETIMEDOUT') return true;
      
      // Don't retry on client errors
      return false;
    },
    onRetry: (attempt, error) => {
      logger.warn(`Retry attempt ${attempt}`, { 
        error: error.message,
        operation: 'llm_generation'
      });
    }
  },
  'llm_generation'
);
```

## ✅ ValidationUtils

Comprehensive validation for all framework inputs with detailed error reporting.

### Test Configuration Validation
```typescript
import { ValidationUtils } from './utils';

// Validate test configuration
const testConfig = {
  name: 'Customer Service Test',
  provider: 'openai',
  scenarios: [
    {
      id: 'return_policy',
      userInput: 'How do I return a product?',
      expectedOutput: 'Should mention return process'
    }
  ],
  evaluation: {
    criteria: [
      { name: 'accuracy', type: 'llm_judge', weight: 0.4 }
    ]
  }
};

const validation = ValidationUtils.validateTestConfig(testConfig);
if (!validation.isValid) {
  console.log('❌ Test configuration invalid:');
  validation.errors.forEach(error => console.log(`  • ${error}`));
}

if (validation.warnings.length > 0) {
  console.log('⚠️ Warnings:');
  validation.warnings.forEach(warning => console.log(`  • ${warning}`));
}
```

### Provider Configuration Validation
```typescript
// Validate provider configurations
const providers = ['openai', 'anthropic', 'google'];

for (const provider of providers) {
  const config = configManager.getProvider(provider);
  const validation = ValidationUtils.validateProviderConfig(provider, config);
  
  if (validation.isValid) {
    console.log(`✅ ${provider} configuration valid`);
  } else {
    console.log(`❌ ${provider} configuration invalid:`);
    validation.errors.forEach(error => console.log(`  • ${error}`));
  }
}
```

### Schema Validation
```typescript
import { CommonSchemas } from './utils';

// Use pre-built schemas
const scenarioValidation = ValidationUtils.validateSchema(
  scenario,
  CommonSchemas.scenario
);

// Custom schema validation
const customSchema = [
  { field: 'name', type: 'string', required: true, minLength: 1 },
  { field: 'email', type: 'email', required: true },
  { field: 'age', type: 'number', required: false, min: 18, max: 120 },
  { field: 'preferences', type: 'array', required: false },
  { 
    field: 'role', 
    type: 'string', 
    required: true,
    allowedValues: ['admin', 'user', 'guest']
  }
];

const result = ValidationUtils.validateSchema(userData, customSchema);
```

### API Response Validation
```typescript
// Validate API responses
const response = await llmProvider.generate(prompt);

const validation = ValidationUtils.validateAPIResponse(response, [
  'content',
  'tokens', 
  'cost',
  'latency'
]);

if (!validation.isValid) {
  throw new Error(`Invalid API response: ${validation.errors.join(', ')}`);
}

// Validate test results
const testResult = {
  id: 'test_123',
  response: { content: 'Response text', tokens: 150 },
  evaluation: { overall: 0.85, passed: true },
  timestamp: new Date()
};

const resultValidation = ValidationUtils.validateTestResult(testResult);
```

## 🔧 Performance Monitoring

### Built-in Performance Utilities
```typescript
import { PerformanceMonitor } from './utils';

// Time operations
PerformanceMonitor.startTimer('test_execution');
await runTests();
const duration = PerformanceMonitor.endTimer('test_execution');
console.log(`Tests completed in ${duration}ms`);

// Time async operations
const result = await PerformanceMonitor.timeAsync('prompt_optimization', async () => {
  return await optimizer.optimize();
});

// Time synchronous operations
const parsed = PerformanceMonitor.time('json_parsing', () => {
  return JSON.parse(largeJsonString);
});
```

### Environment Setup Report
```typescript
import { createSetupReport } from './utils';

// Generate comprehensive setup report
const report = createSetupReport();
console.log(report);

// Example output:
/*
# Synaptic Lab Kit Setup Report

## Environment Validation
✅ Environment validation passed

## Configuration Summary
**LLM Providers:** openai, anthropic, google
**Database:** Configured
**Embedding Providers:** openai, voyage
**Log Level:** info

## Readiness Status
✅ Ready for testing
*/
```

## 🛠️ Integration Examples

### Complete Setup Flow
```typescript
async function setupLabKit() {
  try {
    // 1. Quick setup with validation
    const { config, logger, isReady, summary } = await quickSetup({
      logLevel: 'info',
      enableFileLogging: true,
      validateConfig: true
    });

    if (!isReady) {
      logger.error('Setup failed', summary);
      return false;
    }

    // 2. Setup retry patterns for reliability
    const retryManager = RetryManager.getInstance();
    
    // 3. Configure performance monitoring
    const testLogger = createLogger('TestRunner');
    
    // 4. Validate critical configurations
    const providers = config.getConfiguredProviders();
    for (const provider of providers) {
      const providerConfig = config.getProvider(provider);
      const validation = ValidationUtils.validateProviderConfig(provider, providerConfig);
      
      if (!validation.isValid) {
        logger.error(`Invalid ${provider} configuration`, validation.errors);
        return false;
      }
    }

    logger.info('🚀 Lab Kit setup complete', {
      providers: providers.length,
      database: config.isDatabaseConfigured(),
      embeddings: config.getConfiguredProviders().length
    });

    return true;
  } catch (error) {
    console.error('Setup failed:', error);
    return false;
  }
}
```

### Error Handling Pipeline
```typescript
async function robustTestExecution(testConfig: any) {
  const logger = createLogger('RobustTestRunner');
  const retryManager = RetryManager.getInstance();

  try {
    // 1. Validate configuration
    const validation = ValidationUtils.validateTestConfig(testConfig);
    if (!validation.isValid) {
      throw new Error(`Invalid config: ${validation.errors.join(', ')}`);
    }

    // 2. Execute with retry and circuit breaker
    const results = await retryManager.withRetryAndCircuitBreaker(
      async () => {
        return await executeTests(testConfig);
      },
      'test_execution',
      {
        maxAttempts: 3,
        baseDelay: 5000,
        retryCondition: (error) => {
          // Retry on temporary failures, not configuration errors
          return error.temporary === true;
        }
      },
      {
        failureThreshold: 3,
        resetTimeout: 300000 // 5 minutes
      }
    );

    logger.info('Test execution completed', {
      testId: testConfig.id,
      accuracy: results.summary.accuracy,
      duration: results.duration
    });

    return results;
  } catch (error) {
    logger.error('Test execution failed', {
      testId: testConfig.id,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}
```

## 🎯 Best Practices

### 1. Configuration Management
- **Environment first** - Use environment variables for secrets
- **Validate early** - Check configuration at startup
- **Fail fast** - Don't continue with invalid configuration
- **Document requirements** - Clear documentation of required env vars

### 2. Logging Strategy
- **Structured logging** - Use consistent metadata fields
- **Component isolation** - Use component-specific loggers
- **Appropriate levels** - Debug for development, info for production
- **Include context** - Add relevant metadata to all log entries

### 3. Retry Patterns
- **Know your errors** - Different retry strategies for different error types
- **Avoid retry storms** - Use jitter and circuit breakers
- **Monitor patterns** - Track retry rates and failure patterns
- **Graceful degradation** - Have fallback plans

### 4. Validation Philosophy
- **Validate at boundaries** - Check all external inputs
- **Fail early** - Validate before expensive operations
- **Clear error messages** - Help users fix validation errors
- **Schema evolution** - Plan for changing requirements

The utilities layer provides the rock-solid foundation that makes the entire framework reliable, observable, and maintainable! 🛠️✨