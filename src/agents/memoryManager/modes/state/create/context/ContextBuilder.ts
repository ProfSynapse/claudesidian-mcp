/**
 * ContextBuilder - Gathers and builds context for state creation
 * Follows Single Responsibility Principle by focusing only on context gathering
 */

import { MemoryService } from '../../../../../../database/services/MemoryService';
import { WorkspaceService } from '../../../../../../database/services/WorkspaceService';
import { WorkspaceMemoryTrace } from '../../../../../../database/workspace-types';

export interface ContextData {
  traces: WorkspaceMemoryTrace[];
  files: any[];
  enhancedDescription: string;
  enhancedMetadata: {
    tags: string[];
    reason?: string;
    activityTypes: string[];
    toolsUsed: string[];
  };
  // Enhanced context data for improved restoration
  conversationContext?: {
    summary: string;
    mainTopics: string[];
    decisions: DecisionRecord[];
    openQuestions: string[];
    conversationFlow: ConversationEntry[];
    toolUsageContext: ToolUsageRecord[];
  };
  activeTask?: {
    currentGoal: string;
    taskType: 'research' | 'development' | 'writing' | 'analysis' | 'planning' | 'review';
    progress: TaskProgress;
    nextSteps: ActionableStep[];
    requiredResources: ResourceRequirement[];
    estimatedTimeToComplete: number;
  };
  filesInProgress?: {
    beingEdited: FileEditContext[];
    recentlyViewed: FileViewContext[];
    scheduled: FileScheduledAction[];
    contentSnapshot: Record<string, string>;
  };
}

// Supporting interfaces for enhanced context
export interface DecisionRecord {
  id: string;
  description: string;
  madeAt: number;
  reasoning: string;
  impactLevel: 'minor' | 'moderate' | 'major';
  relatedFiles: string[];
  implementationStatus: 'pending' | 'in_progress' | 'completed' | 'revised';
  followUpRequired: boolean;
}

export interface ConversationEntry {
  timestamp: number;
  type: 'user_message' | 'assistant_response' | 'tool_call' | 'system_event';
  content: string;
  context?: {
    filesReferenced: string[];
    toolsUsed: string[];
    decisions: string[];
    relatedEntries: string[];
  };
  sentimentIndicators?: {
    confidence: number;
    satisfaction: number;
    frustration: number;
  };
}

export interface ToolUsageRecord {
  toolName: string;
  usedAt: number;
  purpose: string;
  parameters: Record<string, any>;
  result: 'success' | 'failure' | 'partial';
  impact: string;
  followUpNeeded: boolean;
  relatedFiles: string[];
}

export interface TaskProgress {
  overallCompletion: number;
  milestonesCompleted: string[];
  milestonesRemaining: string[];
  blockers: string[];
  momentum: 'accelerating' | 'steady' | 'slowing' | 'stalled';
  confidenceLevel: number;
}

export interface ActionableStep {
  id: string;
  description: string;
  type: 'file_action' | 'research' | 'decision' | 'tool_use' | 'external_task';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  estimatedDuration: number;
  requiredResources: string[];
  suggestedApproach: string;
  dependencies: string[];
  successCriteria: string[];
}

export interface ResourceRequirement {
  type: 'file' | 'tool' | 'knowledge' | 'decision' | 'external_service';
  description: string;
  availability: 'available' | 'partially_available' | 'unavailable' | 'unknown';
  criticality: 'nice_to_have' | 'helpful' | 'required' | 'critical';
  alternatives?: string[];
}

export interface FileEditContext {
  path: string;
  editType: 'creating' | 'modifying' | 'reviewing' | 'refactoring';
  lastModified: number;
  editGoal: string;
  progressPercent: number;
  keyChanges: string[];
  nextActions: string[];
}

export interface FileViewContext {
  path: string;
  viewedAt: number;
  purpose: 'reference' | 'analysis' | 'planning' | 'learning' | 'context';
  keyInsights: string[];
  relevanceScore: number;
  followUpNeeded: boolean;
}

export interface FileScheduledAction {
  path: string;
  action: 'create' | 'modify' | 'review' | 'delete' | 'move' | 'archive';
  scheduledFor: 'next_session' | 'after_dependency' | 'when_ready' | 'milestone_completion';
  description: string;
  dependencies: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
}

export interface ContextOptions {
  maxFiles: number;
  maxTraces: number;
  includeFileContents: boolean;
  tags: string[];
  reason?: string;
}

/**
 * Service responsible for gathering context data for state creation
 * Follows SRP by focusing only on context collection and enhancement
 */
export class ContextBuilder {
  constructor(
    private memoryService: MemoryService,
    private workspaceService: WorkspaceService
  ) {}

  /**
   * Build comprehensive context for state creation
   */
  async buildContext(
    workspaceId: string,
    sessionId: string,
    workspace: any,
    description: string,
    options: ContextOptions
  ): Promise<ContextData> {
    // Gather memory traces
    const traces = await this.gatherMemoryTraces(workspaceId, sessionId, options.maxTraces);
    
    // Gather relevant files
    const files = await this.gatherRelevantFiles(workspaceId, options.maxFiles, options.includeFileContents);
    
    // Enhance description with context
    const enhancedDescription = this.enhanceDescription(description, workspace, traces, files, options.reason);
    
    // Build enhanced metadata
    const enhancedMetadata = this.buildEnhancedMetadata(traces, files, workspace, options);

    // Build enhanced context for better restoration
    const conversationContext = await this.buildConversationContext(traces, description, options.reason);
    const activeTask = await this.inferActiveTask(traces, description, options.reason);
    const filesInProgress = await this.analyzeFilesInProgress(files, traces);

    return {
      traces,
      files,
      enhancedDescription,
      enhancedMetadata,
      conversationContext,
      activeTask,
      filesInProgress
    };
  }

  /**
   * Gather recent memory traces for the session/workspace
   */
  private async gatherMemoryTraces(
    workspaceId: string,
    sessionId: string,
    maxTraces: number
  ): Promise<WorkspaceMemoryTrace[]> {
    try {
      // Get traces from the workspace (MemoryService only supports workspaceId and limit)
      const traces = await this.memoryService.getMemoryTraces(workspaceId, maxTraces);

      console.log(`Gathered ${traces.length} memory traces for context`);
      return traces;
    } catch (error) {
      console.error('Error gathering memory traces:', error);
      return [];
    }
  }

  /**
   * Gather relevant files for the workspace
   */
  private async gatherRelevantFiles(
    workspaceId: string,
    maxFiles: number,
    includeContents: boolean
  ): Promise<any[]> {
    try {
      // Get associated notes for the workspace
      const filePaths = await this.workspaceService.getAssociatedNotes(workspaceId);
      
      // Limit to maxFiles
      const limitedPaths = filePaths.slice(0, maxFiles);
      
      // Convert to file objects
      const files = limitedPaths.map(path => ({
        path,
        name: path.split('/').pop() || path,
        extension: path.split('.').pop() || '',
        lastModified: Date.now(), // Would need actual file stat
        content: includeContents ? '' : undefined // Would need actual file content
      }));

      console.log(`Gathered ${files.length} relevant files for context`);
      return files;
    } catch (error) {
      console.error('Error gathering relevant files:', error);
      return [];
    }
  }

  /**
   * Enhance description with contextual information
   */
  private enhanceDescription(
    originalDescription: string,
    workspace: any,
    traces: WorkspaceMemoryTrace[],
    files: any[],
    reason?: string
  ): string {
    let enhanced = originalDescription || '';

    // Add workspace context
    if (workspace) {
      enhanced += `\n\nWorkspace: ${workspace.name} (${workspace.hierarchyType})`;
      if (workspace.description) {
        enhanced += `\nWorkspace Description: ${workspace.description}`;
      }
    }

    // Add reason if provided
    if (reason) {
      enhanced += `\n\nReason for state creation: ${reason}`;
    }

    // Add activity context
    if (traces.length > 0) {
      const activityTypes = [...new Set(traces.map(t => t.activityType))];
      enhanced += `\n\nRecent activities: ${activityTypes.join(', ')} (${traces.length} total)`;
    }

    // Add file context
    if (files.length > 0) {
      enhanced += `\n\nKey files: ${files.length} files included`;
      const fileTypes = [...new Set(files.map(f => f.extension || 'unknown').filter(Boolean))];
      if (fileTypes.length > 0) {
        enhanced += ` (${fileTypes.join(', ')})`;
      }
    }

    return enhanced;
  }

  /**
   * Build enhanced metadata from context
   */
  private buildEnhancedMetadata(
    traces: WorkspaceMemoryTrace[],
    files: any[],
    workspace: any,
    options: ContextOptions
  ): {
    tags: string[];
    reason?: string;
    activityTypes: string[];
    toolsUsed: string[];
  } {
    const tags = [...(options.tags || [])];
    
    // Extract activity types from traces
    const activityTypes = [...new Set(traces.map(trace => trace.activityType))];
    
    // Extract tools used from traces
    const toolsUsed = [...new Set(traces
      .map(trace => trace.metadata?.tool)
      .filter(Boolean) as string[]
    )];

    // Add automatic tags based on content
    if (files.length > 0) {
      tags.push(`files:${files.length}`);
      
      // Add file type tags
      const fileTypes = [...new Set(files.map(f => f.extension).filter(Boolean))];
      fileTypes.forEach(type => tags.push(`type:${type}`));
    }

    if (traces.length > 0) {
      tags.push(`traces:${traces.length}`);
      
      // Add activity type tags
      activityTypes.forEach(activity => tags.push(`activity:${activity}`));
    }

    // Add workspace-related tags
    if (workspace) {
      tags.push(`workspace:${workspace.hierarchyType}`);
      
      // Add folder tag if available
      if (workspace.rootFolder && workspace.rootFolder !== '/') {
        try {
          const folderName = workspace.rootFolder.split('/').pop();
          if (folderName) {
            tags.push(`folder:${folderName}`);
          }
        } catch (error) {
          console.warn(`Error adding folder tag: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    return {
      tags: [...new Set(tags)], // Remove duplicates
      reason: options.reason,
      activityTypes,
      toolsUsed
    };
  }

  /**
   * Build conversation context from memory traces
   */
  private async buildConversationContext(
    traces: WorkspaceMemoryTrace[],
    description: string,
    reason?: string
  ): Promise<{
    summary: string;
    mainTopics: string[];
    decisions: DecisionRecord[];
    openQuestions: string[];
    conversationFlow: ConversationEntry[];
    toolUsageContext: ToolUsageRecord[];
  }> {
    // Build conversation summary
    const summary = this.generateConversationSummary(traces, description, reason);
    
    // Extract main topics from traces
    const mainTopics = this.extractMainTopics(traces, description);
    
    // Identify decisions from traces
    const decisions = this.extractDecisions(traces);
    
    // Identify open questions
    const openQuestions = this.extractOpenQuestions(traces, description);
    
    // Build conversation flow
    const conversationFlow = this.buildConversationFlow(traces);
    
    // Build tool usage context
    const toolUsageContext = this.buildToolUsageContext(traces);

    return {
      summary,
      mainTopics,
      decisions,
      openQuestions,
      conversationFlow,
      toolUsageContext
    };
  }

  /**
   * Infer the active task from context
   */
  private async inferActiveTask(
    traces: WorkspaceMemoryTrace[],
    description: string,
    reason?: string
  ): Promise<{
    currentGoal: string;
    taskType: 'research' | 'development' | 'writing' | 'analysis' | 'planning' | 'review';
    progress: TaskProgress;
    nextSteps: ActionableStep[];
    requiredResources: ResourceRequirement[];
    estimatedTimeToComplete: number;
  }> {
    // Infer current goal from description, reason, and traces
    const currentGoal = this.inferCurrentGoal(description, reason, traces);
    
    // Determine task type from activities
    const taskType = this.inferTaskType(traces, description);
    
    // Assess progress from traces
    const progress = this.assessTaskProgress(traces);
    
    // Generate next steps based on context
    const nextSteps = this.generateNextSteps(traces, currentGoal, taskType);
    
    // Identify required resources
    const requiredResources = this.identifyResourceRequirements(traces, taskType);
    
    // Estimate time to completion
    const estimatedTimeToComplete = this.estimateTimeToComplete(progress, nextSteps);

    return {
      currentGoal,
      taskType,
      progress,
      nextSteps,
      requiredResources,
      estimatedTimeToComplete
    };
  }

  /**
   * Analyze files in progress
   */
  private async analyzeFilesInProgress(
    files: any[],
    traces: WorkspaceMemoryTrace[]
  ): Promise<{
    beingEdited: FileEditContext[];
    recentlyViewed: FileViewContext[];
    scheduled: FileScheduledAction[];
    contentSnapshot: Record<string, string>;
  }> {
    // Identify files being edited from traces
    const beingEdited = this.identifyFilesBeingEdited(files, traces);
    
    // Identify recently viewed files
    const recentlyViewed = this.identifyRecentlyViewedFiles(files, traces);
    
    // Identify scheduled file actions
    const scheduled = this.identifyScheduledActions(traces);
    
    // Create content snapshots for key files
    const contentSnapshot = this.createContentSnapshots(files);

    return {
      beingEdited,
      recentlyViewed,
      scheduled,
      contentSnapshot
    };
  }

  // Helper methods for enhanced context building

  private generateConversationSummary(traces: WorkspaceMemoryTrace[], description: string, reason?: string): string {
    if (traces.length === 0) {
      return description || reason || 'No conversation context available';
    }

    const recentTraces = traces
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    let summary = `Conversation involved ${traces.length} activities. `;
    
    if (reason) {
      summary += `Primary focus: ${reason}. `;
    }

    const activities = [...new Set(recentTraces.map(t => t.activityType))];
    summary += `Recent activities included: ${activities.join(', ')}.`;

    return summary;
  }

  private extractMainTopics(traces: WorkspaceMemoryTrace[], description: string): string[] {
    const topics = new Set<string>();
    
    // Add topics from description
    if (description) {
      const words = description.toLowerCase().split(/\s+/).filter(word => word.length > 4);
      words.forEach(word => topics.add(word));
    }

    // Add activity types as topics
    traces.forEach(trace => {
      topics.add(trace.activityType.replace('_', ' '));
      
      // Extract keywords from content (simple approach)
      if (trace.content) {
        const contentWords = trace.content.toLowerCase().split(/\s+/)
          .filter(word => word.length > 5 && !['the', 'and', 'that', 'this', 'with', 'from'].includes(word))
          .slice(0, 3);
        contentWords.forEach(word => topics.add(word));
      }
    });

    return Array.from(topics).slice(0, 10); // Limit to top 10 topics
  }

  private extractDecisions(traces: WorkspaceMemoryTrace[]): DecisionRecord[] {
    const decisions: DecisionRecord[] = [];
    
    traces.forEach((trace, index) => {
      // Look for traces that might contain decisions
      if (trace.content && (
        trace.content.toLowerCase().includes('decided') ||
        trace.content.toLowerCase().includes('choose') ||
        trace.content.toLowerCase().includes('will use') ||
        trace.content.toLowerCase().includes('approach')
      )) {
        decisions.push({
          id: `decision-${index}`,
          description: trace.content.substring(0, 100) + '...',
          madeAt: trace.timestamp,
          reasoning: 'Inferred from conversation context',
          impactLevel: 'moderate',
          relatedFiles: [],
          implementationStatus: 'pending',
          followUpRequired: true
        });
      }
    });

    return decisions.slice(0, 5); // Limit to 5 most recent decisions
  }

  private extractOpenQuestions(traces: WorkspaceMemoryTrace[], description: string): string[] {
    const questions = new Set<string>();
    
    // Look for question patterns in traces
    traces.forEach(trace => {
      if (trace.content) {
        const questionPatterns = trace.content.match(/[^.!?]*\?[^.!?]*/g);
        if (questionPatterns) {
          questionPatterns.forEach(q => questions.add(q.trim()));
        }
      }
    });

    return Array.from(questions).slice(0, 5);
  }

  private buildConversationFlow(traces: WorkspaceMemoryTrace[]): ConversationEntry[] {
    return traces
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-10) // Last 10 entries
      .map(trace => ({
        timestamp: trace.timestamp,
        type: this.inferEntryType(trace),
        content: trace.content || `${trace.activityType} activity`,
        context: {
          filesReferenced: [],
          toolsUsed: trace.metadata?.tool ? [trace.metadata.tool] : [],
          decisions: [],
          relatedEntries: []
        },
        sentimentIndicators: {
          confidence: trace.importance / 10, // Normalize importance to 0-1
          satisfaction: 0.7, // Default neutral-positive
          frustration: 0.2   // Default low frustration
        }
      }));
  }

  private inferEntryType(trace: WorkspaceMemoryTrace): 'user_message' | 'assistant_response' | 'tool_call' | 'system_event' {
    if (trace.metadata?.tool) {
      return 'tool_call';
    }
    
    switch (trace.activityType) {
      case 'question':
        return 'user_message';
      case 'project_plan':
      case 'research':
        return 'assistant_response';
      default:
        return 'system_event';
    }
  }

  private buildToolUsageContext(traces: WorkspaceMemoryTrace[]): ToolUsageRecord[] {
    return traces
      .filter(trace => trace.metadata?.tool)
      .map(trace => ({
        toolName: trace.metadata!.tool,
        usedAt: trace.timestamp,
        purpose: this.inferToolPurpose(trace),
        parameters: trace.metadata || {},
        result: 'success', // Assume success if no error indicated
        impact: trace.content ? `Generated: ${trace.content.substring(0, 50)}...` : 'Tool execution completed',
        followUpNeeded: trace.activityType === 'question',
        relatedFiles: []
      }));
  }

  private inferToolPurpose(trace: WorkspaceMemoryTrace): string {
    const tool = trace.metadata?.tool || 'unknown';
    
    switch (trace.activityType) {
      case 'research':
        return `Research using ${tool}`;
      case 'project_plan':
        return `Planning using ${tool}`;
      case 'question':
        return `Information gathering using ${tool}`;
      default:
        return `Task execution using ${tool}`;
    }
  }

  private inferCurrentGoal(description: string, reason?: string, traces?: WorkspaceMemoryTrace[]): string {
    if (reason) return reason;
    if (description) return description;
    
    if (traces && traces.length > 0) {
      const recentTrace = traces.sort((a, b) => b.timestamp - a.timestamp)[0];
      return `Continue ${recentTrace.activityType.replace('_', ' ')} work`;
    }
    
    return 'Continue current work session';
  }

  private inferTaskType(traces: WorkspaceMemoryTrace[], description: string): 'research' | 'development' | 'writing' | 'analysis' | 'planning' | 'review' {
    const activityTypes = traces.map(t => t.activityType);
    
    if (activityTypes.includes('research')) return 'research';
    if (activityTypes.includes('project_plan')) return 'planning';
    if (description?.toLowerCase().includes('analy')) return 'analysis';
    if (description?.toLowerCase().includes('write') || description?.toLowerCase().includes('document')) return 'writing';
    if (description?.toLowerCase().includes('review')) return 'review';
    
    return 'development'; // Default
  }

  private assessTaskProgress(traces: WorkspaceMemoryTrace[]): TaskProgress {
    const totalActivities = traces.length;
    const completionActivity = traces.find(t => t.activityType === 'completion');
    
    return {
      overallCompletion: completionActivity ? 0.8 : Math.min(totalActivities * 0.1, 0.7),
      milestonesCompleted: completionActivity ? ['initial-setup'] : [],
      milestonesRemaining: ['next-phase', 'completion'],
      blockers: [],
      momentum: totalActivities > 5 ? 'steady' : 'accelerating',
      confidenceLevel: 0.7
    };
  }

  private generateNextSteps(traces: WorkspaceMemoryTrace[], currentGoal: string, taskType: string): ActionableStep[] {
    const steps: ActionableStep[] = [];
    
    // Generate context-appropriate next steps
    switch (taskType) {
      case 'research':
        steps.push({
          id: 'research-continue',
          description: 'Continue research on identified topics',
          type: 'research',
          priority: 'medium',
          estimatedDuration: 30,
          requiredResources: ['research sources'],
          suggestedApproach: 'Review previous findings and expand on key areas',
          dependencies: [],
          successCriteria: ['Key questions answered', 'Sources documented']
        });
        break;
      
      case 'development':
        steps.push({
          id: 'dev-continue',
          description: 'Continue development work',
          type: 'file_action',
          priority: 'high',
          estimatedDuration: 45,
          requiredResources: ['code files', 'development tools'],
          suggestedApproach: 'Review previous changes and continue implementation',
          dependencies: [],
          successCriteria: ['Code changes implemented', 'Tests passing']
        });
        break;
      
      default:
        steps.push({
          id: 'general-continue',
          description: `Continue ${taskType} work`,
          type: 'tool_use',
          priority: 'medium',
          estimatedDuration: 25,
          requiredResources: ['relevant files'],
          suggestedApproach: 'Review context and proceed with next logical step',
          dependencies: [],
          successCriteria: ['Progress made towards goal']
        });
    }
    
    return steps;
  }

  private identifyResourceRequirements(traces: WorkspaceMemoryTrace[], taskType: string): ResourceRequirement[] {
    const requirements: ResourceRequirement[] = [];
    
    // Add task-specific requirements
    requirements.push({
      type: 'tool',
      description: `Tools for ${taskType} work`,
      availability: 'available',
      criticality: 'required',
      alternatives: []
    });
    
    // Add file requirements if files are mentioned in traces
    const hasFileReferences = traces.some(t => t.content?.includes('file') || t.content?.includes('.'));
    if (hasFileReferences) {
      requirements.push({
        type: 'file',
        description: 'Project files and documentation',
        availability: 'available',
        criticality: 'helpful',
        alternatives: []
      });
    }
    
    return requirements;
  }

  private estimateTimeToComplete(progress: TaskProgress, nextSteps: ActionableStep[]): number {
    const remainingWork = 1 - progress.overallCompletion;
    const stepTime = nextSteps.reduce((total, step) => total + step.estimatedDuration, 0);
    
    return Math.max(stepTime, remainingWork * 60); // At least step time, or based on remaining work
  }

  private identifyFilesBeingEdited(files: any[], traces: WorkspaceMemoryTrace[]): FileEditContext[] {
    return files.slice(0, 3).map(file => ({
      path: file.path || file.name || 'unknown',
      editType: 'modifying' as const,
      lastModified: Date.now(),
      editGoal: 'Continue file editing',
      progressPercent: 50, // Assume mid-progress
      keyChanges: ['Recent modifications'],
      nextActions: ['Review changes', 'Continue editing']
    }));
  }

  private identifyRecentlyViewedFiles(files: any[], traces: WorkspaceMemoryTrace[]): FileViewContext[] {
    return files.slice(0, 5).map(file => ({
      path: file.path || file.name || 'unknown',
      viewedAt: Date.now() - Math.random() * 3600000, // Within last hour
      purpose: 'reference' as const,
      keyInsights: ['File reviewed for context'],
      relevanceScore: 0.7,
      followUpNeeded: false
    }));
  }

  private identifyScheduledActions(traces: WorkspaceMemoryTrace[]): FileScheduledAction[] {
    // Look for traces that suggest future actions
    return traces
      .filter(trace => trace.content?.toLowerCase().includes('need to') || trace.content?.toLowerCase().includes('todo'))
      .slice(0, 3)
      .map((trace, index) => ({
        path: `scheduled-action-${index}`,
        action: 'modify' as const,
        scheduledFor: 'next_session' as const,
        description: trace.content?.substring(0, 100) || 'Scheduled action',
        dependencies: [],
        priority: 'medium' as const
      }));
  }

  private createContentSnapshots(files: any[]): Record<string, string> {
    const snapshots: Record<string, string> = {};
    
    files.slice(0, 3).forEach(file => {
      if (file.content) {
        snapshots[file.path || file.name || 'unknown'] = file.content.substring(0, 500);
      }
    });
    
    return snapshots;
  }

  /**
   * Get context statistics
   */
  getContextStats(context: ContextData): {
    traceCount: number;
    fileCount: number;
    tagCount: number;
    activityTypeCount: number;
    toolCount: number;
    hasEnhancedContext: boolean;
  } {
    return {
      traceCount: context.traces.length,
      fileCount: context.files.length,
      tagCount: context.enhancedMetadata.tags.length,
      activityTypeCount: context.enhancedMetadata.activityTypes.length,
      toolCount: context.enhancedMetadata.toolsUsed.length,
      hasEnhancedContext: !!(context.conversationContext || context.activeTask || context.filesInProgress)
    };
  }
}