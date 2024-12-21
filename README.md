```
bridge-mcp/
├── manifest.json
├── package.json
├── tsconfig.json
├── styles.css
├── src/
│   ├── main.ts                    # Plugin entry point
│   ├── settings.ts                # Plugin settings
│   ├── types.ts                   # Shared types
│   ├── components/
│   │   ├── StatusBar.ts
│   │   └── SettingsTab.ts
│   ├── mcp/
│   │   ├── server.ts              # MCP server core
│   │   ├── transport.ts           # stdio transport
│   │   └── interfaces/            # Core interfaces
│   │       ├── ITool.ts          # Tool interface
│   │       ├── IToolProvider.ts  # Tool provider interface
│   │       └── IToolContext.ts   # Tool context interface
│   ├── services/
│   │   ├── VaultManager.ts
│   │   ├── MemoryManager.ts
│   │   ├── ReasoningManager.ts
│   │   ├── SearchEngine.ts
│   │   └── ToolManager.ts        # Tool loading & management
│   ├── tools/                    # Core tool implementations
│   │   ├── base/
│   │   │   ├── BaseTool.ts       # Base tool class
│   │   │   └── decorators.ts     # Tool decorators
│   │   ├── core/                 # Built-in tools
│   │   │   ├── MemoryTool.ts
│   │   │   ├── ReasoningTool.ts
│   │   │   └── SearchTool.ts
│   │   └── registry.ts          # Tool registry
│   ├── api/                     # Public API for extensions
│   │   ├── index.ts             # API entry point
│   │   ├── toolKit.ts           # Tool development utilities
│   │   └── events.ts            # Event system
│   └── utils/
│       ├── constants.ts
│       ├── helpers.ts
│       └── logger.ts
├── tools/                       # Example custom tools
│   ├── GitTool/                # Example Git integration
│   │   ├── package.json
│   │   └── src/
│   │       └── index.ts
│   └── WeatherTool/            # Example Weather API
│       ├── package.json
│       └── src/
│           └── index.ts
└── docs/                       # Documentation
    ├── tool-development.md     # Tool development guide
    └── examples/               # Example implementations
```

Key Extensibility Features:

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

