/**
 * Jest test setup for HNSW testing environment
 * Configures global environment and utilities for full initialization testing
 */

// Mock logger to prevent noise during tests unless debugging
const originalConsole = { ...console };
if (!process.env.DEBUG_TESTS) {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
} else {
  // In debug mode, prefix test logs for clarity
  const wrapConsoleMethod = (method: keyof typeof console) => {
    const original = originalConsole[method];
    (console as any)[method] = (...args: any[]) => {
      original('[TEST]', ...args);
    };
  };
  
  wrapConsoleMethod('log');
  wrapConsoleMethod('warn');
  wrapConsoleMethod('error');
}

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveBeenCalledWithHnswUpdate(): R;
      toHaveNoNullReferences(): R;
    }
  }
}

// Custom Jest matchers for HNSW testing
expect.extend({
  toHaveBeenCalledWithHnswUpdate(received) {
    const calls = received.mock?.calls || [];
    const hnswUpdateCalls = calls.filter((call: any[]) => 
      call.some(arg => typeof arg === 'string' && arg.includes('[HNSW-UPDATE]'))
    );

    const pass = hnswUpdateCalls.length > 0;
    
    return {
      message: () => pass 
        ? `Expected function NOT to be called with [HNSW-UPDATE] messages`
        : `Expected function to be called with [HNSW-UPDATE] messages, but found none`,
      pass
    };
  },

  toHaveNoNullReferences(received) {
    const serialized = JSON.stringify(received);
    const hasNull = serialized.includes('null');
    
    return {
      message: () => hasNull
        ? `Expected object to have no null references, but found: ${serialized}`
        : `Expected object to have null references, but found none`,
      pass: !hasNull
    };
  }
});

// Setup test timeout for async operations
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

console.log('[TEST SETUP] HNSW test environment initialized');