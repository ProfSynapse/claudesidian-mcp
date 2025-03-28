# Claudesidian MCP Plugin for Obsidian

Claudesidian MCP is an Obsidian plugin that enables AI assistants to interact with your vault through the Model Context Protocol (MCP). It provides atomic operations for vault management and implements a structured memory system.

## Features

- 🔌 MCP Server Integration
  - Seamlessly connects your vault to Claude Desktop via MCP
  - Exposes vault operations as MCP tools
  - Implements secure access controls

- 📝 Vault Operations
  - Create and read notes
  - Search vault content
  - Manage file structure
  - Operate on frontmatter

- 🧠 Memory Architecture
  - Persistent memory storage in dedicated notes
  - Structured knowledge organization
  - Automatic memory indexing
  - Memory retrieval and search

## Installation

1. Install the plugin by downloading the latest release, specifically these files:
  - manifest.json
  - styles.css
  - main.js
  - connector.js
2. Save those files in `path/to/vault/.obsidian/plugins/claudesidian-mcp` (you will need to make the claudesidian-mcp folder)
3. Enable the plugin in Obsidian's settings
4. Configure your claude desktop config file (instructions in the plugin settings)
5. Restart obsidian (if it's open) and fully restart claude (you might have to go to your task manager and end the task, as it runs in the background if you just `x` out).

## Configuration

The plugin creates the following folder structure in your vault:

```
claudesidian/
└── inbox          # Search indices
```

## Security

- The plugin runs an MCP server that only accepts local connections
- All vault operations require explicit user permission
- Memory storage is contained within your vault
- No data is sent externally without consent

## Key Extensibility Features:

1. **Tool Interface & Base Class**
```typescript
// src/mcp/interfaces/ITool.ts
export interface ITool {
    name: string;
    description: string;
    schema: JsonSchema;
    execute(args: any, context: IToolContext): Promise<any>;
}

// src/tools/base/BaseTool.ts
export abstract class BaseTool implements ITool {
    // Common tool functionality
}
```

2. **Tool Decorators**
```typescript
// src/tools/base/decorators.ts
export function Tool(config: ToolConfig) {
    return function(target: any) {
        // Tool registration logic
    }
}

// Usage
@Tool({
    name: 'custom_tool',
    description: 'A custom tool'
})
export class CustomTool extends BaseTool {
    // Tool implementation
}
```

3. **Tool Registry System**
```typescript
// src/tools/registry.ts
export class ToolRegistry {
    private tools = new Map<string, ITool>();

    registerTool(tool: ITool) {
        // Registration logic
    }

    loadExternalTool(provider: IToolProvider) {
        // External tool loading
    }
}
```

4. **Public API**
```typescript
// src/api/toolKit.ts
export class ToolKit {
    static createTool(config: ToolConfig): ITool {
        // Tool creation helper
    }

    static validateSchema(schema: JsonSchema) {
        // Schema validation
    }
}
```

5. **Example Custom Tool**
```typescript
// tools/WeatherTool/src/index.ts
import { BaseTool, Tool, ToolKit } from 'obsidian-mcp';

@Tool({
    name: 'weather',
    description: 'Get weather information'
})
export class WeatherTool extends BaseTool {
    async execute(args: any, context: IToolContext) {
        // Weather API implementation
    }
}
```

## Roadmap

### Calendar Functionality

Calendar Provider Configuration:
User first selects provider (Google or Microsoft)
Each provider needs its own OAuth setup
Store tokens securely in plugin settings
Calendar Management UI:
Settings Tab Flow:

Calendar List:
[ ] Default | Personal Calendar (Google) | Edit | Remove
[✓] Default | Work Calendar (Microsoft) | Edit | Remove
[ ] Default | Side Project (Google) | Edit | Remove
[+] Add New Calendar

Each calendar entry stores:
- Display name (e.g. "Personal Calendar")
- Provider type (Google/Microsoft)
- OAuth credentials
- Calendar ID from provider
- Default status (boolean)

Settings Tab Flow:
A. Provider Section:
   - Google Calendar Setup
     - OAuth Configuration
     - Test Connection button
   - Microsoft Calendar Setup  
     - OAuth Configuration
     - Test Connection button

B. Calendars Section:
   - List of configured calendars
   - Default calendar radio selection
   - Add/Edit/Remove calendar buttons
   
C. Add/Edit Calendar Modal:
   1. Select provider (Google/Microsoft)
   2. Enter display name
   3. If not authenticated for provider:
      - Complete OAuth flow
   4. Select specific calendar from provider's available calendars
   5. Set as default option
