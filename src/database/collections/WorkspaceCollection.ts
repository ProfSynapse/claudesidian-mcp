import { BaseChromaCollection } from '../providers/chroma/ChromaCollections';
import { IVectorStore } from '../interfaces/IVectorStore';
import { ProjectWorkspace } from '../workspace-types';
import { WorkspaceContext, ItemStatus } from '../types/workspace/WorkspaceTypes';
import { EmbeddingService } from '../services/core/EmbeddingService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Legacy workspace interface for backward compatibility
 * Represents the old workspace format before WorkspaceContext schema
 */
interface LegacyWorkspace {
  id: string;
  name: string;
  description?: string;
  rootFolder: string;
  created: number;
  lastAccessed: number;
  
  // Legacy-specific fields that need conversion
  path?: string[];
  relatedFolders?: string[];
  relatedFiles?: string[];
  associatedNotes?: string[];
  keyFileInstructions?: string;
  
  // Complex legacy objects that need transformation
  preferences?: Record<string, any>;
  activityHistory?: Array<{
    timestamp: number;
    action: 'view' | 'edit' | 'create' | 'tool';
    toolName?: string;
    duration?: number;
    hierarchyPath?: string[];
    context?: string;
  }>;
  
  projectPlan?: string;
  checkpoints?: Array<{
    id: string;
    date: number;
    description: string;
    completed: boolean;
    hierarchyPath?: string[];
  }>;
  
  completionStatus?: Record<string, {
    status: ItemStatus;
    completedDate?: number;
    completionNotes?: string;
  }>;
  
  
  // Missing in legacy: context field (the key difference)
}

/**
 * Migration result for tracking conversion status
 */
interface MigrationResult {
  success: boolean;
  workspace?: ProjectWorkspace;
  errors?: string[];
  warnings?: string[];
  migratedFields?: string[];
  preservedFields?: string[];
}

/**
 * Validation result for data integrity checks
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Collection manager for project workspaces
 */
export class WorkspaceCollection extends BaseChromaCollection<ProjectWorkspace> {
  private embeddingService?: EmbeddingService;

  /**
   * Create a new workspace collection
   * @param vectorStore Vector store instance
   * @param embeddingService Optional embedding service for real embeddings
   */
  constructor(vectorStore: IVectorStore, embeddingService?: EmbeddingService) {
    super(vectorStore, 'workspaces');
    this.embeddingService = embeddingService;
  }
  
  /**
   * Extract ID from a workspace
   * @param workspace Workspace object
   * @returns Workspace ID
   */
  protected extractId(workspace: ProjectWorkspace): string {
    return workspace.id;
  }
  
  /**
   * Convert a workspace to storage format
   * @param workspace Workspace object
   * @returns Storage object
   */
  protected async itemToStorage(workspace: ProjectWorkspace): Promise<{
    id: string;
    embedding: number[];
    metadata: Record<string, any>;
    document: string;
  }> {
    // For workspaces, we'll create a simple text representation for embedding
    const document = this.workspaceToDocument(workspace);
    
    // Extract important metadata fields for filtering and searching
    const metadata = {
      name: workspace.name,
      description: workspace.description || '',
      rootFolder: workspace.rootFolder,
      created: workspace.created,
      lastAccessed: workspace.lastAccessed,
      
      // Store associated notes
      associatedNotes: workspace.associatedNotes ? workspace.associatedNotes.join(',') : '',
      
      // Store other complex fields as JSON
      relatedFiles: workspace.relatedFiles ? JSON.stringify(workspace.relatedFiles) : '',
      activityHistory: JSON.stringify(workspace.activityHistory),
      preferences: workspace.preferences ? JSON.stringify(workspace.preferences) : '',
      checkpoints: workspace.checkpoints ? JSON.stringify(workspace.checkpoints) : '',
      completionStatus: JSON.stringify(workspace.completionStatus),
      context: workspace.context ? JSON.stringify(workspace.context) : '',
      
      // Metadata field for searching
      isWorkspace: true,
    };
    
    // Generate real embedding if service is available, otherwise use placeholder
    let embedding: number[];
    if (this.embeddingService && this.embeddingService.areEmbeddingsEnabled()) {
      try {
        embedding = await this.embeddingService.getEmbedding(document) || [];
      } catch (error) {
        console.warn('Failed to generate embedding for workspace, using placeholder:', error);
        embedding = this.generateSimpleEmbedding(document);
      }
    } else {
      embedding = this.generateSimpleEmbedding(document);
    }
    
    return {
      id: workspace.id,
      embedding,
      metadata,
      document
    };
  }
  
  /**
   * Convert from storage format to workspace
   * Enhanced with backward compatibility for legacy workspace formats
   * @param storage Storage object
   * @returns Workspace object
   */
  protected storageToItem(storage: {
    id: string;
    embedding?: number[];
    metadata?: Record<string, any>;
    document?: string;
  }): ProjectWorkspace {
    
    // If no metadata is provided, we'll create a minimal workspace
    if (!storage.metadata) {
      return {
        id: storage.id,
        name: 'Unknown Workspace',
        created: Date.now(),
        lastAccessed: Date.now(),
        rootFolder: '/',
        relatedFolders: [],
        activityHistory: [],
        completionStatus: {}
      };
    }
    
    // ENHANCED: Comprehensive schema detection and conversion
    const workspaceVersion = this.detectWorkspaceVersion(storage.metadata);
    
    // Handle different workspace formats with enhanced error recovery
    try {
      switch (workspaceVersion) {
        case 'modern':
          return this.convertModernWorkspace({
            ...storage,
            metadata: storage.metadata || {}
          });
          
        case 'legacy':
          return this.convertLegacyWorkspace({
            ...storage,
            metadata: storage.metadata || {}
          });
          
        case 'hybrid':
          return this.completeHybridWorkspace({
            ...storage,
            metadata: storage.metadata || {}
          });
          
        default:
          return this.convertLegacyWorkspace({
            ...storage,
            metadata: storage.metadata || {}
          });
      }
    } catch (error) {
      
      // Fallback: Create minimal viable workspace
      return this.createFallbackWorkspace({
        ...storage,
        metadata: storage.metadata || {}
      });
    }
  }
  
  /**
   * Convert modern format workspace with validation
   * @param storage Storage object with modern metadata
   * @returns ProjectWorkspace
   */
  private convertModernWorkspace(storage: {
    id: string;
    embedding?: number[];
    metadata: Record<string, any>;
    document?: string;
  }): ProjectWorkspace {
    const workspace: ProjectWorkspace = {
      id: storage.id,
      name: storage.metadata.name || 'Unknown Workspace',
      description: storage.metadata.description || undefined,
      created: storage.metadata.created || Date.now(),
      lastAccessed: storage.metadata.lastAccessed || Date.now(),
      rootFolder: storage.metadata.rootFolder || '/',
      relatedFolders: this.parseJsonField(storage.metadata.relatedFolders, []),
      relatedFiles: this.parseJsonField(storage.metadata.relatedFiles, undefined),
      associatedNotes: this.parseStringArray(storage.metadata.associatedNotes),
      activityHistory: this.parseJsonField(storage.metadata.activityHistory, []),
      preferences: this.parseJsonField(storage.metadata.preferences, undefined),
      projectPlan: storage.metadata.projectPlan || undefined,
      checkpoints: this.parseJsonField(storage.metadata.checkpoints, undefined),
      completionStatus: this.parseJsonField(storage.metadata.completionStatus, {}),
      context: this.parseJsonField(storage.metadata.context, undefined)
    };
    
    // Validate context structure for modern workspaces
    if (!workspace.context || !workspace.context.purpose) {
      workspace.context = this.buildWorkspaceContextFromLegacy(storage.metadata);
    }
    
    return workspace;
  }
  
  /**
   * Create minimal viable workspace for error recovery
   * @param storage Storage object with potentially corrupted data
   * @returns Minimal functional ProjectWorkspace
   */
  private createFallbackWorkspace(storage: {
    id: string;
    embedding?: number[];
    metadata: Record<string, any>;
    document?: string;
  }): ProjectWorkspace {
    
    const fallbackContext: WorkspaceContext = {
      purpose: storage.metadata.name ? `Workspace: ${storage.metadata.name}` : 'Recovered workspace',
      currentGoal: 'Define workspace structure and goals',
      status: 'Needs review - recovered from corrupted data',
      workflows: [{
        name: 'General Workflow',
        when: 'When working in this workspace',
        steps: ['Review workspace', 'Update structure', 'Continue work']
      }],
      keyFiles: [],
      preferences: ['Recovered from corrupted format'],
      agents: [],
      nextActions: ['Review workspace structure', 'Update goals and preferences']
    };
    
    return {
      id: storage.id,
      name: storage.metadata.name || 'Recovered Workspace',
      created: storage.metadata.created || Date.now(),
      lastAccessed: storage.metadata.lastAccessed || Date.now(),
      rootFolder: storage.metadata.rootFolder || '/',
      relatedFolders: [],
      activityHistory: [],
      completionStatus: {},
      context: fallbackContext
    };
  }
  
  /**
   * Enhanced schema detection for workspace formats
   * Implements comprehensive legacy format detection as specified in architecture
   * @param metadata Workspace metadata
   * @returns 'legacy' | 'modern' | 'hybrid'
   */
  private detectWorkspaceVersion(metadata: Record<string, any>): 'legacy' | 'modern' | 'hybrid' {
    // Modern: Has context field with WorkspaceContext structure
    if (metadata.context && 
        typeof metadata.context === 'object' &&
        metadata.context.purpose && 
        Array.isArray(metadata.context.workflows)) {
      return 'modern';
    }
    
    // Hybrid: Has context but it's incomplete or malformed
    if (metadata.context) {
      return 'hybrid';
    }
    
    // Legacy: Has description/preferences but no context
    if (metadata.description || metadata.preferences || metadata.activityHistory) {
      return 'legacy';
    }
    
    // Fallback to legacy for safety
    return 'legacy';
  }
  
  /**
   * Legacy format detection for backward compatibility
   * @param metadata Workspace metadata
   * @returns True if legacy format detected
   */
  private detectLegacyWorkspaceFormat(metadata: Record<string, any>): boolean {
    return this.detectWorkspaceVersion(metadata) === 'legacy';
  }
  
  /**
   * Validate legacy workspace data before migration
   * @param metadata Legacy workspace metadata
   * @returns Validation result with errors and warnings
   */
  private validateLegacyData(metadata: Record<string, any>): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!metadata.name) {
      errors.push('Workspace must have a name');
    }
    
    if (!metadata.rootFolder) {
      warnings.push('Workspace missing root folder');
    }
    
    if (metadata.preferences && typeof metadata.preferences === 'string') {
      try {
        JSON.parse(metadata.preferences);
      } catch {
        warnings.push('Legacy preferences format may be corrupted');
      }
    }
    
    if (metadata.activityHistory && typeof metadata.activityHistory === 'string') {
      try {
        const parsed = JSON.parse(metadata.activityHistory);
        if (!Array.isArray(parsed)) {
          warnings.push('Activity history should be an array');
        }
      } catch {
        warnings.push('Activity history format may be corrupted');
      }
    }
    
    return { valid: errors.length === 0, errors, warnings };
  }
  
  /**
   * Enhanced legacy workspace migration engine
   * Implements comprehensive schema transformation as specified in architecture
   * @param storage Storage object with legacy metadata
   * @returns ProjectWorkspace with new schema format
   */
  private convertLegacyWorkspace(storage: {
    id: string;
    embedding?: number[];
    metadata: Record<string, any>;
    document?: string;
  }): ProjectWorkspace {
    
    // STEP 1: Validate legacy data before conversion
    const validation = this.validateLegacyData(storage.metadata);
    if (!validation.valid) {
    }
    if (validation.warnings.length > 0) {
    }
    
    // STEP 2: Build comprehensive WorkspaceContext from legacy data
    const context: WorkspaceContext = this.buildWorkspaceContextFromLegacy(storage.metadata);
    
    // STEP 3: Create modern workspace structure
    const workspace: ProjectWorkspace = {
      id: storage.id,
      name: storage.metadata.name || 'Legacy Workspace',
      description: storage.metadata.description || undefined,
      created: storage.metadata.created || Date.now(),
      lastAccessed: storage.metadata.lastAccessed || Date.now(),
      rootFolder: storage.metadata.rootFolder || '/',
      relatedFolders: this.parseJsonField(storage.metadata.relatedFolders, []),
      relatedFiles: this.parseJsonField(storage.metadata.relatedFiles, undefined),
      associatedNotes: this.parseStringArray(storage.metadata.associatedNotes),
      activityHistory: this.parseJsonField(storage.metadata.activityHistory, []),
      preferences: this.parseJsonField(storage.metadata.preferences, undefined),
      projectPlan: storage.metadata.projectPlan || undefined,
      checkpoints: this.parseJsonField(storage.metadata.checkpoints, undefined),
      completionStatus: this.parseJsonField(storage.metadata.completionStatus, {}),
      
      // STEP 4: Add the rich context created from legacy data
      context
    };
    
    // STEP 5: Mark as migrated for tracking
    (workspace as any).__migrated = true;
    (workspace as any).__migrationTimestamp = Date.now();
    (workspace as any).__migrationVersion = '1.0';
    (workspace as any).__originalFormat = 'legacy';
    
    
    return workspace;
  }
  
  /**
   * Build rich WorkspaceContext from legacy workspace data
   * Implements intelligent data transformation as specified in architecture
   * @param metadata Legacy workspace metadata
   * @returns Complete WorkspaceContext
   */
  private buildWorkspaceContextFromLegacy(metadata: Record<string, any>): WorkspaceContext {
    return {
      purpose: this.extractPurpose(metadata),
      currentGoal: this.generateCurrentGoal(metadata),
      status: this.extractStatus(metadata),
      workflows: this.generateWorkflows(metadata),
      keyFiles: this.convertKeyFiles(metadata),
      preferences: this.convertPreferences(metadata),
      agents: [], // Empty for legacy workspaces
      nextActions: this.generateNextActions(metadata)
    };
  }
  
  /**
   * Extract purpose from legacy data with intelligent fallbacks
   */
  private extractPurpose(metadata: Record<string, any>): string {
    if (metadata.description && typeof metadata.description === 'string') {
      return metadata.description;
    }
    
    if (metadata.projectPlan && typeof metadata.projectPlan === 'string') {
      const firstLine = metadata.projectPlan.split('\n')[0];
      return firstLine || `Workspace: ${metadata.name || 'Legacy'}`;
    }
    
    return `Legacy workspace: ${metadata.name || 'Unnamed'}`;
  }
  
  /**
   * Generate current goal from legacy activity and checkpoints
   */
  private generateCurrentGoal(metadata: Record<string, any>): string {
    // Look for incomplete checkpoints
    const checkpoints = this.parseJsonField<any[]>(metadata.checkpoints, []);
    if (Array.isArray(checkpoints) && checkpoints.length > 0) {
      const incomplete = checkpoints.filter((c: any) => !c.completed);
      if (incomplete.length > 0) {
        return incomplete[0]?.description || 'Complete pending checkpoint';
      }
    }
    
    // Look for recent activity
    const activityHistory = this.parseJsonField<any[]>(metadata.activityHistory, []);
    if (Array.isArray(activityHistory) && activityHistory.length > 0) {
      const recent = activityHistory[activityHistory.length - 1];
      if (recent && recent.toolName) {
        return `Continue working with ${recent.toolName}`;
      }
    }
    
    return 'Define current goals and next steps';
  }
  
  /**
   * Extract status with intelligent inference from completion data
   */
  private extractStatus(metadata: Record<string, any>): string {
    if (metadata.status && typeof metadata.status === 'string') {
      return metadata.status;
    }
    
    // Infer status from completion data
    const completionStatus = this.parseJsonField(metadata.completionStatus, {});
    if (completionStatus && typeof completionStatus === 'object') {
      const statuses = Object.values(completionStatus) as any[];
      const completed = statuses.filter(s => s.status === 'completed').length;
      const total = statuses.length;
      
      if (total > 0) {
        return `${completed}/${total} tasks completed`;
      }
    }
    
    // Infer from checkpoints
    const checkpoints = this.parseJsonField<any[]>(metadata.checkpoints, []);
    if (Array.isArray(checkpoints) && checkpoints.length > 0) {
      const completed = checkpoints.filter((c: any) => c.completed).length;
      const total = checkpoints.length;
      return `${completed}/${total} checkpoints completed`;
    }
    
    return 'Active';
  }
  
  /**
   * Generate workflows from activity patterns
   */
  private generateWorkflows(metadata: Record<string, any>): Array<{name: string; when: string; steps: string[]}> {
    const workflows: Array<{name: string; when: string; steps: string[]}> = [];
    
    // Generate workflow from activity patterns
    const activityHistory = this.parseJsonField<any[]>(metadata.activityHistory, []);
    if (Array.isArray(activityHistory) && activityHistory.length > 0) {
      const toolUsage = new Map<string, number>();
      activityHistory.forEach((activity: any) => {
        if (activity.toolName) {
          toolUsage.set(activity.toolName, (toolUsage.get(activity.toolName) || 0) + 1);
        }
      });
      
      // Create workflows for frequently used tools
      for (const [tool, count] of toolUsage) {
        if (count >= 2) { // Used more than once
          workflows.push({
            name: `${tool} Workflow`,
            when: `When using ${tool}`,
            steps: [
              `Open ${tool}`,
              'Review current context',
              'Execute task',
              'Update workspace status'
            ]
          });
        }
      }
    }
    
    // Default workflow if none generated
    if (workflows.length === 0) {
      workflows.push({
        name: 'General Workflow',
        when: 'When working in this workspace',
        steps: [
          'Review current goals',
          'Check relevant files',
          'Execute planned tasks',
          'Update progress'
        ]
      });
    }
    
    return workflows;
  }
  
  /**
   * Convert legacy key files to new structured format
   */
  private convertKeyFiles(metadata: Record<string, any>): Array<{category: string; files: Record<string, string>}> {
    const keyFiles: Array<{category: string; files: Record<string, string>}> = [];
    const files: Record<string, string> = {};
    
    // Collect files from various legacy sources
    const relatedFiles = this.parseJsonField(metadata.relatedFiles, []);
    if (Array.isArray(relatedFiles) && relatedFiles.length > 0) {
      relatedFiles.forEach((file: string, index: number) => {
        files[`related-${index}`] = file;
      });
    }
    
    const associatedNotes = this.parseStringArray(metadata.associatedNotes);
    if (associatedNotes.length > 0) {
      associatedNotes.forEach((note: string, index: number) => {
        files[`note-${index}`] = note;
      });
    }
    
    const relatedFolders = this.parseJsonField(metadata.relatedFolders, []);
    if (Array.isArray(relatedFolders) && relatedFolders.length > 0) {
      relatedFolders.forEach((folder: string, index: number) => {
        files[`folder-${index}`] = folder;
      });
    }
    
    // Organize into categories
    if (Object.keys(files).length > 0) {
      keyFiles.push({
        category: 'Legacy Files',
        files
      });
    }
    
    // Add instructions if available
    if (metadata.keyFileInstructions && typeof metadata.keyFileInstructions === 'string') {
      keyFiles.push({
        category: 'Instructions',
        files: {
          'instructions': metadata.keyFileInstructions
        }
      });
    }
    
    return keyFiles;
  }
  
  /**
   * Convert legacy preferences to string array format
   */
  private convertPreferences(metadata: Record<string, any>): string[] {
    const legacyPrefs = this.parseJsonField<any>(metadata.preferences, undefined);
    if (!legacyPrefs) return [];
    
    const preferences: string[] = [];
    
    if (typeof legacyPrefs === 'object' && !Array.isArray(legacyPrefs)) {
      // Convert object preferences to string array
      for (const [key, value] of Object.entries(legacyPrefs)) {
        if (typeof value === 'string') {
          preferences.push(`${key}: ${value}`);
        } else if (typeof value === 'boolean' && value) {
          preferences.push(key);
        } else if (typeof value === 'number') {
          preferences.push(`${key}: ${value}`);
        }
      }
    } else if (Array.isArray(legacyPrefs)) {
      // Already an array, convert to strings
      preferences.push(...legacyPrefs.map((p: any) => p.toString()));
    }
    
    return preferences;
  }
  
  /**
   * Generate next actions from checkpoints and project plan
   */
  private generateNextActions(metadata: Record<string, any>): string[] {
    const actions: string[] = [];
    
    // From incomplete checkpoints
    const checkpoints = this.parseJsonField<any[]>(metadata.checkpoints, []);
    if (Array.isArray(checkpoints) && checkpoints.length > 0) {
      checkpoints
        .filter((c: any) => !c.completed)
        .slice(0, 3) // Limit to 3 most relevant
        .forEach((checkpoint: any) => {
          if (checkpoint.description) {
            actions.push(checkpoint.description);
          }
        });
    }
    
    // From project plan
    if (metadata.projectPlan && typeof metadata.projectPlan === 'string' && actions.length < 3) {
      const planLines = metadata.projectPlan.split('\n')
        .filter(line => line.trim())
        .slice(1, 4); // Skip first line (already used as purpose)
      
      actions.push(...planLines);
    }
    
    // Default actions if none found
    if (actions.length === 0) {
      actions.push(
        'Review workspace structure',
        'Update goals and priorities',
        'Organize files and resources'
      );
    }
    
    return actions.slice(0, 5); // Limit to 5 actions
  }
  
  /**
   * Handle hybrid workspace format completion
   * @param storage Storage object with incomplete context
   * @returns ProjectWorkspace with completed context
   */
  private completeHybridWorkspace(storage: {
    id: string;
    embedding?: number[];
    metadata: Record<string, any>;
    document?: string;
  }): ProjectWorkspace {
    
    // Fix incomplete or corrupted context
    const legacyMetadata = { ...storage.metadata };
    delete legacyMetadata.context; // Remove incomplete context
    
    const migrated = this.convertLegacyWorkspace({
      ...storage,
      metadata: legacyMetadata
    });
    
    // Preserve any valid parts of existing context
    if (storage.metadata.context && typeof storage.metadata.context === 'object') {
      const existingContext = this.parseJsonField<Partial<WorkspaceContext>>(storage.metadata.context, {});
      
      // Merge contexts, ensuring all required fields are present
      if (migrated.context) {
        migrated.context = { 
          ...migrated.context,
          ...existingContext,
          // Ensure required fields are not overwritten with undefined
          purpose: existingContext.purpose || migrated.context.purpose,
          currentGoal: existingContext.currentGoal || migrated.context.currentGoal,
          status: existingContext.status || migrated.context.status
        };
      }
    }
    
    return migrated;
  }
  
  /**
   * Parse string array field with enhanced error handling
   * @param value Field value (string, comma-separated, or undefined)
   * @param separator Separator character (default: comma)
   * @returns Array of strings or empty array
   */
  private parseStringArray(value: any, separator = ','): string[] {
    if (!value || value === "") {
      return [];
    }
    
    if (Array.isArray(value)) {
      return value.filter(item => typeof item === 'string' && item.trim());
    }
    
    if (typeof value === 'string') {
      return value.split(separator).filter(item => item.trim());
    }
    
    return [];
  }
  
  /**
   * Parse JSON field with enhanced error handling
   * @param value Field value
   * @param fallback Fallback value if parsing fails
   * @returns Parsed object or fallback
   */
  private parseJsonField<T>(value: any, fallback: T): T {
    if (!value || value === "") {
      return fallback;
    }
    
    if (typeof value === 'object') {
      return value as T;
    }
    
    if (typeof value === 'string') {
      return this.safeJsonParse(value, fallback);
    }
    
    return fallback;
  }
  
  /**
   * Safely parse JSON with fallback value (enhanced with better logging)
   * @param jsonString String to parse
   * @param fallback Fallback value if parsing fails
   * @returns Parsed object or fallback
   */
  private safeJsonParse<T>(jsonString: string, fallback: T): T {
    try {
      const parsed = JSON.parse(jsonString);
      return parsed;
    } catch (error) {
      return fallback;
    }
  }

  /**
   * Create a document string representation of a workspace
   * @param workspace Workspace object
   * @returns Document string
   */
  private workspaceToDocument(workspace: ProjectWorkspace): string {
    // Create a text representation for embedding
    let document = `Workspace: ${workspace.name}\n`;
    
    if (workspace.description) {
      document += `Description: ${workspace.description}\n`;
    }
    
    document += `Root Folder: ${workspace.rootFolder}\n`;
    
    if (workspace.projectPlan) {
      document += `Project Plan: ${workspace.projectPlan}\n`;
    }
    
    // Add checkpoint information
    if (workspace.checkpoints && workspace.checkpoints.length > 0) {
      document += 'Checkpoints:\n';
      workspace.checkpoints.forEach(checkpoint => {
        document += `- ${checkpoint.description} (${checkpoint.completed ? 'Completed' : 'Pending'})\n`;
      });
    }
    
    return document;
  }
  
  /**
   * Generate a simple embedding from text
   * @param text Text to embed
   * @returns Embedding vector
   */
  private generateSimpleEmbedding(text: string): number[] {
    // Get dimension from embedding service
    const dimension = this.embeddingService?.getDimensions?.() || (() => { 
      throw new Error('Cannot generate embedding: no embedding service configured or dimensions not available'); 
    })();
    const vector = new Array(dimension).fill(0);
    
    // Generate some variation based on the text content
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const position = i % dimension;
      vector[position] += charCode / 1000;
    }
    
    // Normalize to unit length
    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (norm === 0) {
      return vector;
    }
    
    return vector.map(val => val / norm);
  }
  
  /**
   * Create a new workspace
   * @param workspace Workspace data without ID
   * @returns Created workspace with generated ID
   */
  async createWorkspace(workspace: Omit<ProjectWorkspace, 'id'>): Promise<ProjectWorkspace> {
    const id = uuidv4();
    const newWorkspace: ProjectWorkspace = {
      ...workspace,
      id,
      created: workspace.created || Date.now(),
      lastAccessed: workspace.lastAccessed || Date.now()
    };
    
    await this.add(newWorkspace);
    return newWorkspace;
  }
  
  
  
  /**
   * Update last accessed timestamp
   * @param id Workspace ID
   */
  async updateLastAccessed(id: string): Promise<void> {
    const workspace = await this.get(id);
    
    if (workspace) {
      await this.update(id, {
        lastAccessed: Date.now()
      });
    }
  }
  
  /**
   * Enhanced diagnostic method for comprehensive workspace backward compatibility analysis
   * @returns Detailed diagnostic information including migration status and data integrity
   */
  async getDiagnosticInfo(): Promise<{
    totalItems: number;
    sampleItems: Array<{
      id: string;
      metadata: Record<string, any>;
      version: 'legacy' | 'modern' | 'hybrid';
      migrationRequired: boolean;
      hasContext: boolean;
      validationIssues?: string[];
    }>;
    formatAnalysis: {
      legacyCount: number;
      modernCount: number;
      hybridCount: number;
      invalidCount: number;
      migrationProgress: number; // percentage
    };
    migrationStatus: {
      totalMigrated: number;
      pendingMigration: number;
      migrationErrors: Array<{
        workspaceId: string;
        error: string;
      }>;
    };
    dataIntegrity: {
      corruptedWorkspaces: number;
      missingRequiredFields: number;
      jsonParsingErrors: number;
    };
  }> {
    try {
      const count = await this.count();
      
      if (count === 0) {
        return {
          totalItems: 0,
          sampleItems: [],
          formatAnalysis: { 
            legacyCount: 0, 
            modernCount: 0, 
            hybridCount: 0, 
            invalidCount: 0, 
            migrationProgress: 100 
          },
          migrationStatus: {
            totalMigrated: 0,
            pendingMigration: 0,
            migrationErrors: []
          },
          dataIntegrity: {
            corruptedWorkspaces: 0,
            missingRequiredFields: 0,
            jsonParsingErrors: 0
          }
        };
      }
      
      // Get raw data from vector store for comprehensive analysis
      const rawResults = await this.vectorStore.getItems(this.collectionName, [], ['metadatas']);
      
      let legacyCount = 0;
      let modernCount = 0;
      let hybridCount = 0;
      let invalidCount = 0;
      let totalMigrated = 0;
      let corruptedWorkspaces = 0;
      let missingRequiredFields = 0;
      let jsonParsingErrors = 0;
      
      const migrationErrors: Array<{workspaceId: string; error: string}> = [];
      
      const sampleItems = rawResults.ids.slice(0, 10).map((id, index) => {
        const metadata = rawResults.metadatas?.[index] || {};
        
        // Enhanced version detection
        const version = this.detectWorkspaceVersion(metadata);
        const hasContext = !!(metadata.context && metadata.context !== '');
        const migrationRequired = version === 'legacy' || version === 'hybrid';
        
        // Check if already migrated
        if (metadata.__migrated) {
          totalMigrated++;
        }
        
        // Validate data integrity
        const validationIssues: string[] = [];
        const validation = this.validateLegacyData(metadata);
        
        if (!validation.valid) {
          validationIssues.push(...validation.errors);
          if (!metadata.name) missingRequiredFields++;
          corruptedWorkspaces++;
        }
        
        if (validation.warnings.length > 0) {
          validationIssues.push(...validation.warnings.map(w => `Warning: ${w}`));
        }
        
        // Test JSON parsing for complex fields
        const jsonFields = ['preferences', 'activityHistory', 'checkpoints', 'completionStatus', 'context'];
        jsonFields.forEach(field => {
          if (metadata[field] && typeof metadata[field] === 'string') {
            try {
              JSON.parse(metadata[field]);
            } catch {
              jsonParsingErrors++;
              validationIssues.push(`JSON parsing error in field: ${field}`);
            }
          }
        });
        
        // Count by version
        switch (version) {
          case 'legacy': legacyCount++; break;
          case 'modern': modernCount++; break;
          case 'hybrid': hybridCount++; break;
          default: invalidCount++; break;
        }
        
        return {
          id,
          metadata: {
            // Only include essential metadata to avoid bloating the response
            name: metadata.name,
            created: metadata.created,
            hasContext: hasContext,
            __migrated: metadata.__migrated,
            __migrationTimestamp: metadata.__migrationTimestamp
          },
          version,
          migrationRequired,
          hasContext,
          validationIssues: validationIssues.length > 0 ? validationIssues : undefined
        };
      });
      
      // Count remaining items for comprehensive analysis
      for (let i = 10; i < rawResults.ids.length; i++) {
        const metadata = rawResults.metadatas?.[i] || {};
        const version = this.detectWorkspaceVersion(metadata);
        
        if (metadata.__migrated) {
          totalMigrated++;
        }
        
        const validation = this.validateLegacyData(metadata);
        if (!validation.valid) {
          if (!metadata.name) missingRequiredFields++;
          corruptedWorkspaces++;
        }
        
        // Test JSON parsing for remaining items
        const jsonFields = ['preferences', 'activityHistory', 'checkpoints', 'completionStatus', 'context'];
        jsonFields.forEach(field => {
          if (metadata[field] && typeof metadata[field] === 'string') {
            try {
              JSON.parse(metadata[field]);
            } catch {
              jsonParsingErrors++;
            }
          }
        });
        
        switch (version) {
          case 'legacy': legacyCount++; break;
          case 'modern': modernCount++; break;
          case 'hybrid': hybridCount++; break;
          default: invalidCount++; break;
        }
      }
      
      const pendingMigration = legacyCount + hybridCount;
      const migrationProgress = count > 0 ? Math.round((modernCount / count) * 100) : 100;
      
      const diagnosticResult = {
        totalItems: count,
        sampleItems,
        formatAnalysis: { 
          legacyCount, 
          modernCount, 
          hybridCount, 
          invalidCount, 
          migrationProgress 
        },
        migrationStatus: {
          totalMigrated,
          pendingMigration,
          migrationErrors
        },
        dataIntegrity: {
          corruptedWorkspaces,
          missingRequiredFields,
          jsonParsingErrors
        }
      };
      
      
      return diagnosticResult;
      
    } catch (error) {
      return {
        totalItems: 0,
        sampleItems: [],
        formatAnalysis: { 
          legacyCount: 0, 
          modernCount: 0, 
          hybridCount: 0, 
          invalidCount: 0, 
          migrationProgress: 0 
        },
        migrationStatus: {
          totalMigrated: 0,
          pendingMigration: 0,
          migrationErrors: [{ 
          workspaceId: 'DIAGNOSTIC_ERROR', 
          error: error instanceof Error ? error.message : String(error) 
        }]
        },
        dataIntegrity: {
          corruptedWorkspaces: 0,
          missingRequiredFields: 0,
          jsonParsingErrors: 0
        }
      };
    }
  }
  
  /**
   * Batch migration utility for upgrading all legacy workspaces
   * @returns Migration result summary
   */
  async performBatchMigration(): Promise<{
    totalProcessed: number;
    successfulMigrations: number;
    failedMigrations: number;
    alreadyModern: number;
    errors: Array<{workspaceId: string; error: string}>;
    duration: number;
  }> {
    const startTime = Date.now();
    
    const result = {
      totalProcessed: 0,
      successfulMigrations: 0,
      failedMigrations: 0,
      alreadyModern: 0,
      errors: [] as Array<{workspaceId: string; error: string}>,
      duration: 0
    };
    
    try {
      // Get all workspaces for migration
      const rawResults = await this.vectorStore.getItems(this.collectionName, [], ['metadatas']);
      result.totalProcessed = rawResults.ids.length;
      
      for (let i = 0; i < rawResults.ids.length; i++) {
        const id = rawResults.ids[i];
        const metadata = rawResults.metadatas?.[i] || {};
        
        try {
          const version = this.detectWorkspaceVersion(metadata);
          
          if (version === 'modern') {
            result.alreadyModern++;
            continue;
          }
          
          // Perform migration by converting and updating
          const migrated = this.storageToItem({ id, metadata });
          await this.update(id, migrated);
          
          result.successfulMigrations++;
          
        } catch (error) {
          result.failedMigrations++;
          result.errors.push({
            workspaceId: id,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
    } catch (error) {
      result.errors.push({
        workspaceId: 'BATCH_OPERATION',
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    result.duration = Date.now() - startTime;
    
    
    return result;
  }
}