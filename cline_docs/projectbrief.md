# Project Brief: Claudesidian MCP

## Overview

Claudesidian MCP (formerly Bridge-MCP) is an Obsidian plugin that implements the Model Context Protocol (MCP) to enable AI assistants like Claude to interact with Obsidian vaults. It serves as a bridge between AI assistants and the knowledge stored in Obsidian, allowing for seamless integration and powerful knowledge management capabilities.

## Core Requirements

1. **MCP Server Implementation**
   - Implement a fully compliant Model Context Protocol server
   - Expose Obsidian vault operations as MCP tools and resources
   - Support secure local connections from MCP clients like Claude Desktop

2. **Vault Operations**
   - Provide tools for creating, reading, updating, and deleting notes
   - Enable searching and querying vault content
   - Support folder management and organization
   - Handle metadata and frontmatter operations

3. **AI Integration**
   - Connect to AI providers like OpenRouter for completions
   - Support configurable AI models and parameters
   - Enable AI-assisted note creation and editing

4. **Security & Privacy**
   - Implement secure access controls for vault content
   - Keep all data local within the user's vault
   - Provide configurable path restrictions

5. **User Experience**
   - Offer simple setup and configuration
   - Provide status indicators and feedback
   - Support seamless integration with Claude Desktop

## Goals

1. **Enhance Knowledge Management**
   - Enable AI assistants to help organize and retrieve knowledge
   - Facilitate natural language interactions with vault content
   - Support complex queries and information retrieval

2. **Streamline Workflow**
   - Reduce friction in capturing and organizing information
   - Enable AI-assisted note creation and editing
   - Support automated organization and linking

3. **Extensibility**
   - Provide a plugin architecture for adding new tools
   - Support custom tool development
   - Enable integration with other Obsidian plugins

4. **Performance & Reliability**
   - Ensure responsive performance even with large vaults
   - Implement robust error handling
   - Support graceful degradation

## Success Criteria

1. Successful integration with Claude Desktop and other MCP clients
2. Reliable performance with vaults of various sizes
3. Positive user feedback on workflow improvements
4. Growing community of users and contributors
5. Expanding set of tools and capabilities

## Constraints

1. Must work within Obsidian's plugin architecture
2. Must maintain compatibility with MCP specification
3. Must respect user privacy and security
4. Must work across multiple platforms (Windows, macOS, Linux)
