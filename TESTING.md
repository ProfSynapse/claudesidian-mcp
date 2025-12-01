# Testing Guide for Refactoring Validation

## Quick Start: Run All Tests

### 1. Open Obsidian Developer Console
- Mac: `Cmd + Option + I`
- Windows/Linux: `Ctrl + Shift + I`

### 2. Service Health Check
Paste this into the console:

```javascript
// Service Health Check
(async () => {
  const plugin = app.plugins.getPlugin('nexus');
  if (!plugin) {
    console.error('❌ Plugin not found');
    return;
  }

  console.log('🔍 Running Service Health Check...\n');

  // Check critical services
  const criticalServices = [
    'vaultOperations',
    'eventManager',
    'workspaceService',
    'memoryService',
    'sessionService',
    'llmService',
    'customPromptStorageService',
    'conversationService',
    'chatService'
  ];

  let passed = 0;
  let failed = 0;

  for (const serviceName of criticalServices) {
    try {
      const service = await plugin.getService(serviceName, 5000);
      if (service) {
        console.log(`✅ ${serviceName}: OK`);
        passed++;
      } else {
        console.error(`❌ ${serviceName}: Not initialized`);
        failed++;
      }
    } catch (error) {
      console.error(`❌ ${serviceName}: Error -`, error.message);
      failed++;
    }
  }

  // Check plugin.services getter
  console.log('\n🔍 Checking plugin.services getter...');
  const services = plugin.services;
  const expectedServices = ['memoryService', 'workspaceService', 'sessionService', 'conversationService', 'customPromptStorageService'];

  for (const name of expectedServices) {
    if (services[name]) {
      console.log(`✅ plugin.services.${name}: Available`);
      passed++;
    } else {
      console.error(`❌ plugin.services.${name}: Missing`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 All services healthy!');
  } else {
    console.warn('⚠️ Some services are not available');
  }
})();
```

---

## Manual Testing Checklist

### Phase 1: Service Initialization (Critical)
Run the service health check above. All services should show ✅.

**Expected Output:**
```
✅ vaultOperations: OK
✅ eventManager: OK
✅ workspaceService: OK
✅ memoryService: OK
✅ sessionService: OK
✅ llmService: OK
✅ conversationService: OK
✅ chatService: OK
✅ plugin.services.memoryService: Available
✅ plugin.services.workspaceService: Available
✅ plugin.services.sessionService: Available
✅ plugin.services.conversationService: Available

📊 Results: 12 passed, 0 failed
🎉 All services healthy!
```

---

### Phase 2: Settings & Configuration

#### ✅ Test Settings Tab
1. Open Settings → Nexus MCP
2. Check all tabs load without errors:
   - [ ] General
   - [ ] LLM Providers
   - [ ] Agent Management
   - [ ] Memory Management
   - [ ] Chat Settings

#### ✅ Test LLM Provider Configuration
1. Open LLM Providers tab
2. Click "Add Provider" or edit existing
3. Validate API key
4. **Expected**: Validation should work without requiring restart
5. **Check console**: No "VaultOperations not available" warning

---

### Phase 3: Agent Functionality

#### ✅ Test VaultManager Agent (via MCP or Chat)
```json
{
  "agent": "vaultManager",
  "mode": "listFiles",
  "params": { "path": "/" }
}
```
**Expected**: Returns list of files

#### ✅ Test ContentManager Agent
```json
{
  "agent": "contentManager",
  "mode": "readContent",
  "params": { "path": "any-note.md" }
}
```
**Expected**: Returns note content

#### ✅ Test VaultLibrarian Agent
```json
{
  "agent": "vaultLibrarian",
  "mode": "searchFiles",
  "params": { "query": "test" }
}
```
**Expected**: Returns search results

#### ✅ Test MemoryManager Agent
```json
{
  "agent": "memoryManager",
  "mode": "listWorkspaces",
  "params": {}
}
```
**Expected**: Returns workspace list

---

### Phase 4: Chat Interface

#### ✅ Test Chat View
1. Open command palette: `Nexus: Open Chat`
2. Check chat view loads without errors
3. Create new conversation
4. **Check console**: No errors about missing services

#### ✅ Test Message Sending
1. Send a simple message: "Hello"
2. **Expected**: LLM responds without errors
3. **Check**: Token usage displayed
4. **Check**: Cost tracking working

#### ✅ Test Tool Execution
1. Send: "List files in my vault"
2. **Expected**: Tool accordion appears
3. **Expected**: Tool executes successfully
4. **Expected**: Results displayed

#### ✅ Test Session Tracking
After sending messages, check session data:
```javascript
// Check if session is being tracked
(async () => {
  const plugin = app.plugins.getPlugin('nexus');
  const sessionService = await plugin.getService('sessionService');
  const currentSession = await sessionService.getCurrentSession();

  if (currentSession) {
    console.log('✅ Session tracking working:', currentSession.id);
    console.log('   Created:', currentSession.createdAt);
    console.log('   Operations:', currentSession.operations?.length || 0);
  } else {
    console.error('❌ No active session found');
  }
})();
```

---

### Phase 5: File Operations & Context

#### ✅ Test File Reading in LLM Context
1. In chat, use a note reference (once suggesters are working): `Read [[My Note]]`
2. **Expected**: Note content included in LLM context
3. **Check console**: No "VaultOperations not available" errors

#### ✅ Test Agent Activity Recording
After executing any agent operation, check:
```javascript
// Check if activity was recorded
(async () => {
  const plugin = app.plugins.getPlugin('nexus');
  const memoryService = plugin.services.memoryService;

  if (!memoryService) {
    console.error('❌ memoryService not available');
    return;
  }

  // Check current session has operations
  console.log('✅ memoryService available for activity recording');
  console.log('   Session context should be recording operations');
})();
```

---

### Phase 6: Workspace & Memory

#### ✅ Test Workspace Creation
1. Settings → Memory Management
2. Create new workspace
3. **Expected**: No errors
4. **Check**: Workspace appears in `.workspaces/` folder

#### ✅ Test Workspace Loading
1. Create/select a workspace
2. Add some context notes
3. **Expected**: Context saved successfully
4. Reload Obsidian
5. **Expected**: Workspace loads with saved context

---

## Error Monitoring

### Console Checks
Watch for these error patterns:

❌ **Bad Patterns:**
```
TypeError: ... is not a function
... not available, ... may not work
Failed to get service
Service ... not initialized
```

✅ **Good Patterns:**
```
[ServiceManager] Service ... initialized
[ChatService] Message sent successfully
[LLMService] Stream completed
```

### Common Issues to Watch For

1. **Service not found**: Check ServiceDefinitions.ts registration
2. **TypeError on service methods**: Check service initialization order
3. **Silent failures**: Check plugin.services getter returns services
4. **Missing context**: Check session/workspace services available

---

## Automated Test Script

Run this comprehensive test:

```javascript
// Comprehensive Test Suite
(async () => {
  console.log('🧪 Starting Comprehensive Test Suite\n');

  const plugin = app.plugins.getPlugin('nexus');
  const results = { passed: 0, failed: 0, warnings: 0 };

  // Test 1: Plugin loaded
  if (!plugin) {
    console.error('❌ CRITICAL: Plugin not loaded');
    return;
  }
  console.log('✅ Plugin loaded');
  results.passed++;

  // Test 2: ServiceManager exists
  if (!plugin.getServiceContainer()) {
    console.error('❌ CRITICAL: ServiceManager missing');
    results.failed++;
  } else {
    console.log('✅ ServiceManager available');
    results.passed++;
  }

  // Test 3: All critical services
  const services = [
    'vaultOperations', 'eventManager', 'workspaceService',
    'memoryService', 'sessionService', 'llmService',
    'customPromptStorageService', 'conversationService', 'chatService'
  ];

  for (const name of services) {
    try {
      const service = await plugin.getService(name, 3000);
      if (service) {
        console.log(`✅ ${name}`);
        results.passed++;
      } else {
        console.error(`❌ ${name}: Not initialized`);
        results.failed++;
      }
    } catch (error) {
      console.error(`❌ ${name}: ${error.message}`);
      results.failed++;
    }
  }

  // Test 4: plugin.services getter
  const legacyServices = plugin.services;
  const expected = ['memoryService', 'workspaceService', 'sessionService', 'conversationService', 'customPromptStorageService'];
  for (const name of expected) {
    if (legacyServices[name]) {
      console.log(`✅ plugin.services.${name}`);
      results.passed++;
    } else {
      console.warn(`⚠️ plugin.services.${name}: Not available`);
      results.warnings++;
    }
  }

  // Test 5: Settings
  if (plugin.settings) {
    console.log('✅ Settings available');
    results.passed++;
  } else {
    console.error('❌ Settings missing');
    results.failed++;
  }

  // Test 6: Vault operations
  try {
    const vaultOps = await plugin.getService('vaultOperations');
    if (vaultOps && typeof vaultOps.readFile === 'function') {
      console.log('✅ VaultOperations has readFile method');
      results.passed++;
    } else {
      console.error('❌ VaultOperations missing methods');
      results.failed++;
    }
  } catch (error) {
    console.error('❌ VaultOperations test failed:', error.message);
    results.failed++;
  }

  // Final Report
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${results.passed}`);
  console.log(`   ❌ Failed: ${results.failed}`);
  console.log(`   ⚠️  Warnings: ${results.warnings}`);
  console.log('='.repeat(50));

  if (results.failed === 0) {
    console.log('🎉 All tests passed! System healthy.');
  } else {
    console.error('⚠️ Some tests failed. Check logs above.');
  }
})();
```

---

## Quick Smoke Test (30 seconds)

1. **Open Obsidian** - Check for startup errors
2. **Open Developer Console** - Run service health check
3. **Open Settings** - LLM Providers tab loads
4. **Open Chat** - Create conversation, send message
5. **Check Console** - No red errors

If all ✅ = System healthy!
If any ❌ = Check specific test section above

---

## Reporting Issues

When reporting bugs, include:
1. Console output from health check
2. Full error message and stack trace
3. Steps to reproduce
4. Expected vs actual behavior
5. Obsidian version and OS
