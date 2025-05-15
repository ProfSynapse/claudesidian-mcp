# Technical Context: Claudesidian MCP

## Technologies Used

### Core Technologies

1. **TypeScript**
   - Primary development language
   - Provides type safety and modern JavaScript features
   - Used for all plugin code and MCP server implementation

2. **Obsidian API**
   - Plugin API for Obsidian
   - Provides access to vault operations, UI components, and settings
   - Used for integrating with the Obsidian application

3. **Model Context Protocol (MCP)**
   - Protocol for connecting AI assistants with external tools and data
   - Defines standards for resources, tools, and communication
   - Used for exposing vault functionality to AI assistants

4. **Node.js**
   - JavaScript runtime
   - Provides file system access and networking capabilities
   - Used for IPC server implementation

### Libraries and Frameworks

1. **MCP SDK**
   - `@modelcontextprotocol/sdk` - Official TypeScript SDK for MCP
   - Provides client and server implementations
   - Handles protocol communication and message formatting

2. **Zod**
   - Schema validation library
   - Used for validating tool arguments and configuration
   - Provides runtime type checking

3. **Obsidian Components**
   - Modal, Notice, Setting - UI components from Obsidian
   - Used for building the plugin's user interface
   - Ensures consistent look and feel with Obsidian

## Development Setup

### Build System

The plugin uses a standard Obsidian plugin build system:

1. **esbuild**
   - Fast JavaScript/TypeScript bundler
   - Configured in `esbuild.config.mjs`
   - Bundles the plugin into a single JavaScript file

2. **TypeScript Compiler**
   - Configured in `tsconfig.json`
   - Set to target ES6
   - Strict type checking enabled

### Project Structure

```
claudesidian-mcp/
├── src/                    # Source code
│   ├── ai/                 # AI integration
│   │   ├── adapters/       # AI provider adapters
│   │   └── interfaces/     # AI-related interfaces
│   ├── components/         # UI components
│   ├── mcp/                # MCP server implementation
│   ├── services/           # Core services
│   │   ├── interfaces/     # Service interfaces
│   │   └── storage/        # Storage implementations
│   ├── tools/              # MCP tools
│   │   ├── core/           # Core tools
│   │   └── interfaces/     # Tool interfaces
│   ├── types/              # TypeScript type definitions
│   └── utils/              # Utility functions
├── manifest.json           # Plugin manifest
├── package.json            # NPM package configuration
└── tsconfig.json           # TypeScript configuration
```

### Development Workflow

1. **Local Development**
   - Run `npm run dev` to start development build with watch mode
   - Changes are automatically compiled and hot-reloaded
   - Obsidian Developer Tools can be used for debugging

2. **Testing**
   - Manual testing within Obsidian
   - Testing with Claude Desktop for MCP integration
   - Use of MCP Inspector for debugging MCP communication

3. **Building**
   - Run `npm run build` to create production build
   - Output files are placed in the root directory
   - `main.js`, `styles.css`, and `manifest.json` are the distributable files

## Technical Constraints

### Obsidian Constraints

1. **Plugin Sandbox**
   - Obsidian plugins run in a sandboxed environment
   - Limited access to the file system (only through Obsidian's API)
   - Must use Obsidian's API for all vault operations

2. **Mobile Compatibility**
   - Plugin should work on Obsidian Mobile (iOS/Android)
   - Limited system access on mobile platforms
   - Different file system APIs on mobile

3. **Performance Impact**
   - Plugins should not significantly impact Obsidian's performance
   - Heavy operations should be asynchronous
   - UI should remain responsive

### MCP Constraints

1. **Protocol Compliance**
   - Must adhere to the MCP specification
   - Must handle protocol versioning
   - Must implement required endpoints

2. **Security Model**
   - Local-only connections for security
   - Path restrictions for vault access
   - User approval for sensitive operations

3. **Client Compatibility**
   - Must work with Claude Desktop and other MCP clients
   - Must handle different client capabilities
   - Must provide clear error messages for compatibility issues

## Dependencies

### Production Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@modelcontextprotocol/sdk` | ^0.1.0 | MCP protocol implementation |
| `obsidian` | ^1.4.0 | Obsidian API |
| `zod` | ^3.22.4 | Schema validation |

### Development Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@types/node` | ^16.11.6 | TypeScript definitions for Node.js |
| `@typescript-eslint/eslint-plugin` | ^5.2.0 | ESLint plugin for TypeScript |
| `@typescript-eslint/parser` | ^5.2.0 | TypeScript parser for ESLint |
| `builtin-modules` | ^3.3.0 | List of Node.js built-in modules |
| `esbuild` | ^0.17.3 | JavaScript bundler |
| `typescript` | ^4.4.4 | TypeScript compiler |

## Environment Requirements

### Development Environment

- Node.js 16.x or higher
- npm 7.x or higher
- TypeScript 4.4.x or higher
- Modern code editor (VS Code recommended)
- Obsidian (latest version)

### Runtime Environment

- Obsidian v1.4.0 or higher
- Operating System: Windows, macOS, or Linux
- For MCP integration: Claude Desktop or other MCP client

## Configuration Options

The plugin provides several configuration options through the settings tab:

1. **Root Path**
   - Base path for plugin operations
   - Default: `claudesidian`
   - Used for organizing plugin-related files

2. **Allowed Paths**
   - List of paths that the plugin can access
   - Default: All paths allowed
   - Used for restricting access to sensitive files

3. **AI Provider**
   - Selection of AI provider for completions
   - Default: `openrouter`
   - Determines which AI adapter to use

4. **API Keys**
   - API keys for AI providers
   - Stored securely in plugin settings
   - Required for AI completion functionality

5. **Default Model**
   - Default AI model to use for completions
   - Default: `gpt-4o-mini`
   - Can be overridden in tool calls

## Integration Points

### Obsidian Integration

- **Vault API**: Used for file operations
- **Workspace API**: Used for UI integration
- **Plugin Settings API**: Used for configuration
- **Events API**: Used for reacting to vault changes

### MCP Integration

- **Tools**: Expose functionality to AI assistants
- **Resources**: Expose vault content to AI assistants
- **Server**: Handle MCP protocol communication

### AI Provider Integration

- **OpenRouter**: Primary AI provider
- **Adapter Pattern**: Allows adding other providers
- **Completion API**: Used for generating AI responses
