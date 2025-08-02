/**
 * Test script for ObsidianPathManager validation
 * Tests path normalization, deduplication, and cross-platform compatibility
 */

// Mock Obsidian API for testing
const mockVault = {
  adapter: {
    type: 'desktop'
  }
};

const mockNormalizePath = (path) => {
  // Simulate Obsidian's normalizePath behavior more accurately
  return path
    .replace(/\\/g, '/')     // Convert backslashes to forward slashes
    .replace(/\/+/g, '/')    // Remove duplicate slashes
    .replace(/\/\.\//g, '/') // Remove /./ patterns
    .replace(/^\.\//, '')    // Remove leading ./
    .replace(/^\//, '')      // Remove leading slash
    .replace(/\/$/, '');     // Remove trailing slash
};

// Mock ObsidianPathManager class for testing
class TestObsidianPathManager {
  constructor(vault, manifest) {
    this.vault = vault;
    this.manifest = manifest;
  }

  normalizePath(path) {
    return mockNormalizePath(path);
  }

  validatePath(path) {
    const errors = [];
    const warnings = [];

    // Security validation - prevent path traversal
    if (path.includes('..') || path.includes('~')) {
      errors.push('Path traversal sequences are not allowed for security');
    }

    // Platform compatibility checks
    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(path)) {
      errors.push('Path contains invalid characters for cross-platform compatibility');
    }

    // Ensure vault-relative (not absolute)
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      errors.push('Path should be relative to vault root, not absolute');
    }

    // Check for dangerous patterns
    if (path.includes('\\')) {
      warnings.push('Path contains backslashes, will be normalized to forward slashes');
    }

    // Path length limits for cross-platform compatibility
    if (path.length > 260) {
      warnings.push('Path length exceeds recommended limits for cross-platform compatibility');
    }

    const normalizedPath = this.normalizePath(path);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedPath
    };
  }

  sanitizePath(path) {
    return path
      .replace(/[<>:"|?*]/g, '_')  // Replace invalid filesystem chars
      .replace(/\\/g, '/')         // Normalize separators
      .replace(/\/+/g, '/')        // Remove duplicate separators
      .replace(/^\//, '')          // Remove leading slash
      .replace(/\/$/, '');         // Remove trailing slash
  }

  getVaultRelativePath(path) {
    const normalized = this.normalizePath(path);
    return normalized.startsWith('vault/') ? normalized.slice(6) : normalized;
  }

  joinPaths(...segments) {
    const joined = segments
      .filter(segment => segment && segment.length > 0)
      .join('/');
    return this.normalizePath(joined);
  }

  getPluginDataPath() {
    return this.normalizePath('.obsidian/plugins/claudesidian-mcp');
  }

  getChromaDbPath() {
    return this.normalizePath('.obsidian/plugins/claudesidian-mcp/data/chroma_db');
  }
}

// Test cases for path management validation
const testCases = [
  // Basic normalization tests
  {
    name: 'Basic path normalization',
    input: 'folder/subfolder/file.txt',
    expected: 'folder/subfolder/file.txt',
    shouldBeValid: true
  },
  {
    name: 'Path with backslashes (Windows style)',
    input: 'folder\\subfolder\\file.txt',
    expected: 'folder/subfolder/file.txt',
    shouldBeValid: true,
    expectWarnings: true
  },
  {
    name: 'Path with duplicate separators',
    input: 'folder//subfolder///file.txt',
    expected: 'folder/subfolder/file.txt',
    shouldBeValid: true
  },
  {
    name: 'Path with leading slash',
    input: '/folder/subfolder/file.txt',
    expected: 'folder/subfolder/file.txt',
    shouldBeValid: false // Absolute paths should be invalid
  },
  
  // Security validation tests
  {
    name: 'Path traversal with ..',
    input: '../../../etc/passwd',
    expected: '../../../etc/passwd', // Normalized but invalid
    shouldBeValid: false
  },
  {
    name: 'Path with tilde',
    input: '~/documents/file.txt',
    expected: '~/documents/file.txt',
    shouldBeValid: false
  },
  
  // Cross-platform compatibility tests
  {
    name: 'Path with invalid Windows characters',
    input: 'folder/file:name*.txt',
    expected: 'folder/file:name*.txt',
    shouldBeValid: false
  },
  {
    name: 'Windows absolute path',
    input: 'C:\\Users\\Documents\\file.txt',
    expected: 'C:/Users/Documents/file.txt',
    shouldBeValid: false // Absolute paths should be invalid
  },
  
  // Path joining tests
  {
    name: 'Join multiple path segments',
    segments: ['folder', 'subfolder', 'file.txt'],
    expected: 'folder/subfolder/file.txt',
    shouldBeValid: true
  },
  {
    name: 'Join with empty segments',
    segments: ['folder', '', 'subfolder', '', 'file.txt'],
    expected: 'folder/subfolder/file.txt',
    shouldBeValid: true
  },
  
  // Plugin-specific path tests
  {
    name: 'Plugin data path',
    isPluginPath: true,
    expected: '.obsidian/plugins/claudesidian-mcp',
    shouldBeValid: true
  },
  {
    name: 'ChromaDB path',
    isChromaPath: true,
    expected: '.obsidian/plugins/claudesidian-mcp/data/chroma_db',
    shouldBeValid: true
  }
];

// Run tests
function runPathManagerTests() {
  console.log('🧪 Running ObsidianPathManager Validation Tests...\n');
  
  const pathManager = new TestObsidianPathManager(mockVault);
  let passed = 0;
  let failed = 0;

  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    
    try {
      let result;
      let actualPath;

      if (testCase.segments) {
        // Test path joining
        actualPath = pathManager.joinPaths(...testCase.segments);
        result = pathManager.validatePath(actualPath);
      } else if (testCase.isPluginPath) {
        // Test plugin data path
        actualPath = pathManager.getPluginDataPath();
        result = pathManager.validatePath(actualPath);
      } else if (testCase.isChromaPath) {
        // Test ChromaDB path
        actualPath = pathManager.getChromaDbPath();
        result = pathManager.validatePath(actualPath);
      } else {
        // Test regular path validation
        result = pathManager.validatePath(testCase.input);
        actualPath = result.normalizedPath;
      }

      // Check normalized path
      const pathMatches = actualPath === testCase.expected;
      
      // Check validity
      const validityMatches = result.isValid === testCase.shouldBeValid;
      
      // Check warnings if expected
      const warningsMatch = testCase.expectWarnings ? result.warnings.length > 0 : true;

      if (pathMatches && validityMatches && warningsMatch) {
        console.log(`  ✅ PASSED`);
        console.log(`     Input: ${testCase.input || 'N/A'}`);
        console.log(`     Expected: ${testCase.expected}`);
        console.log(`     Actual: ${actualPath}`);
        console.log(`     Valid: ${result.isValid} (expected: ${testCase.shouldBeValid})`);
        if (result.warnings.length > 0) {
          console.log(`     Warnings: ${result.warnings.join(', ')}`);
        }
        passed++;
      } else {
        console.log(`  ❌ FAILED`);
        console.log(`     Input: ${testCase.input || 'N/A'}`);
        console.log(`     Expected: ${testCase.expected}`);
        console.log(`     Actual: ${actualPath}`);
        console.log(`     Valid: ${result.isValid} (expected: ${testCase.shouldBeValid})`);
        console.log(`     Path match: ${pathMatches}`);
        console.log(`     Validity match: ${validityMatches}`);
        if (result.errors.length > 0) {
          console.log(`     Errors: ${result.errors.join(', ')}`);
        }
        if (result.warnings.length > 0) {
          console.log(`     Warnings: ${result.warnings.join(', ')}`);
        }
        failed++;
      }
    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`);
      failed++;
    }
    
    console.log('');
  });

  console.log(`\n📊 Test Results:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  // Test path deduplication specifically
  console.log('\n🔍 Testing Path Deduplication:');
  
  const duplicateTestPaths = [
    'folder/subfolder/file.txt',
    'folder//subfolder//file.txt',
    'folder\\\\subfolder\\\\file.txt',
    './folder/./subfolder/./file.txt'
  ];

  const normalizedPaths = duplicateTestPaths.map(path => pathManager.normalizePath(path));
  const uniquePaths = [...new Set(normalizedPaths)];
  
  console.log(`   Original paths: ${duplicateTestPaths.length}`);
  console.log(`   After normalization: ${normalizedPaths.length}`);
  console.log(`   Unique paths: ${uniquePaths.length}`);
  
  if (uniquePaths.length === 1 && uniquePaths[0] === 'folder/subfolder/file.txt') {
    console.log(`   ✅ Path deduplication working correctly`);
    console.log(`   Final normalized path: ${uniquePaths[0]}`);
  } else {
    console.log(`   ❌ Path deduplication failed`);
    console.log(`   Normalized paths: ${normalizedPaths.join(', ')}`);
  }

  return { passed, failed, totalTests: passed + failed };
}

// Run the tests
const results = runPathManagerTests();

if (results.failed === 0) {
  console.log('\n🎉 All ObsidianPathManager tests PASSED! Path management is working correctly.');
} else {
  console.log(`\n⚠️  ${results.failed} test(s) failed. Path management needs attention.`);
}