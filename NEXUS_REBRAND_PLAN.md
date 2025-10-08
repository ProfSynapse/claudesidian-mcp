# Nexus Rebrand Plan

## Overview
This document tracks all instances of "Claudesidian" and "Claudesidian MCP" in the codebase and provides a roadmap for renaming to "Nexus". This rebrand includes:
- Removing Claude Desktop connection functionality (MCP connector)
- Focusing solely on the local chat view within Obsidian
- Resetting version to 1.0.0
- Preparing for Obsidian Community Plugin Store submission

---

## Obsidian Plugin Store Requirements

Based on research, here are the key requirements for submitting to the Obsidian Community Plugin Store:

### Technical Requirements
1. **Repository Structure**
   - Must have a public GitHub repository
   - README.md in root describing purpose and usage
   - LICENSE file defining usage terms
   - manifest.json with proper metadata
   - main.js (compiled plugin)
   - styles.css (optional)

2. **Manifest Requirements**
   - Unique plugin ID (lowercase, hyphens only)
   - Plugin name
   - Author name
   - Description
   - Version (semantic versioning)
   - minAppVersion (minimum Obsidian version)
   - isDesktopOnly flag (if applicable)

3. **Release Process**
   - Create GitHub release with version number as tag
   - Upload manifest.json, main.js, and styles.css as binary attachments
   - manifest.json must exist in both repo root and release

4. **Submission Process**
   - Make PR to community-plugins.json in obsidianmd/obsidian-releases repo
   - Add plugin to end of list with: id, name, author, description, repo

### Best Practices
- Performance optimization for mobile
- Security best practices
- Cohesive integration with Obsidian UI
- Clear documentation
- Follow developer policies

---

## Instances to Replace

### 1. Core Configuration Files

#### manifest.json (Lines 2-3)
**Current:**
```json
"id": "claudesidian-mcp",
"name": "Claudesidian MCP",
```
**Purpose:** Plugin identification and display name in Obsidian
**Replacement Plan:**
- Change id to "nexus"
- Change name to "Nexus"
- Update version to "1.0.0"
- Review isDesktopOnly flag

#### package.json (Line 2)
**Current:**
```json
"name": "claudesidian-mcp",
```
**Purpose:** NPM package name
**Replacement Plan:**
- Change to "nexus"

#### package-lock.json (Lines 2, 8)
**Current:**
```json
"name": "claudesidian-mcp",
```
**Purpose:** NPM lock file
**Replacement Plan:**
- Change all instances to "nexus"
- Will be automatically updated on next npm install

---

### 2. Source Code Files

#### src/config.ts (Line 8)
**Current:**
```typescript
PLUGIN_NAME: 'Claudesidian MCP',
```
**Purpose:** Internal plugin name constant
**Replacement Plan:**
- Change to `PLUGIN_NAME: 'Nexus',`

#### src/connector.ts (Line 2)
**Current:**
```typescript
import ClaudesidianPlugin from './main';
```
**Purpose:** Type import for plugin class
**Replacement Plan:**
- Rename class to `NexusPlugin`
- Update all references

#### src/connector.ts (Line 41)
**Current:**
```typescript
private plugin: Plugin | ClaudesidianPlugin
```
**Purpose:** Plugin type reference
**Replacement Plan:**
- Change to `NexusPlugin`
- **NOTE:** Consider removing connector.ts entirely as Claude Desktop connection is being removed

---

### 3. MCP Connector Files (TO BE REMOVED/REFACTORED)

#### connector.ts (Multiple lines)
**Purpose:** Handles MCP connection to Claude Desktop
**Lines with references:**
- Line 38: Comment about plugin path
- Line 41: Path example `.obsidian/plugins/claudesidian-mcp`
- Line 62: Directory name comment
- Line 110-111: Socket/pipe naming with `claudesidian_mcp_`
- Line 150, 164: Plugin status messages

**Replacement Plan:**
- **REMOVE ENTIRE FILE** - No longer needed without Claude Desktop connection
- Remove from imports in main plugin file
- Remove socket/pipe creation logic
- Remove MCP server startup logic

#### connector.ts (root level)
**Purpose:** Compiled connector for Claude Desktop
**Replacement Plan:**
- **DELETE FILE** - Part of MCP removal

---

### 4. Component Files

#### src/components/SettingsTab.ts (Lines 5, 21, 285-286)
**Current:**
- Line 5: `WhatIsClaudesidianAccordion` import
- Line 21: Comment "Settings tab for the Claudesidian MCP plugin"
- Line 285-286: What is Claudesidian accordion

**Purpose:** Settings UI components
**Replacement Plan:**
- Rename component to `WhatIsNexusAccordion`
- Update comment to "Settings tab for the Nexus plugin"
- Update accordion text and content

#### src/components/ConfigModal.ts (Lines 123, 182, 241, 377, 410, 412, 414)
**Purpose:** Claude Desktop configuration modal
**Lines with references:**
- Lines 123, 182, 241: Instructions for configuring Claude Desktop
- Line 377: Server key naming `claudesidian-mcp-${sanitizedVaultName}`
- Lines 410, 412, 414: Connector.js path references

**Replacement Plan:**
- **REMOVE ENTIRE COMPONENT** - No longer needed without Claude Desktop
- Remove from imports and settings tab
- Remove ConfigModal button/trigger from UI

#### src/components/LLMUsageTab.ts (Lines 27, 104, 112, 132, 144)
**Current:**
```typescript
const plugin = (this.app as any).plugins.plugins['claudesidian-mcp'];
```
**Purpose:** Plugin reference for LLM usage tracking
**Replacement Plan:**
- Change plugin ID to 'nexus'
- Verify this component is still needed for local chat

---

### 5. Agent Mode Files

#### src/agents/contentManager/modes/*.ts
**Files affected:**
- replaceContentMode.ts (Line 180)
- readContentMode.ts (Lines 155, 207)
- prependContentMode.ts (Line 169)
- findReplaceContentMode.ts (Line 210)
- deleteContentMode.ts (Line 177)
- createContentMode.ts (Line 180)

**Current:**
```typescript
const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
```
**Purpose:** Plugin reference for content operations
**Replacement Plan:**
- Change plugin ID to 'nexus' in all files

#### src/agents/vaultManager/modes/duplicateNoteMode.ts (Lines 37, 170)
**Current:**
```typescript
const plugin = this.app.plugins.getPlugin('claudesidian-mcp');
```
**Purpose:** Plugin reference for note duplication
**Replacement Plan:**
- Change plugin ID to 'nexus'

---

### 6. UI Chat Components

#### src/ui/chat/services/ModelAgentManager.ts (Lines 81, 273, 297, 370)
**Current:**
```typescript
const plugin = this.app.plugins.plugins['claudesidian-mcp'];
```
**Purpose:** Plugin reference for chat functionality
**Replacement Plan:**
- Change plugin ID to 'nexus'
- This is CRITICAL as chat is the core feature moving forward

---

### 7. Utility Files

#### src/utils/UpdateManager.ts (Line 23)
**Current:**
```typescript
private readonly GITHUB_API = 'https://api.github.com/repos/ProfSynapse/claudesidian-mcp';
```
**Purpose:** GitHub API endpoint for update checking
**Replacement Plan:**
- Update to new repository URL once created
- Consider repository name: `ProfSynapse/nexus` or similar

---

### 8. Documentation Files

#### README.md (Multiple lines)
**Lines with references:**
- Line 1: Title "Claudesidian MCP Plugin for Obsidian"
- Line 3: Description mentions "Claudesidian MCP"
- Line 50: Installation path reference
- Line 59: Settings path reference
- Line 79: Multi-vault description
- Line 87: Server identifier pattern
- Lines 95, 98, 101, 104: Configuration examples
- Lines 124, 162, 182: Feature descriptions

**Purpose:** Project documentation
**Replacement Plan:**
- Update title to "Nexus - AI Chat for Obsidian"
- Remove all MCP/Claude Desktop references
- Focus documentation on local chat features
- Update installation instructions
- Remove multi-vault MCP server sections
- Emphasize single-vault chat functionality

---

### 9. Style Files

#### styles.css (Lines 1407, 1411, 1737, 1744, 1748)
**Current:**
```css
.claudesidian-mcp-settings { ... }
.claudesidian-mcp-folder-item { ... }
.claudesidian-mcp-checkbox { ... }
.claudesidian-mcp-folder-name { ... }
```
**Purpose:** CSS classes for UI components
**Replacement Plan:**
- Rename all CSS classes to use `nexus-` prefix
- Update corresponding HTML/TypeScript references

---

### 10. Git Configuration

#### .git/config (Line 11)
**Current:**
```
url = https://github.com/ProfSynapse/claudesidian-mcp.git
```
**Purpose:** Git remote repository URL
**Replacement Plan:**
- Create new GitHub repository for Nexus
- Update remote URL
- Consider keeping claudesidian-mcp for historical reference

---

### 11. Build Configuration

#### compile-src.sh
**Purpose:** Build script (if it contains references)
**Replacement Plan:**
- Review for any hardcoded plugin name references
- Update as needed

#### esbuild.config.mjs
**Purpose:** Build configuration
**Replacement Plan:**
- Review for any hardcoded plugin name references
- Update as needed

---

## Implementation Strategy

### Phase 1: Preparation
1. ✅ Create `nexus` branch
2. ✅ Document all instances
3. Review Obsidian plugin guidelines compliance
4. Plan MCP removal strategy

### Phase 2: Core Rename
1. Update manifest.json (id, name, version)
2. Update package.json and regenerate package-lock.json
3. Rename class `ClaudesidianPlugin` → `NexusPlugin`
4. Update config.ts PLUGIN_NAME constant
5. Update all plugin ID references in source code

### Phase 3: MCP Removal
1. Delete connector.ts (root)
2. Remove/refactor src/connector.ts
3. Delete ConfigModal.ts component
4. Remove MCP server startup logic from main plugin
5. Remove socket/pipe creation code
6. Remove Claude Desktop configuration from settings
7. Update imports and remove dead code

### Phase 4: UI Updates
1. Rename CSS classes (claudesidian-mcp-* → nexus-*)
2. Update component class references
3. Rename WhatIsClaudesidianAccordion → WhatIsNexusAccordion
4. Update settings tab text and descriptions
5. Review and update all user-facing text

### Phase 5: Documentation
1. Rewrite README.md focusing on local chat
2. Remove MCP/Claude Desktop sections
3. Add Obsidian Community Plugin installation guide
4. Update feature descriptions
5. Update screenshots/examples (if any)

### Phase 6: Repository & Release
1. Create new GitHub repository for Nexus
2. Update .git/config remote URL
3. Update UpdateManager.ts GitHub API endpoint
4. Create 1.0.0 release
5. Test installation in fresh Obsidian vault
6. Submit to Obsidian Community Plugins

---

## Testing Checklist

Before release:
- [ ] Plugin loads successfully with new ID
- [ ] Chat functionality works correctly
- [ ] Agent operations still function
- [ ] Settings save/load properly
- [ ] No references to "claudesidian" in UI
- [ ] No MCP connection attempts
- [ ] Clean console (no errors)
- [ ] Works on desktop (Windows, Mac, Linux)
- [ ] Works on mobile (if not desktop-only)
- [ ] README accurate and complete
- [ ] License file present
- [ ] Version is 1.0.0

---

## Questions to Address

1. **Repository Strategy**
   - Create new repo "nexus" or rename existing?
   - Keep claudesidian-mcp for historical reference?

2. **Feature Scope**
   - Keep all current agent functionality?
   - Which features are essential for 1.0.0?
   - Any features to remove/simplify?

3. **Branding**
   - Plugin name: Just "Nexus" or "Nexus Chat" or "Nexus AI"?
   - Tagline/description for store listing?
   - Icon/logo design?

4. **Licensing**
   - Current license appropriate?
   - Need to update copyright/attribution?

---

## Notes

- This is a major version change and rebrand
- Focus is shifting from MCP connector to standalone chat plugin
- Target audience: Obsidian users wanting integrated AI chat
- Differentiation: Local chat within Obsidian vs external clients
- Version 1.0.0 signifies stable, community-ready release

