/**
 * StateCreator - Handles the creation of state snapshots
 * Follows Single Responsibility Principle by focusing only on state creation
 */

import { MemoryService } from "../services/MemoryService";
import { ContextData } from '../context/ContextBuilder';

export interface StateCreationResult {
  success: boolean;
  stateId?: string;
  error?: string;
  errorType?: 'validation' | 'creation' | 'database' | 'unknown';
}

export interface StateCreationParams {
  workspaceId: string;
  sessionId: string;
  name: string;
  description: string;
  workspace: any;
  contextData: ContextData;
}

/**
 * Service responsible for creating state snapshots
 * Follows SRP by focusing only on state creation operations
 */
export class StateCreator {
  constructor(
    private memoryService: MemoryService,
    private activityEmbedder?: any
  ) {}

  /**
   * Create a state snapshot with the provided context
   */
  async createState(params: StateCreationParams): Promise<StateCreationResult> {
    try {
      // Validate parameters before creation
      const validation = this.validateCreationParams(params);
      if (!validation.isValid) {
        return {
          success: false,
          error: validation.error,
          errorType: 'validation'
        };
      }

      // Create the context snapshot using memory service
      const stateId = await this.memoryService.createContextSnapshot(
        params.workspaceId,
        params.sessionId,
        params.name,
        params.description,
        {
          workspace: params.workspace,
          contextFiles: params.contextData.files,
          metadata: params.contextData.enhancedMetadata
        }
      );
      
      console.log(`Created state snapshot with ID: ${stateId}`);
      
      // Notify activity embedder for backward compatibility
      await this.notifyActivityEmbedder(params.sessionId, params.name, params.description);
      
      return {
        success: true,
        stateId
      };

    } catch (error) {
      console.error('Error creating state snapshot:', error);
      
      const { errorMessage, errorType } = this.categorizeError(error);
      
      return {
        success: false,
        error: errorMessage,
        errorType
      };
    }
  }

  /**
   * Validate parameters before state creation
   */
  private validateCreationParams(params: StateCreationParams): {
    isValid: boolean;
    error?: string;
  } {
    // Primary validation for sessionId since states should be tied to sessions
    if (!params.sessionId || typeof params.sessionId !== 'string') {
      return {
        isValid: false,
        error: `Invalid sessionId: ${params.sessionId}`
      };
    }
    
    if (!params.name || typeof params.name !== 'string') {
      return {
        isValid: false,
        error: `Invalid state name: ${params.name}`
      };
    }

    if (!params.workspaceId || typeof params.workspaceId !== 'string') {
      return {
        isValid: false,
        error: `Invalid workspaceId: ${params.workspaceId}`
      };
    }

    if (!params.workspace) {
      return {
        isValid: false,
        error: 'Workspace data is required for state creation'
      };
    }

    if (!params.contextData) {
      return {
        isValid: false,
        error: 'Context data is required for state creation'
      };
    }

    return { isValid: true };
  }

  /**
   * Notify activity embedder for backward compatibility
   */
  private async notifyActivityEmbedder(
    sessionId: string,
    name: string,
    description: string
  ): Promise<void> {
    if (!this.activityEmbedder || typeof this.activityEmbedder.createStateSnapshot !== 'function') {
      return;
    }

    try {
      await this.activityEmbedder.createStateSnapshot(sessionId, name, description);
    } catch (embedderError) {
      console.warn('Failed to notify activity embedder of state creation:', embedderError);
      // Don't fail the entire operation for embedder issues
    }
  }

  /**
   * Categorize errors for better error handling
   */
  private categorizeError(error: unknown): {
    errorMessage: string;
    errorType: 'validation' | 'creation' | 'database' | 'unknown';
  } {
    const baseMessage = error instanceof Error ? error.message : String(error);
    
    // Check for database-specific errors
    if (baseMessage.includes('index') && baseMessage.includes('not found')) {
      return {
        errorMessage: "Database schema is missing required indexes. Try manually deleting the database from your browser's developer tools and try again.",
        errorType: 'database'
      };
    }

    // Check for validation errors
    if (baseMessage.includes('Invalid') || baseMessage.includes('required')) {
      return {
        errorMessage: `Validation error: ${baseMessage}`,
        errorType: 'validation'
      };
    }

    // Check for creation-specific errors
    if (baseMessage.includes('create') || baseMessage.includes('snapshot')) {
      return {
        errorMessage: `State creation failed: ${baseMessage}`,
        errorType: 'creation'
      };
    }

    return {
      errorMessage: `Error creating state snapshot: ${baseMessage}`,
      errorType: 'unknown'
    };
  }

  /**
   * Validate state creation prerequisites
   */
  async validatePrerequisites(
    workspaceId: string,
    sessionId: string
  ): Promise<{ isValid: boolean; error?: string }> {
    try {
      // This could be expanded to check:
      // - Memory service availability
      // - Database connectivity
      // - Workspace/session existence
      // - Required permissions
      
      if (!workspaceId) {
        return {
          isValid: false,
          error: 'Workspace ID is required'
        };
      }

      if (!sessionId) {
        return {
          isValid: false,
          error: 'Session ID is required'
        };
      }

      return { isValid: true };
    } catch (error) {
      return {
        isValid: false,
        error: `Prerequisites validation failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
}