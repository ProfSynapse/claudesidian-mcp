// This file is used to set up the test environment

// Mock console methods to avoid cluttering test output
global.console = {
  ...console,
  // Uncomment these lines to suppress specific console methods during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set up global Jest matchers if needed
expect.extend({
  // Add custom matchers here if needed
});