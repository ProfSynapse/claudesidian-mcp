# Claudesidian MCP Plugin for Obsidian

Bridge MCP is an Obsidian plugin that enables AI assistants to interact with your vault through the Model Context Protocol (MCP). It provides atomic operations for vault management and implements a structured memory system.

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

1. Install the plugin by putting the manifest.json, styles.css, main.js and connector.js the following path:
    `path/to/vault/.obsidian/plugins/bridge-mcp` (you will need to make the bridge-mcp folder)
2. Enable the plugin in Obsidian's settings
3. Configure your claude desktop config file (instructions in the plugin settings)
4. Restart obsidian (if it's open) and fully restart claude (you might have to go to your task manager and end the task, as it runs in the background if you just `x` out).

## Configuration

The plugin creates the following folder structure in your vault:

```
claudesidian/
├── memory/        # Persistent memory storage
├── reasoning/     # Reasoning traces and logs
└── index          # Search indices
```



3. Restart Claude Desktop

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm run test
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