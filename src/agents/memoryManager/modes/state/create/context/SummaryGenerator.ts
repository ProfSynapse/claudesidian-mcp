/**
 * SummaryGenerator - Generates comprehensive summaries for state creation
 * Follows Single Responsibility Principle by focusing only on summary generation
 */

import { WorkspaceMemoryTrace } from '../../../../../../database/workspace-types';

export interface StateSummary {
  summary: string;
  purpose: string;
  sessionMemory: string;
  toolContext: string;
  files: string[];
  traceCount: number;
  tags: string[];
  reason?: string;
  // Enhanced context for better restoration
  conversationReconstruction?: {
    keyTopics: string[];
    decisions: string[];
    openQuestions: string[];
    conversationQuality: string;
    progressMade: string[];
  };
  activeTaskContext?: {
    currentGoal: string;
    taskType: string;
    nextSteps: string[];
    blockers: string[];
    estimatedCompletion: string;
  };
  restorationGuidance?: {
    immediateActions: string[];
    contextToReestablish: string[];
    recommendedStartingPoint: string;
    continuationStrategy: string;
  };
}

/**
 * Service responsible for generating comprehensive summaries for states
 * Follows SRP by focusing only on summary generation and formatting
 */
export class SummaryGenerator {
  /**
   * Generate comprehensive state summary with enhanced context
   */
  generateStateSummary(
    workspace: any,
    session: any,
    traces: WorkspaceMemoryTrace[],
    files: any[],
    metadata: any,
    name: string,
    description: string,
    enhancedContext?: any
  ): StateSummary {
    const summary = this.buildComprehensiveSummary(workspace, session, traces, files);
    const purpose = this.extractPurpose(description, metadata.reason);
    const sessionMemory = this.generateSessionMemory(session, traces);
    const toolContext = this.generateToolContext(traces, metadata.reason, name);
    
    // Generate enhanced context if available
    const conversationReconstruction = enhancedContext?.conversationContext 
      ? this.generateConversationReconstruction(enhancedContext.conversationContext, traces)
      : undefined;
    
    const activeTaskContext = enhancedContext?.activeTask
      ? this.generateActiveTaskContext(enhancedContext.activeTask)
      : undefined;
    
    const restorationGuidance = this.generateRestorationGuidance(
      traces, 
      enhancedContext?.activeTask, 
      enhancedContext?.conversationContext
    );
    
    return {
      summary,
      purpose,
      sessionMemory,
      toolContext,
      files: files.map(f => f.path || f.name || 'unknown'),
      traceCount: traces.length,
      tags: metadata.tags || [],
      reason: metadata.reason,
      conversationReconstruction,
      activeTaskContext,
      restorationGuidance
    };
  }

  /**
   * Build comprehensive summary of the workspace state
   */
  private buildComprehensiveSummary(
    workspace: any,
    session: any,
    traces: WorkspaceMemoryTrace[],
    files: any[]
  ): string {
    let summary = `# Workspace State Summary\n`;
    summary += `Created on ${new Date().toLocaleString()}\n\n`;

    // Workspace Information
    summary += `## Workspace Information\n`;
    summary += `- Name: ${workspace.name}\n`;
    if (workspace.description) {
      summary += `- Description: ${workspace.description}\n`;
    }
    summary += `- Type: ${workspace.hierarchyType} level\n`;
    summary += `- Root folder: ${workspace.rootFolder}\n`;
    summary += `- Created: ${new Date(workspace.created).toLocaleString()}\n`;
    summary += `- Last accessed: ${new Date(workspace.lastAccessed).toLocaleString()}\n`;
    
    // Session Information
    summary += `\n## Session Information\n`;
    summary += `- Session: ${session.name || 'Unnamed session'}\n`;
    summary += `- Started: ${new Date(session.startTime).toLocaleString()}\n`;
    if (session.description) {
      summary += `- Description: ${session.description}\n`;
    }
    summary += `- Tool calls in session: ${session.toolCalls || 0}\n`;
    
    // Activity summary
    if (traces.length > 0) {
      summary += this.generateActivitySummary(traces);
    }
    
    // File information
    if (files.length > 0) {
      summary += this.generateFileSummary(files);
    }

    return summary;
  }

  /**
   * Generate activity summary from traces
   */
  private generateActivitySummary(traces: WorkspaceMemoryTrace[]): string {
    let summary = `\n## Recent Activities (${traces.length})\n`;
    
    // Group traces by activity type
    const groupedActivities: Record<string, number> = {};
    traces.forEach(trace => {
      const activityType = trace.activityType;
      groupedActivities[activityType] = (groupedActivities[activityType] || 0) + 1;
    });
    
    // Show activity type counts
    for (const [activityType, count] of Object.entries(groupedActivities)) {
      summary += `- ${count} ${activityType.replace('_', ' ')} activities\n`;
    }
    
    // List most recent traces
    summary += `\n### Most Recent Activities\n`;
    traces
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .forEach(trace => {
        const date = new Date(trace.timestamp).toLocaleString();
        const tool = trace.metadata?.tool || 'unknown tool';
        summary += `- ${date}: ${this.summarizeTrace(trace)} (using ${tool})\n`;
      });

    return summary;
  }

  /**
   * Generate file summary
   */
  private generateFileSummary(files: any[]): string {
    let summary = `\n## Relevant Files (${files.length})\n`;
    
    files.forEach(file => {
      const filePath = file.path || file.name || 'unknown';
      const lastModified = file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'unknown';
      const size = file.size ? this.formatFileSize(file.size) : 'unknown size';
      
      summary += `- **${filePath}**\n`;
      summary += `  - Last modified: ${lastModified}\n`;
      summary += `  - Size: ${size}\n`;
      
      if (file.type) {
        summary += `  - Type: ${file.type}\n`;
      }
      
      if (file.content && file.content.length > 0) {
        const preview = file.content.substring(0, 200);
        summary += `  - Preview: ${preview}${file.content.length > 200 ? '...' : ''}\n`;
      }
      
      summary += '\n';
    });

    return summary;
  }

  /**
   * Extract purpose from description and reason
   */
  private extractPurpose(description: string, reason?: string): string {
    if (reason) {
      return reason;
    }
    
    if (description && description.length > 0) {
      // Try to extract the first sentence as purpose
      const firstSentence = description.split('.')[0];
      if (firstSentence.length > 0) {
        return firstSentence.trim();
      }
    }
    
    return 'State created for workspace context preservation';
  }

  /**
   * Generate session memory summary
   */
  private generateSessionMemory(session: any, traces: WorkspaceMemoryTrace[]): string {
    let memory = `Session "${session.name || 'Unnamed'}" `;
    memory += `started ${new Date(session.startTime).toLocaleString()}. `;
    
    if (traces.length > 0) {
      const recentActivities = traces
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 3)
        .map(trace => this.summarizeTrace(trace))
        .join(', ');
      
      memory += `Recent activities include: ${recentActivities}. `;
    }
    
    memory += `Total tool calls: ${session.toolCalls || 0}.`;
    
    return memory;
  }

  /**
   * Generate tool context
   */
  private generateToolContext(traces: WorkspaceMemoryTrace[], reason?: string, stateName?: string): string {
    let context = `State "${stateName || 'unnamed'}" created `;
    
    if (reason) {
      context += `for: ${reason}. `;
    } else {
      context += 'to preserve current workspace context. ';
    }
    
    if (traces.length > 0) {
      const tools = [...new Set(traces.map(t => t.metadata?.tool).filter(Boolean))];
      if (tools.length > 0) {
        context += `Recent tools used: ${tools.join(', ')}. `;
      }
    }
    
    context += `Captured at ${new Date().toLocaleString()}.`;
    
    return context;
  }

  /**
   * Summarize a memory trace for display
   */
  private summarizeTrace(trace: WorkspaceMemoryTrace): string {
    // Extract meaningful information from the trace based on actual activityType values
    switch (trace.activityType) {
      case 'project_plan':
        return 'project planning activity';
      case 'question':
        return 'question or inquiry';
      case 'checkpoint':
        return 'checkpoint review';
      case 'completion':
        return 'task completion';
      case 'research':
        return 'research activity';
      default:
        return trace.activityType;
    }
  }

  /**
   * Generate conversation reconstruction summary
   */
  private generateConversationReconstruction(conversationContext: any, traces: WorkspaceMemoryTrace[]): {
    keyTopics: string[];
    decisions: string[];
    openQuestions: string[];
    conversationQuality: string;
    progressMade: string[];
  } {
    return {
      keyTopics: conversationContext.mainTopics || [],
      decisions: (conversationContext.decisions || []).map((d: any) => d.description),
      openQuestions: conversationContext.openQuestions || [],
      conversationQuality: this.assessConversationQuality(traces, conversationContext),
      progressMade: this.extractProgressMade(traces, conversationContext)
    };
  }

  /**
   * Generate active task context summary
   */
  private generateActiveTaskContext(activeTask: any): {
    currentGoal: string;
    taskType: string;
    nextSteps: string[];
    blockers: string[];
    estimatedCompletion: string;
  } {
    return {
      currentGoal: activeTask.currentGoal || 'Continue current work',
      taskType: activeTask.taskType || 'general',
      nextSteps: (activeTask.nextSteps || []).map((step: any) => step.description),
      blockers: activeTask.progress?.blockers || [],
      estimatedCompletion: this.formatEstimatedTime(activeTask.estimatedTimeToComplete)
    };
  }

  /**
   * Generate restoration guidance
   */
  private generateRestorationGuidance(
    traces: WorkspaceMemoryTrace[], 
    activeTask?: any, 
    conversationContext?: any
  ): {
    immediateActions: string[];
    contextToReestablish: string[];
    recommendedStartingPoint: string;
    continuationStrategy: string;
  } {
    const immediateActions = this.identifyImmediateActions(traces, activeTask, conversationContext);
    const contextToReestablish = this.identifyContextToReestablish(traces, conversationContext);
    const recommendedStartingPoint = this.determineStartingPoint(traces, activeTask);
    const continuationStrategy = this.developContinuationStrategy(traces, activeTask, conversationContext);

    return {
      immediateActions,
      contextToReestablish,
      recommendedStartingPoint,
      continuationStrategy
    };
  }

  /**
   * Assess conversation quality
   */
  private assessConversationQuality(traces: WorkspaceMemoryTrace[], conversationContext: any): string {
    const traceCount = traces.length;
    const topicCount = conversationContext?.mainTopics?.length || 0;
    const decisionCount = conversationContext?.decisions?.length || 0;

    if (traceCount >= 10 && topicCount >= 3 && decisionCount >= 1) {
      return 'High - comprehensive conversation with clear topics and decisions';
    } else if (traceCount >= 5 && topicCount >= 2) {
      return 'Good - meaningful conversation with identifiable themes';
    } else if (traceCount >= 3) {
      return 'Moderate - basic conversation context available';
    } else {
      return 'Limited - minimal conversation context';
    }
  }

  /**
   * Extract progress made from traces and conversation
   */
  private extractProgressMade(traces: WorkspaceMemoryTrace[], conversationContext: any): string[] {
    const progress: string[] = [];
    
    // Look for completion indicators
    const completionTraces = traces.filter(t => t.activityType === 'completion');
    completionTraces.forEach(trace => {
      progress.push(`Completed: ${trace.content?.substring(0, 50) || 'task'}`);
    });

    // Look for decisions made
    if (conversationContext?.decisions?.length > 0) {
      progress.push(`Made ${conversationContext.decisions.length} key decisions`);
    }

    // Look for research or planning activities
    const researchCount = traces.filter(t => t.activityType === 'research').length;
    if (researchCount > 0) {
      progress.push(`Conducted ${researchCount} research activities`);
    }

    const planningCount = traces.filter(t => t.activityType === 'project_plan').length;
    if (planningCount > 0) {
      progress.push(`Completed ${planningCount} planning activities`);
    }

    return progress.length > 0 ? progress : ['Session initiated and context established'];
  }

  /**
   * Identify immediate actions for restoration
   */
  private identifyImmediateActions(traces: WorkspaceMemoryTrace[], activeTask?: any, conversationContext?: any): string[] {
    const actions: string[] = [];
    
    // If there's an active task with next steps
    if (activeTask?.nextSteps?.length > 0) {
      const highPrioritySteps = activeTask.nextSteps
        .filter((step: any) => step.priority === 'high' || step.priority === 'urgent')
        .slice(0, 2);
      
      highPrioritySteps.forEach((step: any) => {
        actions.push(step.description);
      });
    }

    // If there are open questions, suggest addressing them
    if (conversationContext?.openQuestions?.length > 0) {
      actions.push(`Address ${conversationContext.openQuestions.length} open questions from previous session`);
    }

    // If no specific actions, provide general guidance
    if (actions.length === 0) {
      if (traces.length > 0) {
        const recentActivity = traces.sort((a, b) => b.timestamp - a.timestamp)[0];
        actions.push(`Continue ${recentActivity.activityType.replace('_', ' ')} work from previous session`);
      } else {
        actions.push('Review captured context and determine next steps');
      }
    }

    return actions;
  }

  /**
   * Identify context that needs reestablishing
   */
  private identifyContextToReestablish(traces: WorkspaceMemoryTrace[], conversationContext?: any): string[] {
    const context: string[] = [];
    
    // Topics that were being discussed
    if (conversationContext?.mainTopics?.length > 0) {
      context.push(`Main discussion topics: ${conversationContext.mainTopics.slice(0, 3).join(', ')}`);
    }

    // Recent tool usage context
    const toolsUsed = [...new Set(traces.map(t => t.metadata?.tool).filter(Boolean))];
    if (toolsUsed.length > 0) {
      context.push(`Recently used tools: ${toolsUsed.join(', ')}`);
    }

    // Activity context
    const recentActivities = [...new Set(traces.slice(-5).map(t => t.activityType))];
    if (recentActivities.length > 0) {
      context.push(`Recent activity types: ${recentActivities.join(', ')}`);
    }

    return context;
  }

  /**
   * Determine recommended starting point
   */
  private determineStartingPoint(traces: WorkspaceMemoryTrace[], activeTask?: any): string {
    // If there's a clear active task goal
    if (activeTask?.currentGoal) {
      return `Resume work on: ${activeTask.currentGoal}`;
    }

    // If there are recent traces, continue from there
    if (traces.length > 0) {
      const recentTrace = traces.sort((a, b) => b.timestamp - a.timestamp)[0];
      return `Continue from last activity: ${recentTrace.activityType.replace('_', ' ')}`;
    }

    return 'Begin by reviewing captured context and files';
  }

  /**
   * Develop continuation strategy
   */
  private developContinuationStrategy(traces: WorkspaceMemoryTrace[], activeTask?: any, conversationContext?: any): string {
    let strategy = '';

    // Base strategy on task type and progress
    if (activeTask?.taskType) {
      switch (activeTask.taskType) {
        case 'research':
          strategy = 'Continue systematic research, building on previous findings and addressing remaining questions.';
          break;
        case 'development':
          strategy = 'Resume development work, reviewing recent code changes and implementing next features.';
          break;
        case 'writing':
          strategy = 'Continue writing project, reviewing previous sections and expanding content.';
          break;
        case 'analysis':
          strategy = 'Proceed with analysis, building on previous insights and exploring new angles.';
          break;
        case 'planning':
          strategy = 'Advance planning efforts, refining previous plans and addressing implementation details.';
          break;
        case 'review':
          strategy = 'Continue review process, addressing previous feedback and completing evaluation.';
          break;
        default:
          strategy = 'Proceed methodically, building on previous progress and maintaining momentum.';
      }
    } else {
      strategy = 'Review captured context, understand previous progress, and proceed with logical next steps.';
    }

    // Add specific guidance based on conversation context
    if (conversationContext?.decisions?.length > 0) {
      strategy += ' Pay attention to recent decisions made and ensure implementation follows through.';
    }

    if (conversationContext?.openQuestions?.length > 0) {
      strategy += ' Address outstanding questions to remove blockers and clarify direction.';
    }

    return strategy;
  }

  /**
   * Format estimated time for display
   */
  private formatEstimatedTime(minutes?: number): string {
    if (!minutes || minutes <= 0) {
      return 'Unknown';
    }

    if (minutes < 60) {
      return `${Math.round(minutes)} minutes`;
    } else if (minutes < 1440) { // Less than 24 hours
      const hours = Math.round(minutes / 60 * 10) / 10; // Round to 1 decimal
      return `${hours} hours`;
    } else {
      const days = Math.round(minutes / 1440 * 10) / 10;
      return `${days} days`;
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}