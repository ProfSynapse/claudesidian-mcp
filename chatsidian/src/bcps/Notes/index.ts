/**
 * Bounded Context Pack (BCP) for Note Operations.
 *
 * This BCP consolidates tools related to reading and editing note content,
 * mapping functionalities from the old 'noteReader' and 'noteEditor' agents.
 * It utilizes the core services (StorageManager, EventEmitter) provided
 * during initialization.
 */
import { App, TFile } from 'obsidian'; // Import Obsidian types
import { BCP, ToolDefinition, BaseToolParams, BaseToolResult, ToolContext } from '../../core/types'; // Import ToolContext

// --- Tool Parameter and Result Types (Basic Placeholders) ---

interface ReadNoteParams extends BaseToolParams {
  path: string;
}
interface ReadNoteResult extends BaseToolResult {
  content?: string;
}

interface ReadLinesParams extends BaseToolParams {
  path: string;
  startLine: number;
  endLine?: number; // Optional: read to end if not provided
  count?: number; // Optional: alternative to endLine
}
interface ReadLinesResult extends BaseToolResult {
  lines?: string[];
}

interface AppendNoteParams extends BaseToolParams {
  path: string;
  content: string;
}

interface PrependNoteParams extends BaseToolParams {
  path: string;
  content: string;
}

interface InsertNoteParams extends BaseToolParams {
  path: string;
  content: string;
  lineNumber?: number; // Insert at specific line
  afterLineContaining?: string; // Alternative: insert after first line matching text
}

interface ReplaceNoteParams extends BaseToolParams {
  path: string;
  search: string; // Text or regex to find
  replace: string; // Replacement text
  replaceAll?: boolean; // Default: replace first occurrence
}

interface DeleteNoteParams extends BaseToolParams {
  path: string;
  search?: string; // Delete lines containing this text/regex
  lineNumber?: number; // Delete specific line
  lineCount?: number; // Delete multiple lines starting from lineNumber
}

// --- Tool Definitions ---

const readNote: ToolDefinition<ReadNoteParams, ReadNoteResult> = {
  name: 'read',
  description: 'Reads the entire content of a specific note.',
  // Update handler signature to accept context
  handler: async (context: ToolContext, params: ReadNoteParams): Promise<ReadNoteResult> => {
    // Placeholder implementation until context injection is available
    console.log('Executing Notes.read with params:', params);
    // const { path } = params;
    // Need access to App or VaultService here
    // Example (requires context):
    // try {
    //   const file = context.app.vault.getAbstractFileByPath(path);
    //   if (!file || !(file instanceof TFile)) throw new Error(...);
    //   const content = await context.app.vault.read(file);
    //   return { success: true, content };
    // } catch (error: any) { ... }
    return { success: false, error: 'Notes.read not fully implemented: Missing context (App/VaultService).' };
  },
  // TODO: Add getParameterSchema if needed
};

const readLines: ToolDefinition<ReadLinesParams, ReadLinesResult> = {
  name: 'read_lines',
  description: 'Reads specific lines from a note, specified by start/end lines or start line and count.',
  // Update handler signature to accept context
  handler: async (context: ToolContext, params: ReadLinesParams): Promise<ReadLinesResult> => {
    // Placeholder implementation until context injection is available
    console.log('Executing Notes.read_lines with params:', params);
    // const { path, startLine, endLine, count } = params;
    // Need access to App or VaultService here
    // Example (requires context):
    // try {
    //   const file = context.app.vault.getAbstractFileByPath(path);
    //   if (!file || !(file instanceof TFile)) throw new Error(...);
    //   const content = await context.app.vault.read(file);
    //   const lines = content.replace(/\r\n/g, '\n').split('\n');
    //
    //   if (startLine < 1) throw new Error('Invalid start line. Line numbers are 1-based.');
    //   const actualStartLine = startLine - 1; // Adjust to 0-based index
    //
    //   let actualEndLine: number;
    //   if (endLine !== undefined) {
    //     if (endLine < startLine) throw new Error('End line must be >= start line.');
    //     actualEndLine = Math.min(lines.length, endLine); // Use endLine (adjusted later if needed)
    //   } else if (count !== undefined) {
    //     if (count < 1) throw new Error('Count must be >= 1.');
    //     actualEndLine = Math.min(lines.length, actualStartLine + count);
    //   } else {
    //     actualEndLine = lines.length; // Read to end if neither endLine nor count is provided
    //   }
    //
    //   const resultLines = lines.slice(actualStartLine, actualEndLine);
    //   return { success: true, lines: resultLines };
    // } catch (error: any) { ... }
    return { success: false, error: 'Notes.read_lines not fully implemented: Missing context (App/VaultService).' };
  },
  // TODO: Add getParameterSchema if needed
};

const appendNote: ToolDefinition<AppendNoteParams, BaseToolResult> = {
  name: 'append',
  description: 'Appends content to the end of a specific note.',
  // Update handler signature to accept context
  handler: async (context: ToolContext, params: AppendNoteParams): Promise<BaseToolResult> => {
    // Placeholder implementation until context injection is available
    console.log('Executing Notes.append with params:', params);
    // const { path, content: appendContent } = params;
    // Need access to App or VaultService here
    // Example (requires context):
    // try {
    //   const file = context.app.vault.getAbstractFileByPath(path);
    //   if (!file || !(file instanceof TFile)) throw new Error(...);
    //
    //   // TODO: Ideally, check for active editor and use editor.replaceRange if possible.
    //   // Fallback logic:
    //   const currentContent = await context.app.vault.read(file);
    //   const needsNewline = currentContent.length > 0 && !currentContent.endsWith('\n') && !appendContent.startsWith('\n');
    //   const separator = needsNewline ? '\n' : '';
    //   const newContent = currentContent + separator + appendContent;
    //   await context.app.vault.modify(file, newContent);
    //
    //   return { success: true };
    // } catch (error: any) { ... }
    return { success: false, error: 'Notes.append not fully implemented: Missing context (App/VaultService).' };
  },
  // TODO: Add getParameterSchema if needed
};

const prependNote: ToolDefinition<PrependNoteParams, BaseToolResult> = {
  name: 'prepend',
  description: 'Prepends content to the beginning of a specific note.',
  // Update handler signature to accept context
  handler: async (context: ToolContext, params: PrependNoteParams): Promise<BaseToolResult> => {
    // Placeholder implementation until context injection is available
    console.log('Executing Notes.prepend with params:', params);
    // const { path, content: prependContent } = params;
    // Need access to App or VaultService here
    // Example (requires context):
    // try {
    //   const file = context.app.vault.getAbstractFileByPath(path);
    //   if (!file || !(file instanceof TFile)) throw new Error(...);
    //
    //   // TODO: Ideally, check for active editor and use editor.replaceRange if possible.
    //   // Fallback logic:
    //   const currentContent = await context.app.vault.read(file);
    //   const needsNewline = currentContent.length > 0 && !prependContent.endsWith('\n') && !currentContent.startsWith('\n');
    //   const separator = needsNewline ? '\n' : '';
    //   const newContent = prependContent + separator + currentContent;
    //   await context.app.vault.modify(file, newContent);
    //
    //   return { success: true };
    // } catch (error: any) { ... }
    return { success: false, error: 'Notes.prepend not fully implemented: Missing context (App/VaultService).' };
  },
  // TODO: Add getParameterSchema if needed
};

const insertNote: ToolDefinition<InsertNoteParams, BaseToolResult> = {
  name: 'insert',
  description: 'Inserts content at a specific line number or after a line containing specific text in a note.',
  // Update handler signature to accept context
  handler: async (context: ToolContext, params: InsertNoteParams): Promise<BaseToolResult> => {
    // Placeholder implementation until context injection is available
    console.log('Executing Notes.insert with params:', params);
    // const { path, content: insertContent, lineNumber, afterLineContaining } = params;
    // Need access to App or VaultService here
    // Example (requires context):
    // try {
    //   const file = context.app.vault.getAbstractFileByPath(path);
    //   if (!file || !(file instanceof TFile)) throw new Error(...);
    //
    //   // TODO: Ideally, check for active editor and use editor.replaceRange if possible.
    //   // Fallback logic:
    //   const currentContent = await context.app.vault.read(file);
    //   const lines = currentContent.replace(/\r\n/g, '\n').split('\n');
    //   let insertPosition = -1;
    //
    //   if (lineNumber !== undefined) {
    //     if (lineNumber < 1) throw new Error('Invalid line number. Line numbers are 1-based.');
    //     insertPosition = lineNumber - 1; // Adjust to 0-based index
    //     if (insertPosition > lines.length) throw new Error(`Invalid line number. Note has only ${lines.length} lines.`);
    //   } else if (afterLineContaining !== undefined) {
    //     // TODO: Implement logic to find the line number after the line containing the text
    //     const foundIndex = lines.findIndex(line => line.includes(afterLineContaining));
    //     if (foundIndex === -1) throw new Error(`Text "${afterLineContaining}" not found in note.`);
    //     insertPosition = foundIndex + 1;
    //   } else {
    //     throw new Error('Either lineNumber or afterLineContaining must be provided for insertion.');
    //   }
    //
    //   if (insertPosition === lines.length) {
    //     lines.push(insertContent); // Append if inserting after the last line
    //   } else {
    //     lines.splice(insertPosition, 0, insertContent); // Insert at the specified position
    //   }
    //
    //   const newContent = lines.join('\n');
    //   await context.app.vault.modify(file, newContent);
    //
    //   return { success: true };
    // } catch (error: any) { ... }
    return { success: false, error: 'Notes.insert not fully implemented: Missing context (App/VaultService).' };
  },
  // TODO: Add getParameterSchema if needed
};

const replaceNote: ToolDefinition<ReplaceNoteParams, BaseToolResult> = {
  name: 'replace',
  description: 'Replaces text within a note. By default, replaces the first occurrence unless replaceAll is true.',
  // Update handler signature to accept context
  handler: async (context: ToolContext, params: ReplaceNoteParams): Promise<BaseToolResult> => {
    // Placeholder implementation until context injection is available
    console.log('Executing Notes.replace with params:', params);
    // const { path, search, replace, replaceAll } = params;
    // Need access to App or VaultService here
    // Example (requires context):
    // try {
    //   const file = context.app.vault.getAbstractFileByPath(path);
    //   if (!file || !(file instanceof TFile)) throw new Error(...);
    //
    //   // TODO: Ideally, check for active editor and use editor.replaceRange if possible.
    //   // Fallback logic:
    //   const currentContent = await context.app.vault.read(file);
    //   let newContent: string;
    //
    //   if (currentContent.indexOf(search) === -1) {
    //     throw new Error(`Text "${search}" not found in note.`);
    //   }
    //
    //   if (replaceAll) {
    //     const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    //     const regex = new RegExp(escapedSearch, 'g');
    //     newContent = currentContent.replace(regex, replace);
    //   } else {
    //     newContent = currentContent.replace(search, replace); // Replace only the first occurrence
    //   }
    //
    //   await context.app.vault.modify(file, newContent);
    //
    //   return { success: true };
    // } catch (error: any) { ... }
    return { success: false, error: 'Notes.replace not fully implemented: Missing context (App/VaultService).' };
  },
  // TODO: Add getParameterSchema if needed
};

const deleteNoteContent: ToolDefinition<DeleteNoteParams, BaseToolResult> = {
  name: 'delete_content', // Renamed from 'delete' to avoid conflict with potential file deletion tool
  description: 'Deletes specific lines, a range of lines, or lines containing specific text from a note.',
  // Update handler signature to accept context
  handler: async (context: ToolContext, params: DeleteNoteParams): Promise<BaseToolResult> => {
    // Placeholder implementation until context injection is available
    console.log('Executing Notes.delete_content with params:', params);
    // const { path, search, lineNumber, lineCount } = params;
    // Need access to App or VaultService here
    // Example (requires context):
    // try {
    //   const file = context.app.vault.getAbstractFileByPath(path);
    //   if (!file || !(file instanceof TFile)) throw new Error(...);
    //
    //   // TODO: Ideally, check for active editor and use editor.replaceRange if possible.
    //   // Fallback logic:
    //   const currentContent = await context.app.vault.read(file);
    //   let lines = currentContent.replace(/\r\n/g, '\n').split('\n');
    //   let linesRemoved = 0;
    //
    //   if (search !== undefined) {
    //     // TODO: Implement logic to delete lines matching search text/regex
    //     const initialLength = lines.length;
    //     const regex = new RegExp(search); // Basic regex, might need refinement
    //     lines = lines.filter(line => !regex.test(line));
    //     linesRemoved = initialLength - lines.length;
    //   } else if (lineNumber !== undefined) {
    //     if (lineNumber < 1 || lineNumber > lines.length) throw new Error('Invalid line number.');
    //     const start = lineNumber - 1;
    //     const count = lineCount !== undefined ? Math.max(1, lineCount) : 1;
    //     const removed = lines.splice(start, count);
    //     linesRemoved = removed.length;
    //   } else {
    //     throw new Error('Either search, lineNumber must be provided for deletion.');
    //   }
    //
    //   if (linesRemoved === 0 && search !== undefined) {
    //      // Optional: return success even if search found nothing, or throw/return error?
    //      // console.log(`Search term "${search}" not found, no lines deleted.`);
    //   }
    //
    //   const newContent = lines.join('\n');
    //   await context.app.vault.modify(file, newContent);
    //
    //   return { success: true };
    // } catch (error: any) { ... }
    return { success: false, error: 'Notes.delete_content not fully implemented: Missing context (App/VaultService).' };
  },
  // TODO: Add getParameterSchema if needed
};

// --- BCP Definition ---

export const NotesBCP: BCP = {
  domain: 'Notes',
  tools: [
    readNote,
    readLines,
    appendNote,
    prependNote,
    insertNote,
    replaceNote,
    deleteNoteContent,
    // TODO: Add batch operations later if needed
  ],
};

// Export the BCP object directly
export default NotesBCP;
