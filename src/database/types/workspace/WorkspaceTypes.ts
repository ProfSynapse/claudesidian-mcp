/**
 * Core Workspace Types
 * Simple, clean workspace types focused on LLM usability
 */


/**
 * Status types for individual items within a workspace
 */
export type ItemStatus = 'not_started' | 'in_progress' | 'completed';

/**
 * Simple workspace context for LLM understanding
 */
export interface WorkspaceContext {
  /**
   * What is this workspace for?
   * Example: "Apply for marketing manager positions"
   */
  purpose: string;
  
  /**
   * What are you trying to accomplish right now?
   * Example: "Submit 10 applications this week"
   */
  currentGoal: string;
  
  /**
   * What's the current state of progress?
   * Example: "5 sent, 2 pending responses (Google, Meta), need 5 more"
   */
  status: string;
  
  /**
   * Workflows for different situations
   */
  workflows: Array<{
    name: string;           // "New Application", "Follow-up", "Interview Prep"
    when: string;           // "When applying to new position"
    steps: string[];        // ["Research company", "Customize cover letter", "Apply", "Track"]
  }>;
  
  /**
   * Key files organized by category
   */
  keyFiles: Array<{
    category: string;       // "Templates", "Tracking", "Portfolio"
    files: Record<string, string>; // {"resume": "path/to/file"}
  }>;
  
  /**
   * User preferences as actionable guidelines
   */
  preferences: string[];    // ["Use professional tone", "Focus on tech companies"]
  
  /**
   * Agents to associate with this workspace
   */
  agents: Array<{
    name: string;           // "CoverLetterAgent"
    when: string;           // "When customizing cover letters"
    purpose: string;        // "Adapts cover letters to specific job requirements"
  }>;
  
}

/**
 * Simple workspace interface - our agreed-upon clean schema
 */
export interface Workspace {
  id: string;
  name: string;
  context?: WorkspaceContext;  // Optional for backward compatibility
  rootFolder: string;
  created: number;
  lastAccessed: number;
}

/**
 * Legacy ProjectWorkspace interface for backward compatibility
 * Extends the simple Workspace with optional legacy fields
 */
export interface ProjectWorkspace extends Workspace {
  // Core functionality
  isActive?: boolean;

  // Legacy fields for backward compatibility
  description?: string;
  relatedFolders?: string[];
  relatedFiles?: string[];
  associatedNotes?: string[];
  keyFileInstructions?: string;
  activityHistory?: Array<{
    timestamp: number;
    action: 'view' | 'edit' | 'create' | 'tool';
    toolName?: string;
    duration?: number;
    context?: string;
  }>;
  preferences?: Record<string, any>;
  projectPlan?: string;
  checkpoints?: Array<{
    id: string;
    date: number;
    description: string;
    completed: boolean;
  }>;
  completionStatus?: Record<string, {
    status: ItemStatus;
    completedDate?: number;
    completionNotes?: string;
  }>;
}