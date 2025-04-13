# Phase 2: Implement Agents

This phase focuses on implementing each agent and its tools. We'll create the agent orchestrators, agent-specific utilities, and the domain-specific tools for each agent.

## Implementation Strategy

For each agent, follow these steps:

1. Create the agent-specific types
2. Implement the agent-specific utilities
3. Implement the agent-specific tools
4. Create the agent orchestrator

This document provides detailed implementation for the Note Reader agent as an example. The same pattern should be followed for the other agents.

## Step 1: Implement Note Reader Agent

### Create Note Reader Types

Create the file `src/agents/noteReader/types.ts`:

```typescript
/**
 * Read mode for the Note Reader
 */
export enum ReadMode {
  /**
   * Read the entire note
   */
  FULL = 'read',
  
  /**
   * Read multiple notes at once
   */
  BATCH = 'batchRead',
  
  /**
   * Read specific lines from a note
   */
  LINE = 'lineRead'
}

/**
 * Arguments for reading a note
 */
export interface ReadNoteArgs {
  /**
   * Path to the note
   */
  path: string;
}

/**
 * Arguments for batch reading notes
 */
export interface BatchReadArgs {
  /**
   * Paths to the notes
   */
  paths: string[];
}

/**
 * Arguments for reading specific lines from a note
 */
export interface ReadLineArgs {
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Start line (1-based)
   */
  startLine: number;
  
  /**
   * End line (1-based, inclusive)
   */
  endLine: number;
}

/**
 * Result of reading a note
 */
export interface ReadNoteResult {
  /**
   * Content of the note
   */
  content: string;
  
  /**
   * Path to the note
   */
  path: string;
}

/**
 * Result of batch reading notes
 */
export interface BatchReadResult {
  /**
   * Map of note paths to contents
   */
  notes: Record<string, string>;
  
  /**
   * Paths that couldn't be read
   */
  errors?: Record<string, string>;
}

/**
 * Result of reading specific lines from a note
 */
export interface ReadLineResult {
  /**
   * Lines from the note
   */
  lines: string[];
  
  /**
   * Path to the note
   */
  path: string;
  
  /**
   * Start line (1-based)
   */
  startLine: number;
  
  /**
   * End line (1-based, inclusive)
   */
  endLine: number;
}
```

### Create Note Reader Utilities

Create the file `src/agents/noteReader/utils/ReadOperations.ts`:

```typescript
import { App, TFile } from 'obsidian';

/**
 * Utility class for reading operations
 */
export class ReadOperations {
  /**
   * Read the content of a note
   * @param app Obsidian app instance
   * @param path Path to the note
   * @returns Promise that resolves with the note content
   * @throws Error if the note doesn't exist or can't be read
   */
  static async readNote(app: App, path: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof TFile)) {
      throw new Error(`File not found: ${path}`);
    }
    
    return await app.vault.read(file);
  }
  
  /**
   * Read multiple notes at once
   * @param app Obsidian app instance
   * @param paths Paths to the notes
   * @returns Promise that resolves with a map of note paths to contents
   */
  static async batchRead(app: App, paths: string[]): Promise<{
    notes: Record<string, string>;
    errors?: Record<string, string>;
  }> {
    const notes: Record<string, string> = {};
    const errors: Record<string, string> = {};
    
    for (const path of paths) {
      try {
        notes[path] = await ReadOperations.readNote(app, path);
      } catch (error) {
        errors[path] = error.message;
      }
    }
    
    return { notes, errors: Object.keys(errors).length > 0 ? errors : undefined };
  }
  
  /**
   * Read specific lines from a note
   * @param app Obsidian app instance
   * @param path Path to the note
   * @param startLine Start line (1-based)
   * @param endLine End line (1-based, inclusive)
   * @returns Promise that resolves with the specified lines
   * @throws Error if the note doesn't exist or can't be read
   */
  static async readLines(app: App, path: string, startLine: number, endLine: number): Promise<string[]> {
    const content = await ReadOperations.readNote(app, path);
    const lines = content.split('\n');
    
    // Adjust for 1-based indexing
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);
    
    return lines.slice(start, end);
  }
}
```

### Create Note Reader Tools

Create the file `src/agents/noteReader/tools/readNote.ts`:

```typescript
import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ReadNoteArgs, ReadNoteResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Tool for reading a note
 */
export class ReadNoteTool extends BaseTool<ReadNoteArgs, ReadNoteResult> {
  private app: App;
  
  /**
   * Create a new ReadNoteTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readNote',
      'Read the content of a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the note content
   */
  async execute(args: ReadNoteArgs): Promise<ReadNoteResult> {
    const { path } = args;
    
    const content = await ReadOperations.readNote(this.app, path);
    
    return {
      content,
      path
    };
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note'
        }
      },
      required: ['path']
    };
  }
}
```

Create the file `src/agents/noteReader/tools/batchRead.ts`:

```typescript
import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { BatchReadArgs, BatchReadResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Tool for batch reading notes
 */
export class BatchReadTool extends BaseTool<BatchReadArgs, BatchReadResult> {
  private app: App;
  
  /**
   * Create a new BatchReadTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'batchRead',
      'Read multiple notes at once',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the note contents
   */
  async execute(args: BatchReadArgs): Promise<BatchReadResult> {
    const { paths } = args;
    
    return await ReadOperations.batchRead(this.app, paths);
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: {
            type: 'string'
          },
          description: 'Paths to the notes'
        }
      },
      required: ['paths']
    };
  }
}
```

Create the file `src/agents/noteReader/tools/readLine.ts`:

```typescript
import { App } from 'obsidian';
import { BaseTool } from '../../baseTool';
import { ReadLineArgs, ReadLineResult } from '../types';
import { ReadOperations } from '../utils/ReadOperations';

/**
 * Tool for reading specific lines from a note
 */
export class ReadLineTool extends BaseTool<ReadLineArgs, ReadLineResult> {
  private app: App;
  
  /**
   * Create a new ReadLineTool
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'readLine',
      'Read specific lines from a note',
      '1.0.0'
    );
    
    this.app = app;
  }
  
  /**
   * Execute the tool
   * @param args Tool arguments
   * @returns Promise that resolves with the specified lines
   */
  async execute(args: ReadLineArgs): Promise<ReadLineResult> {
    const { path, startLine, endLine } = args;
    
    const lines = await ReadOperations.readLines(this.app, path, startLine, endLine);
    
    return {
      lines,
      path,
      startLine,
      endLine
    };
  }
  
  /**
   * Get the JSON schema for the tool
   * @returns JSON schema object
   */
  getSchema(): any {
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note'
        },
        startLine: {
          type: 'number',
          description: 'Start line (1-based)'
        },
        endLine: {
          type: 'number',
          description: 'End line (1-based, inclusive)'
        }
      },
      required: ['path', 'startLine', 'endLine']
    };
  }
}
```

Create the file `src/agents/noteReader/tools/index.ts`:

```typescript
export * from './readNote';
export * from './batchRead';
export * from './readLine';
```

### Create Note Reader Agent

Create the file `src/agents/noteReader/config.ts`:

```typescript
/**
 * Configuration for the Note Reader agent
 */
export const NoteReaderConfig = {
  /**
   * Name of the agent
   */
  name: 'noteReader',
  
  /**
   * Description of the agent
   */
  description: 'Read notes from the vault',
  
  /**
   * Version of the agent
   */
  version: '1.0.0'
};
```

Create the file `src/agents/noteReader/noteReader.ts`:

```typescript
import { App } from 'obsidian';
import { BaseAgent } from '../baseAgent';
import { NoteReaderConfig } from './config';
import { ReadNoteTool, BatchReadTool, ReadLineTool } from './tools';

/**
 * Agent for reading notes from the vault
 */
export class NoteReaderAgent extends BaseAgent {
  /**
   * Create a new NoteReaderAgent
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      NoteReaderConfig.name,
      NoteReaderConfig.description,
      NoteReaderConfig.version
    );
    
    // Register tools
    this.registerTool(new ReadNoteTool(app));
    this.registerTool(new BatchReadTool(app));
    this.registerTool(new ReadLineTool(app));
  }
}
```

## Step 2: Implement Other Agents

Follow the same pattern for implementing the other agents:

1. Note Editor Agent
2. Palette Commander Agent
3. Project Manager Agent
4. Vault Manager Agent
5. Vault Librarian Agent

For each agent:

1. Create the agent-specific types in `types.ts`
2. Implement the agent-specific utilities in the `utils/` directory
3. Implement the agent-specific tools in the `tools/` directory
4. Create the agent orchestrator in `[agentName].ts`

## Verification

After completing Phase 2, you should have implemented all agents and their tools. You can verify this by running:

```bash
find src/agents -type f -name "*.ts" | sort
```

This should list all the TypeScript files for the agents. Make sure all the expected files are present and implemented before proceeding to Phase 3.
