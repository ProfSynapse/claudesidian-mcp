/**
 * Test setup for adapter tests
 * Loads environment variables and sets up test configuration
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Verify required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY', 
  'ANTHROPIC_API_KEY',
  'MISTRAL_API_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.warn(`⚠️  Warning: Missing environment variables: ${missingVars.join(', ')}`);
  console.warn('Some adapter tests will be skipped.');
}

// Global test configuration
global.console = {
  ...console,
  // Suppress console.warn in tests unless in verbose mode
  warn: process.env.VERBOSE ? console.warn : jest.fn(),
};

// Add custom matchers for better test assertions
expect.extend({
  toBeValidResponse(received) {
    const pass = received && 
                 typeof received.text === 'string' && 
                 received.text.length > 0 &&
                 typeof received.model === 'string' &&
                 typeof received.provider === 'string';
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid LLM response`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid LLM response with text, model, and provider`,
        pass: false,
      };
    }
  },
  
  toHaveValidUsage(received) {
    const pass = received.usage && 
                 typeof received.usage.promptTokens === 'number' &&
                 typeof received.usage.completionTokens === 'number' &&
                 typeof received.usage.totalTokens === 'number' &&
                 received.usage.totalTokens > 0;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to have valid usage`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to have valid usage with token counts`,
        pass: false,
      };
    }
  }
});

// Extend Jest matchers type
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidResponse(): R;
      toHaveValidUsage(): R;
    }
  }
}