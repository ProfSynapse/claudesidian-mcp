# Nexus - AI Chat for Obsidian

Nexus is an AI chat assistant integrated directly into Obsidian. Chat with powerful AI models to manage notes, search your vault, and organize your knowledge—all without leaving Obsidian.

> 🧪 Experimental Plugin: Always monitor API costs when using LLM features!

## Features

- 💬 **Native AI Chat**
  - Talk to AI assistants directly inside Obsidian
  - Streamed responses with live tool-call monitoring
  - Conversation branching and history
  - Multiple LLM provider support (Anthropic, OpenAI, Google, Groq, and more)

- 🧠 **Workspace Memory System**
  - Session and state management scoped to workspaces
  - Persistent conversation history
  - JSON-based storage for transparency and portability

- 📝 **Vault Operations**
  - Create, read, and edit notes through conversation
  - Search vault content with natural language
  - Manage file structure and organization
  - Work with frontmatter and metadata

- 🔍 **Advanced Search**
  - Text search with keyword and fuzzy matching
  - Intelligent query analysis
  - Tag and property filtering
  - Memory search across conversation history

- 🏗️ **Agent-Mode Architecture**
  - Specialized agents for different tasks
  - Content Manager, Vault Manager, Vault Librarian, Memory Manager, Agent Manager
  - Type-safe operations with built-in validation

## Installation

### Manual Installation

1. Download the latest release files:
   - manifest.json
   - styles.css
   - main.js

2. Create folder: `path/to/vault/.obsidian/plugins/nexus/`

3. Copy the downloaded files to that folder

4. Enable the plugin in Obsidian Settings → Community Plugins

5. Configure your LLM provider API keys in Nexus settings

### From Obsidian Community Plugins

*Coming soon - Nexus will be available in the Obsidian Community Plugins directory*

## Getting Started

1. **Open Nexus Chat**
   - Click the Nexus icon in the ribbon, or
   - Use command palette: "Open AI Chat"

2. **Configure LLM Provider**
   - Go to Settings → Nexus → LLM Providers
   - Add API key for your preferred provider (Anthropic Claude, OpenAI, etc.)
   - Select default model

3. **Start Chatting!**
   - Ask Nexus to help with note-taking tasks
   - Search your vault with natural language
   - Create and organize notes through conversation

## Example Commands

- "Create a project note for my new research on quantum computing"
- "Search for all notes about machine learning and summarize them"
- "Organize my daily notes from last week"
- "Find notes tagged with #important and update their frontmatter"
- "List all files in my Projects folder"

## Agent Management

Nexus includes an **Agent Manager** that lets you create custom AI agents with specialized prompts and configurations. Use LLM providers to power automated workflows.

- Create custom agents with specific instructions
- Execute prompts directly from your notes
- Integrate with multiple LLM providers
- Track costs and usage

## Configuration

### LLM Providers

Nexus supports multiple LLM providers:

- **Anthropic** (Claude)
- **OpenAI** (GPT-4, GPT-3.5)
- **Google** (Gemini)
- **Groq** (Fast Llama models)
- **Mistral AI**
- **Perplexity**
- **OpenRouter** (Access to many models)

Configure providers in: Settings → Nexus → LLM Providers

### Workspaces

Organize your conversations and memory by workspace:

- Each workspace has its own sessions and memory traces
- Store workspaces in `.workspaces/` at vault root
- Default workspace created automatically
- Switch workspaces from chat interface

## Architecture

Nexus uses an **Agent-Mode Architecture**:

- **Agents**: Logical domains (ContentManager, VaultManager, etc.)
- **Modes**: Specific operations within each agent
- **Services**: Shared functionality (WorkspaceService, MemoryService, etc.)
- **Chat Interface**: User-facing AI assistant powered by agents

This architecture ensures:
- Clean separation of concerns
- Consistent interfaces
- Type safety
- Easy testing and maintenance

## Development

```bash
# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Support & Contributing

- **Issues**: [Report bugs on GitHub](https://github.com/ProfSynapse/nexus/issues)
- **Discussions**: Share ideas and get help
- **Contributing**: Pull requests welcome!

## License

MIT License - see LICENSE file for details

## Credits

Created by **Synaptic Labs**

Built with ❤️ for the Obsidian community

---

**Note**: Nexus v1.0.0 is a complete reimagining of the plugin, focusing on integrated local chat instead of external MCP connections. Previous versions were known as "Claudesidian MCP".
