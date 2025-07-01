import { App, TFile, WorkspaceLeaf } from 'obsidian';
import { BaseMode } from '../../baseMode';
import { CommonParameters, CommonResult } from '../../../types';
import { createErrorMessage } from '../../../utils/errorUtils';
import { smartNormalizePath } from '../../../utils/pathUtils';
import { extractContextFromParams, parseWorkspaceContext } from '../../../utils/contextUtils';
/**
 * Parameters for open note mode
 */
interface OpenNoteParameters extends CommonParameters {
  /**
   * Path to the note to open
   */
  path: string;
  
  /**
   * Where to open the note
   * - 'tab': Open in new tab
   * - 'split': Open in horizontal split
   * - 'window': Open in new window
   * - 'current': Open in current tab (default)
   */
  mode?: 'tab' | 'split' | 'window' | 'current';
  
  /**
   * Whether to focus the opened note
   */
  focus?: boolean;
}

/**
 * Result for open note mode
 */
interface OpenNoteResult extends CommonResult {
  data?: {
    path: string;
    opened: boolean;
    mode: string;
  };
}

/**
 * Mode to open a note in the vault
 */
export class OpenNoteMode extends BaseMode<OpenNoteParameters, OpenNoteResult> {
  private app: App;
  
  /**
   * Create a new OpenNoteMode
   * @param app Obsidian app instance
   */
  constructor(app: App) {
    super(
      'openNote',
      'Open Note',
      'Open a note in the vault',
      '1.0.0'
    );
    this.app = app;
  }
  
  /**
   * Execute the mode
   * @param params Mode parameters
   * @returns Promise resolving to the result
   */
  async execute(params: OpenNoteParameters): Promise<OpenNoteResult> {
    try {
      // Validate parameters
      if (!params.path) {
        return this.prepareResult(false, undefined, 'Path is required');
      }
      
      // Apply smart normalization (includes .md extension handling)
      const normalizedPath = smartNormalizePath(params.path);
      
      // Get the file
      const file = this.app.vault.getAbstractFileByPath(normalizedPath);
      if (!file || !(file instanceof TFile)) {
        return this.prepareResult(false, undefined, `Note not found at path: ${normalizedPath}`);
      }
      
      // Determine how to open the file
      const mode = params.mode || 'current';
      let leaf: WorkspaceLeaf;
      
      switch (mode) {
        case 'tab':
          leaf = this.app.workspace.getLeaf('tab');
          break;
        case 'split':
          leaf = this.app.workspace.getLeaf('split');
          break;
        case 'window':
          leaf = this.app.workspace.getLeaf('window');
          break;
        case 'current':
        default:
          leaf = this.app.workspace.getLeaf(false);
          break;
      }
      
      // Open the file
      await leaf.openFile(file);
      
      // Focus if requested
      if (params.focus !== false) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
      }
      
      return this.prepareResult(true, { 
          path: file.path,
          opened: true,
          mode: mode
        }, undefined, extractContextFromParams(params), parseWorkspaceContext(params.workspaceContext) || undefined);
      
    } catch (error) {
      return this.prepareResult(false, undefined, createErrorMessage('Failed to open note: ', error));
    }
  }
  
  /**
   * Get the parameter schema
   */
  getParameterSchema(): any {
    const commonSchema = this.getCommonParameterSchema();
    
    return {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note to open'
        },
        mode: {
          type: 'string',
          enum: ['tab', 'split', 'window', 'current'],
          description: 'Where to open the note (tab, split, window, or current)',
          default: 'current'
        },
        focus: {
          type: 'boolean',
          description: 'Whether to focus the opened note',
          default: true
        },
        ...commonSchema
      },
      required: ['path']
    };
  }
  
  /**
   * Get the result schema
   */
  getResultSchema(): any {
    const baseSchema = super.getResultSchema();
    
    // Extend the base schema to include our specific data
    baseSchema.properties.data = {
      type: 'object',
      properties: {
        path: { type: 'string' },
        opened: { type: 'boolean' },
        mode: { type: 'string' }
      }
    };
    
    return baseSchema;
  }
}
