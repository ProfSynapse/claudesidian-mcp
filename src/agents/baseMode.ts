import { IMode } from './interfaces/IMode';
import { CommonParameters, CommonResult } from '../types';
import { 
  getCommonParameterSchema, 
  getCommonResultSchema, 
  createResult,
  mergeWithCommonSchema
} from '../utils/schemaUtils';

/**
 * Base class for all modes in the MCP plugin
 * Provides common functionality for mode implementation
 */
export abstract class BaseMode<T extends CommonParameters = CommonParameters, R extends CommonResult = CommonResult> implements IMode<T, R> {
  slug: string;
  name: string;
  description: string;
  version: string;
  
  /**
   * Create a new mode
   * @param slug Slug of the mode (used for identification)
   * @param name Name of the mode
   * @param description Description of the mode
   * @param version Version of the mode
   */
  constructor(slug: string, name: string, description: string, version: string) {
    this.slug = slug;
    this.name = name;
    this.description = description;
    this.version = version;
  }
  
  /**
   * Execute the mode with parameters
   * @param params Parameters for the mode
   * @returns Promise that resolves with the mode's result
   */
  abstract execute(params: T): Promise<R>;
  
  /**
   * Get the JSON schema for the mode's parameters
   * @returns JSON schema object
   */
  abstract getParameterSchema(): any;
  
  /**
   * Get common parameter schema elements for workspace context and handoff
   * This is now a proxy to the central utility for DRY implementation
   * @returns JSON schema for common parameters
   */
  protected getCommonParameterSchema(): any {
    return getCommonParameterSchema();
  }
  
  /**
   * Get the JSON schema for the mode's result
   * @returns JSON schema object
   */
  getResultSchema(): any {
    // Default implementation returns the common result schema
    return getCommonResultSchema();
  }
  
  /**
   * Helper method to merge mode-specific schema with common schema
   * This ensures that every mode has workspace context and handoff parameters
   * @param customSchema The mode-specific schema
   * @returns Merged schema with common parameters
   */
  protected getMergedSchema(customSchema: any): any {
    // Get the merged schema with common parameters
    const mergedSchema = mergeWithCommonSchema(customSchema);
    
    // Ensure the schema has a type and properties
    mergedSchema.type = mergedSchema.type || 'object';
    mergedSchema.properties = mergedSchema.properties || {};
    
    // Make sure workspaceContext and handoff are defined as optional properties
    // This is a safety check in case they're not included in the common schema for some reason
    if (!mergedSchema.properties.workspaceContext) {
      mergedSchema.properties.workspaceContext = {
        type: 'object',
        properties: {
          workspaceId: { 
            type: 'string',
            description: 'Workspace identifier' 
          },
          workspacePath: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'Path from root workspace to specific phase/task'
          },
          sessionId: {
            type: 'string',
            description: 'Session identifier to track related tool calls (required)'
          }
        },
        description: 'Optional workspace context'
      };
    }
    
    if (!mergedSchema.properties.handoff) {
      mergedSchema.properties.handoff = {
        type: 'object',
        properties: {
          tool: { 
            type: 'string',
            description: 'Agent name to hand off to' 
          },
          mode: { 
            type: 'string',
            description: 'Mode to execute' 
          },
          parameters: { 
            type: 'object',
            description: 'Parameters to pass to the next mode'
          }
        },
        required: ['tool', 'mode', 'parameters'],
        description: 'Optional handoff to another tool'
      };
    }
    
    return mergedSchema;
  }
  
  /**
   * Prepare a standardized result object
   * @param success Whether the operation was successful
   * @param data Operation-specific data
   * @param error Error message if operation failed
   * @param workspaceContext Workspace context used
   * @param handoffResult Result from handoff operation
   * @returns Standardized result object
   */
  protected prepareResult(
    success: boolean,
    data?: any,
    error?: string,
    workspaceContext?: CommonResult['workspaceContext'],
    handoffResult?: any
  ): R {
    // Get the sessionId from the execution context if available
    const sessionId = (this as any).sessionId;
    
    if (!sessionId) {
      // Session ID is required, so we should report an error
      return createResult<R>(
        false, 
        null, 
        'Session ID is required but not provided',
        workspaceContext, 
        null,
        undefined
      );
    }
    
    return createResult<R>(success, data, error, workspaceContext, handoffResult, sessionId);
  }
  
  /**
   * Set parent workspace context for session tracking
   * This allows session IDs to be propagated between modes
   * @param context Parent workspace context
   */
  setParentContext(context: CommonResult['workspaceContext']): void {
    (this as any).parentContext = context;
  }
  
  /**
   * Handle handoff to another agent/mode
   * @param handoff Handoff parameters
   * @param currentResult Current result to include in handoff
   * @returns Promise resolving to result with handoff result
   */
  protected async handleHandoff(
    handoff: CommonParameters['handoff'],
    currentResult: R
  ): Promise<R> {
    if (!handoff) {
      return currentResult;
    }
    
    try {
      // This is a placeholder - actual implementation requires agent manager
      // which should be injected into each agent during initialization
      // The actual implementation will be in BaseAgent
      console.log('Warning: Base handleHandoff called - not implemented in BaseMode');
      
      return {
        ...currentResult,
        handoffResult: {
          success: false,
          error: 'Handoff not implemented in BaseMode'
        }
      } as R;
    } catch (error) {
      return {
        ...currentResult,
        handoffResult: {
          success: false,
          error: error.message || 'Failed to handle handoff'
        }
      } as R;
    }
  }
}