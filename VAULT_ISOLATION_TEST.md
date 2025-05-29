# Vault Isolation Test Guide

This document provides a comprehensive test guide to verify that the global state isolation fixes are working correctly.

## Problem Statement

Previously, when multiple Obsidian vaults were running in the same Obsidian instance, the claudesidian-mcp plugin would experience cross-vault contamination where:
- Plugin state from one vault would affect another
- Progress handlers would be shared across vaults
- localStorage keys would conflict
- Plugin lookup used hardcoded IDs

## Testing Setup

### Prerequisites
1. Create two separate Obsidian vaults
2. Install claudesidian-mcp in only ONE of the vaults
3. Ensure Claude Desktop is configured to connect to the vault with the plugin

### Test Cases

#### Test 1: Plugin ID Isolation
**Expected Behavior**: Each vault should have its own unique plugin context.

**Steps**:
1. Open vault with claudesidian-mcp installed
2. Check browser console for initialization logs
3. Look for: `Plugin context initialized - Plugin ID: claudesidian-mcp, Vault ID: [unique_id]`
4. Open second vault (without plugin)
5. Verify no claudesidian-mcp initialization occurs

#### Test 2: Progress Handler Namespacing  
**Expected Behavior**: Progress handlers should be vault-specific.

**Steps**:
1. In vault with plugin, open Memory Settings
2. Start an indexing operation
3. Check browser console for progress handler registration
4. Look for namespaced handler: `window.mcpProgressHandlers_[vaultId]_[pluginId]`
5. Verify regular `window.mcpProgressHandlers` is NOT used

#### Test 3: localStorage Isolation
**Expected Behavior**: Storage keys should be vault-specific.

**Steps**:
1. In vault with plugin, perform token usage operations
2. Open browser DevTools → Application → Local Storage
3. Verify storage keys include vault ID: `claudesidian-tokens-used_[vaultId]_claudesidian-mcp`
4. Switch to second vault, verify no claudesidian storage keys exist

#### Test 4: Agent Context Access
**Expected Behavior**: Agents should use plugin context instead of global access.

**Steps**:
1. Perform a vault search operation
2. Check browser console logs from VaultLibrarianAgent
3. Look for: "Attempting to get vector store from plugin"
4. Verify it uses plugin context, not hardcoded 'claudesidian-mcp'

#### Test 5: Cross-Vault Non-Interference
**Expected Behavior**: Operations in one vault should not affect the other.

**Steps**:
1. Start indexing in vault with plugin
2. Switch to vault without plugin
3. Verify no progress indicators appear
4. Verify no claudesidian-related console logs
5. Return to first vault, verify indexing continues normally

## Verification Points

### Browser Console Logs
Look for these patterns indicating proper isolation:

```
✅ Good (Isolated):
Plugin context initialized - Plugin ID: claudesidian-mcp, Vault ID: vault_abc123
Using namespaced handler: mcpProgressHandlers_vault_abc123_claudesidian-mcp
Updated localStorage with key: claudesidian-tokens-used_vault_abc123_claudesidian-mcp

❌ Bad (Global):
Plugin context initialized - Plugin ID: claudesidian-mcp, Vault ID: default
Using global handler: mcpProgressHandlers
Updated localStorage with key: claudesidian-tokens-used
```

### localStorage Keys
Check for vault-specific prefixes:

```
✅ Isolated Format:
claudesidian-tokens-used_[vaultId]_claudesidian-mcp
claudesidian-collection-deleted_[vaultId]_claudesidian-mcp

❌ Global Format:
claudesidian-tokens-used
claudesidian-collection-deleted
```

### Window Object Inspection
In browser console, check:

```javascript
// Should show vault-specific handlers
Object.keys(window).filter(k => k.includes('mcpProgressHandlers'))

// Should return something like:
// ["mcpProgressHandlers_MyVault_a1b2c3_claudesidian-mcp"]
```

## Expected Results

After implementing the isolation fixes:

1. **Unique Vault IDs**: Each vault gets a unique ID based on path hash
2. **Namespaced Handlers**: All window handlers include vault/plugin ID
3. **Isolated Storage**: All localStorage keys are vault-specific
4. **Dynamic Plugin Access**: No hardcoded 'claudesidian-mcp' references
5. **Clean Separation**: Operations in one vault don't affect others

## Troubleshooting

If issues persist:

1. **Check Plugin Context**: Verify `getPluginContext()` returns proper data
2. **Verify Utility Usage**: Ensure all components use storage utilities
3. **Handler Registration**: Confirm progress handlers use namespaced keys
4. **Agent Context**: Verify agents receive and use plugin context

## Files Modified

The isolation fix involved changes to:

- `src/types.ts` - Added PluginContext interface
- `src/main.ts` - Plugin context initialization
- `src/agents/baseAgent.ts` - Agent context support
- `src/connector.ts` - Context propagation to agents
- `src/components/ProgressBar.ts` - Namespaced handlers
- `src/utils/progressHandlerUtils.ts` - Progress utilities
- `src/utils/storageUtils.ts` - Storage utilities
- `src/constants/storageKeys.ts` - Storage key constants
- Various service and component files for context propagation

This comprehensive isolation ensures each vault operates independently without cross-contamination.