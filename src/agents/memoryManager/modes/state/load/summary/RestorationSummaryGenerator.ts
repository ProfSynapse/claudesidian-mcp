/**
 * RestorationSummaryGenerator - Generates comprehensive restoration summaries
 * Follows Single Responsibility Principle by focusing only on summary generation
 */

import { WorkspaceStateSnapshot, WorkspaceMemoryTrace } from '../../../../../../database/workspace-types';

export interface SummaryGenerationOptions {
  workspace: any;
  state: WorkspaceStateSnapshot;
  stateCreatedAt: string;
  originalSessionName: string;
  restorationGoal?: string;
  associatedNotes?: string[];
  traces?: WorkspaceMemoryTrace[];
  contextDepth?: 'minimal' | 'standard' | 'comprehensive';
}

/**
 * Service responsible for generating restoration summaries
 * Follows SRP by focusing only on summary generation logic
 */
export class RestorationSummaryGenerator {
  /**
   * Generate comprehensive restoration summary optimized for LLM context
   */
  generateRestorationSummary(options: SummaryGenerationOptions): string {
    const {
      workspace,
      state,
      stateCreatedAt,
      originalSessionName,
      restorationGoal,
      associatedNotes = [],
      traces = [],
      contextDepth = 'standard'
    } = options;

    // Generate LLM-optimized context based on enhanced schemas
    return this.generateLLMOptimizedContext(options);
  }

  /**
   * Generate LLM-optimized restoration context following the enhanced schema design
   */
  private generateLLMOptimizedContext(options: SummaryGenerationOptions): string {
    const {
      workspace,
      state,
      stateCreatedAt,
      originalSessionName, 
      restorationGoal,
      associatedNotes = [],
      traces = [],
      contextDepth = 'standard'
    } = options;

    // Build context structure following the loading experience design
    const currentSituation = this.buildCurrentSituation(state, workspace, originalSessionName, stateCreatedAt);
    const conversationReconstruction = this.buildConversationReconstruction(state, traces);
    const currentStateAssessment = this.buildCurrentStateAssessment(state, associatedNotes);
    const continuationGuidance = this.buildContinuationGuidance(state, traces, restorationGoal);
    const continuationResources = this.buildContinuationResources(state, associatedNotes, traces);

    // Generate structured prompt following the enhanced loading experience design
    let context = `# Restoring Work Context: ${state.name}\n\n`;
    
    // Current Situation Section
    context += `## What We're Restoring\n`;
    context += `**Original Goal:** ${currentSituation.originalGoal}\n`;
    context += `**Session Date:** ${stateCreatedAt}\n`;
    context += `**Session Duration:** ${currentSituation.sessionDuration}\n\n`;
    
    if (currentSituation.workAccomplished.length > 0) {
      context += `### Work Accomplished in Original Session:\n`;
      currentSituation.workAccomplished.forEach(item => {
        context += `- ${item}\n`;
      });
      context += `\n`;
    }
    
    context += `**Conversation Quality:** ${currentSituation.conversationQuality}\n\n`;

    // Conversation Reconstruction Section  
    if (conversationReconstruction.mainTopics.length > 0) {
      context += `## Conversation Reconstruction\n\n`;
      context += `### Main Topics Discussed:\n`;
      conversationReconstruction.mainTopics.forEach(topic => {
        context += `**${topic.topic}**\n`;
        context += `- Context: ${topic.context}\n`;
        context += `- Outcome: ${topic.outcome}\n`;
        context += `- Relevance to continuation: ${topic.relevanceLevel}/5\n\n`;
      });
    }

    if (conversationReconstruction.keyDecisions.length > 0) {
      context += `### Key Decisions Made:\n`;
      conversationReconstruction.keyDecisions.forEach(decision => {
        context += `- **${decision.decision}** (${decision.when})\n`;
        context += `  - Reasoning: ${decision.reasoning}\n`;
        context += `  - Current Status: ${decision.currentStatus}\n`;
        if (decision.needsRevisiting) {
          context += `  - ⚠️ May need revisiting due to: ${decision.needsRevisiting}\n`;
        }
        context += `\n`;
      });
    }

    if (conversationReconstruction.toolInteractions.length > 0) {
      context += `### Tools Used and Outcomes:\n`;
      conversationReconstruction.toolInteractions.forEach(interaction => {
        context += `- **${interaction.toolName}**: ${interaction.purpose}\n`;
        context += `  - Result: ${interaction.result}\n`;
        context += `  - Impact: ${interaction.impact}\n`;
        if (interaction.followUpNeeded) {
          context += `  - 🔄 Follow-up needed: ${interaction.followUpNeeded}\n`;
        }
        context += `\n`;
      });
    }

    if (conversationReconstruction.openQuestions.length > 0) {
      context += `### Questions Still Needing Resolution:\n`;
      conversationReconstruction.openQuestions.forEach(question => {
        context += `- ${question.question}\n`;
        if (question.context) {
          context += `  *Context: ${question.context}*\n`;
        }
        if (question.suggestedApproach) {
          context += `  *Suggested approach: ${question.suggestedApproach}*\n`;
        }
        context += `\n`;
      });
    }

    // Current State Assessment
    if (currentStateAssessment.filesChangedSince.length > 0) {
      context += `## What's Changed Since Then\n\n`;
      context += `### Files Modified Since State Creation:\n`;
      currentStateAssessment.filesChangedSince.forEach(change => {
        context += `- **${change.path}**: ${change.changeType} (${change.when})\n`;
        if (change.impact) {
          context += `  Impact on restoration: ${change.impact}\n`;
        }
        context += `\n`;
      });
    }

    if (currentStateAssessment.progressMade) {
      context += `### Progress Made Since Original Session:\n`;
      context += `${currentStateAssessment.progressMade.summary}\n`;
      if (currentStateAssessment.progressMade.completedItems.length > 0) {
        context += `**Completed:**\n`;
        currentStateAssessment.progressMade.completedItems.forEach(item => {
          context += `- ${item}\n`;
        });
        context += `\n`;
      }
    }

    if (currentStateAssessment.blockerStatus.length > 0) {
      context += `### Blocker Status Updates:\n`;
      currentStateAssessment.blockerStatus.forEach(blocker => {
        context += `- **${blocker.originalBlocker}**: ${blocker.currentStatus}\n`;
        if (blocker.resolution) {
          context += `  Resolution: ${blocker.resolution}\n`;
        }
        context += `\n`;
      });
    }

    // Continuation Guidance
    context += `## How to Continue Effectively\n\n`;
    
    if (continuationGuidance.immediateActions.length > 0) {
      context += `### Immediate Actions (Start Here):\n`;
      continuationGuidance.immediateActions.forEach((action, index) => {
        context += `${index + 1}. **${action.action}**: ${action.description}\n`;
        context += `   - Why important: ${action.reasoning}\n`;
        context += `   - Estimated time: ${action.estimatedTime} minutes\n`;
        if (action.requiredFiles) {
          context += `   - Files needed: ${action.requiredFiles}\n`;
        }
        context += `\n`;
      });
    }

    if (continuationGuidance.contextToReestablish.length > 0) {
      context += `### Context That Needs Rebuilding:\n`;
      continuationGuidance.contextToReestablish.forEach(contextItem => {
        context += `- **${contextItem.contextType}**: ${contextItem.description}\n`;
        context += `  - How to reestablish: ${contextItem.method}\n`;
        context += `  - Why needed: ${contextItem.importance}\n`;
        context += `\n`;
      });
    }

    if (continuationGuidance.decisionsPending.length > 0) {
      context += `### Decisions Pending from Original Session:\n`;
      continuationGuidance.decisionsPending.forEach(decision => {
        context += `- **${decision.decision}**: ${decision.description}\n`;
        context += `  - Options considered originally: ${decision.originalOptions}\n`;
        context += `  - Additional context since then: ${decision.newContext}\n`;
        context += `  - Recommended approach: ${decision.recommendation}\n`;
        context += `\n`;
      });
    }

    // Resources for Continuation
    context += `## Resources for Continuation\n\n`;
    
    if (continuationResources.relevantFiles.length > 0) {
      context += `### Most Relevant Files:\n`;
      continuationResources.relevantFiles.forEach(file => {
        context += `- **${file.path}**: ${file.relevance}\n`;
        if (file.originalContext) {
          context += `  *Original context: ${file.originalContext}*\n`;
        }
        if (file.currentRelevance) {
          context += `  *Current relevance: ${file.currentRelevance}*\n`;
        }
        context += `\n`;
      });
    }

    if (continuationResources.conversationExcerpts.length > 0) {
      context += `### Key Conversation Excerpts:\n`;
      continuationResources.conversationExcerpts.forEach(excerpt => {
        context += `**${excerpt.context}** (${excerpt.when}):\n`;
        context += `> ${excerpt.excerpt}\n`;
        if (excerpt.whyRelevant) {
          context += `*Why relevant now: ${excerpt.whyRelevant}*\n`;
        }
        context += `\n`;
      });
    }

    if (continuationResources.toolResults.length > 0) {
      context += `### Results from Original Tool Usage:\n`;
      continuationResources.toolResults.forEach(result => {
        context += `- **${result.toolName}**: ${result.summary}\n`;
        context += `  ${result.stillRelevant ? '✅ Still relevant' : '⚠️ May need re-running'}\n`;
        context += `\n`;
      });
    }

    // Footer
    context += `---\n\n`;
    context += `**Restoration Assessment:** ${currentStateAssessment.restorationViability}/5 - ${currentStateAssessment.restorationNotes}\n\n`;
    context += `**Recommended Starting Point:** ${continuationGuidance.recommendedStartingPoint}\n\n`;
    context += `**I'm ready to help you continue where we left off. What would you like to focus on first?**\n`;

    return context;
  }

  /**
   * Generate workspace information section
   */
  private generateWorkspaceSection(workspace: any): string {
    let section = `\n## Workspace Information\n`;
    section += `- Name: ${workspace.name}\n`;
    
    if (workspace.description) {
      section += `- Description: ${workspace.description}\n`;
    }
    
    section += `- Type: ${workspace.hierarchyType} level\n`;
    section += `- Root folder: ${workspace.rootFolder}\n`;
    
    return section;
  }

  /**
   * Generate state metadata section
   */
  private generateStateMetadataSection(state: WorkspaceStateSnapshot): string {
    if (!state.state?.metadata) {
      return '';
    }

    let section = `\n## State Metadata\n`;
    
    const metadata = state.state.metadata;
    for (const [key, value] of Object.entries(metadata)) {
      // Skip complex objects or large text fields
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        section += `- ${key}: ${value}\n`;
      } else if (Array.isArray(value) && value.length < 10) {
        section += `- ${key}: ${value.join(', ')}\n`;
      }
    }
    
    // Include state description if available
    if (state.description) {
      section += `\n## State Description\n${state.description}\n`;
    }

    return section;
  }

  /**
   * Generate associated notes section
   */
  private generateAssociatedNotesSection(associatedNotes: string[]): string {
    let section = `\n## Associated Notes (${associatedNotes.length})\n`;
    
    associatedNotes.forEach(file => {
      section += `- ${file}\n`;
    });

    return section;
  }

  /**
   * Generate historical context section
   */
  private generateHistoricalContextSection(traces: WorkspaceMemoryTrace[]): string {
    let section = `\n## Historical Context\n`;
    section += `This state includes ${traces.length} memory traces from the original session.\n`;
    
    // Group traces by activity type
    const groupedActivities = this.groupTracesByActivity(traces);
    
    // Show activity type counts
    for (const [activityType, count] of Object.entries(groupedActivities)) {
      section += `- ${count} ${activityType.replace('_', ' ')} activities\n`;
    }
    
    // List most significant traces (by importance)
    section += `\n### Key Activities\n`;
    traces
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 5)
      .forEach(trace => {
        const date = new Date(trace.timestamp).toLocaleString();
        const tool = trace.metadata?.tool || 'unknown tool';
        section += `- ${date}: ${this.summarizeTrace(trace)} (using ${tool})\n`;
      });

    return section;
  }

  /**
   * Group traces by activity type
   */
  private groupTracesByActivity(traces: WorkspaceMemoryTrace[]): Record<string, number> {
    const groupedActivities: Record<string, number> = {};
    
    traces.forEach(trace => {
      const activityType = trace.activityType;
      groupedActivities[activityType] = (groupedActivities[activityType] || 0) + 1;
    });

    return groupedActivities;
  }

  /**
   * Generate a human-readable summary of a memory trace
   */
  private summarizeTrace(trace: WorkspaceMemoryTrace): string {
    const tool = trace.metadata?.tool || 'unknown tool';
    
    // Create a summary based on activity type
    switch (trace.activityType) {
      case 'project_plan':
        return `Project planning with ${tool}`;
      case 'question':
        return `Research/questions using ${tool}`;
      case 'checkpoint':
        return `Progress checkpoint using ${tool}`;
      case 'completion':
        return `Completion status update using ${tool}`;
      case 'research':
        return `Research using ${tool}`;
      default:
        // Extract a short summary from content
        const contentPreview = trace.content.substring(0, 50).trim();
        return contentPreview ? `${contentPreview}...` : `Activity using ${tool}`;
    }
  }

  /**
   * Generate key topics from state and traces
   */
  generateKeyTopics(
    state: WorkspaceStateSnapshot,
    workspace: any,
    originalSessionName: string,
    restorationGoal?: string
  ): string[] {
    const stateMetadata = state.state?.metadata || {};
    
    const keyTopics = [
      ...(stateMetadata.tags || []),
      ...(restorationGoal ? [restorationGoal] : []),
      workspace.name,
      originalSessionName
    ].filter(Boolean);

    return keyTopics;
  }

  /**
   * Generate files interacted summary
   */
  generateFilesInteracted(
    associatedNotes: string[],
    timestamp: number
  ): {
    read: Array<{ path: string; interaction: string; timestamp: number }>;
    created: Array<any>;
    modified: Array<any>;
  } {
    return {
      read: associatedNotes.map(path => ({ 
        path, 
        interaction: 'read', 
        timestamp 
      })),
      created: [],
      modified: []
    };
  }

  // Helper methods for building enhanced context structures

  private buildCurrentSituation(state: any, workspace: any, originalSessionName: string, stateCreatedAt: string) {
    const stateMetadata = state.state?.metadata || {};
    
    return {
      originalGoal: stateMetadata.purpose || state.description || 'Continue previous work',
      sessionDuration: this.calculateSessionDuration(state),
      workAccomplished: this.extractWorkAccomplished(state, stateMetadata),
      conversationQuality: this.assessStateConversationQuality(state, stateMetadata)
    };
  }

  private buildConversationReconstruction(state: any, traces: WorkspaceMemoryTrace[]) {
    const stateMetadata = state.state?.metadata || {};
    
    return {
      mainTopics: this.extractMainTopicsFromState(state, traces),
      keyDecisions: this.extractKeyDecisionsFromState(state, traces),
      toolInteractions: this.extractToolInteractionsFromState(state, traces),
      openQuestions: this.extractOpenQuestionsFromState(state, traces)
    };
  }

  private buildCurrentStateAssessment(state: any, associatedNotes: string[]) {
    return {
      filesChangedSince: this.analyzeFileChanges(associatedNotes, state.timestamp),
      progressMade: this.analyzeProgressSinceState(state),
      blockerStatus: this.analyzeBlockerStatus(state),
      restorationViability: this.assessRestorationViability(state, associatedNotes),
      restorationNotes: this.generateRestorationNotes(state, associatedNotes)
    };
  }

  private buildContinuationGuidance(state: any, traces: WorkspaceMemoryTrace[], restorationGoal?: string) {
    return {
      immediateActions: this.generateImmediateActions(state, traces, restorationGoal),
      contextToReestablish: this.identifyContextToReestablish(state, traces),
      decisionsPending: this.identifyPendingDecisions(state, traces),
      recommendedStartingPoint: this.determineStartingPoint(state, traces, restorationGoal)
    };
  }

  private buildContinuationResources(state: any, associatedNotes: string[], traces: WorkspaceMemoryTrace[]) {
    return {
      relevantFiles: this.buildRelevantFilesList(associatedNotes, state),
      conversationExcerpts: this.extractConversationExcerpts(state, traces),
      toolResults: this.summarizeToolResults(state, traces)
    };
  }

  // Implementation methods for enhanced context building

  private calculateSessionDuration(state: any): string {
    // Simple duration calculation - could be enhanced with actual session data
    return 'Previous session duration';
  }

  private extractWorkAccomplished(state: any, metadata: any): string[] {
    const accomplished: string[] = [];
    
    if (metadata.activityTypes) {
      metadata.activityTypes.forEach((activity: string) => {
        accomplished.push(`Completed ${activity.replace('_', ' ')} activities`);
      });
    }
    
    if (metadata.toolsUsed && metadata.toolsUsed.length > 0) {
      accomplished.push(`Used ${metadata.toolsUsed.length} different tools`);
    }
    
    if (metadata.tags && metadata.tags.length > 0) {
      accomplished.push(`Worked on ${metadata.tags.length} tagged topics`);
    }
    
    return accomplished.length > 0 ? accomplished : ['Session context captured'];
  }

  private assessStateConversationQuality(state: any, metadata: any): string {
    const activityCount = metadata.activityTypes?.length || 0;
    const toolCount = metadata.toolsUsed?.length || 0;
    
    if (activityCount >= 3 && toolCount >= 2) {
      return 'High - comprehensive session with multiple activities and tools';
    } else if (activityCount >= 2) {
      return 'Good - meaningful session with clear activities';
    } else if (activityCount >= 1) {
      return 'Moderate - basic session context available';
    } else {
      return 'Limited - minimal session context';
    }
  }

  private extractMainTopicsFromState(state: any, traces: WorkspaceMemoryTrace[]): any[] {
    const topics: any[] = [];
    const metadata = state.state?.metadata || {};
    
    // Extract topics from tags and activity types
    if (metadata.tags) {
      metadata.tags.slice(0, 3).forEach((tag: string) => {
        topics.push({
          topic: tag.replace(/[^a-zA-Z0-9\s]/g, ''),
          context: 'Identified from session tags',
          outcome: 'Topic explored during session',
          relevanceLevel: 4
        });
      });
    }
    
    return topics;
  }

  private extractKeyDecisionsFromState(state: any, traces: WorkspaceMemoryTrace[]): any[] {
    const decisions: any[] = [];
    
    // Look for decision-like content in traces
    traces.forEach(trace => {
      if (trace.content && (
        trace.content.toLowerCase().includes('decided') ||
        trace.content.toLowerCase().includes('choose') ||
        trace.content.toLowerCase().includes('approach')
      )) {
        decisions.push({
          decision: trace.content.substring(0, 80) + '...',
          when: new Date(trace.timestamp).toLocaleDateString(),
          reasoning: 'Inferred from session content',
          currentStatus: 'pending implementation',
          needsRevisiting: false
        });
      }
    });
    
    return decisions.slice(0, 3);
  }

  private extractToolInteractionsFromState(state: any, traces: WorkspaceMemoryTrace[]): any[] {
    const interactions: any[] = [];
    
    traces.filter(trace => trace.metadata?.tool).forEach(trace => {
      interactions.push({
        toolName: trace.metadata!.tool,
        purpose: `${trace.activityType.replace('_', ' ')} activity`,
        result: 'success',
        impact: trace.content ? `Generated: ${trace.content.substring(0, 40)}...` : 'Tool executed successfully',
        followUpNeeded: trace.activityType === 'question'
      });
    });
    
    return interactions.slice(0, 5);
  }

  private extractOpenQuestionsFromState(state: any, traces: WorkspaceMemoryTrace[]): any[] {
    const questions: any[] = [];
    
    traces.forEach(trace => {
      if (trace.content && trace.content.includes('?')) {
        const questionMatch = trace.content.match(/[^.!?]*\?/);
        if (questionMatch) {
          questions.push({
            question: questionMatch[0].trim(),
            context: `From ${trace.activityType} activity`,
            suggestedApproach: 'Review context and research further'
          });
        }
      }
    });
    
    return questions.slice(0, 3);
  }

  private analyzeFileChanges(associatedNotes: string[], stateTimestamp: number) {
    // Mock implementation - in real system would check actual file modifications
    return associatedNotes.slice(0, 3).map(path => ({
      path,
      changeType: 'potentially modified',
      when: 'since state creation',
      impact: 'May need to review for changes'
    }));
  }

  private analyzeProgressSinceState(state: any) {
    return {
      summary: 'Time has passed since state creation, potential progress may have been made.',
      completedItems: []
    };
  }

  private analyzeBlockerStatus(state: any): any[] {
    return []; // No blockers identified in current implementation
  }

  private assessRestorationViability(state: any, associatedNotes: string[]): number {
    let score = 3; // Base score
    
    if (associatedNotes.length > 0) score += 1;
    if (state.state?.metadata?.tags?.length > 0) score += 1;
    
    return Math.min(score, 5);
  }

  private generateRestorationNotes(state: any, associatedNotes: string[]): string {
    return 'Good restoration potential with available context and files';
  }

  private generateImmediateActions(state: any, traces: WorkspaceMemoryTrace[], restorationGoal?: string) {
    const actions = [];
    
    if (restorationGoal) {
      actions.push({
        action: 'Review restoration goal',
        description: `Focus on: ${restorationGoal}`,
        reasoning: 'Clear goal provided for continuation',
        estimatedTime: 5,
        requiredFiles: ''
      });
    }
    
    actions.push({
      action: 'Review captured context',
      description: 'Understand what was accomplished in previous session',
      reasoning: 'Essential for effective continuation',
      estimatedTime: 10,
      requiredFiles: 'Associated files'
    });
    
    if (traces.length > 0) {
      const recentActivity = traces.sort((a, b) => b.timestamp - a.timestamp)[0];
      actions.push({
        action: 'Continue previous activity',
        description: `Resume ${recentActivity.activityType.replace('_', ' ')} work`,
        reasoning: 'Natural continuation from last session',
        estimatedTime: 20,
        requiredFiles: 'Context files'
      });
    }
    
    return actions;
  }

  private identifyContextToReestablish(state: any, traces: WorkspaceMemoryTrace[]) {
    const context = [];
    
    const metadata = state.state?.metadata;
    if (metadata?.activityTypes?.length > 0) {
      context.push({
        contextType: 'Activity Context',
        description: `Previous activities: ${metadata.activityTypes.join(', ')}`,
        method: 'Review what was being worked on',
        importance: 'Provides work continuation context'
      });
    }
    
    if (metadata?.toolsUsed?.length > 0) {
      context.push({
        contextType: 'Tool Usage Context',
        description: `Previously used tools: ${metadata.toolsUsed.join(', ')}`,
        method: 'Understand which tools were effective',
        importance: 'Helps determine best tools for continuation'
      });
    }
    
    return context;
  }

  private identifyPendingDecisions(state: any, traces: WorkspaceMemoryTrace[]): any[] {
    // Simple implementation - could be enhanced with decision detection
    return [];
  }

  private determineStartingPoint(state: any, traces: WorkspaceMemoryTrace[], restorationGoal?: string): string {
    if (restorationGoal) {
      return `Begin with restoration goal: ${restorationGoal}`;
    }
    
    if (traces.length > 0) {
      const recentTrace = traces.sort((a, b) => b.timestamp - a.timestamp)[0];
      return `Continue from last activity: ${recentTrace.activityType.replace('_', ' ')}`;
    }
    
    return 'Start by reviewing captured context and determining next steps';
  }

  private buildRelevantFilesList(associatedNotes: string[], state: any) {
    return associatedNotes.slice(0, 5).map(path => ({
      path,
      relevance: 'File was active during previous session',
      originalContext: 'Associated with workspace state',
      currentRelevance: 'Likely still relevant for continuation'
    }));
  }

  private extractConversationExcerpts(state: any, traces: WorkspaceMemoryTrace[]) {
    return traces
      .filter(trace => trace.content && trace.content.length > 20)
      .slice(0, 3)
      .map(trace => ({
        context: `${trace.activityType.replace('_', ' ')} activity`,
        when: new Date(trace.timestamp).toLocaleDateString(),
        excerpt: trace.content.substring(0, 100) + '...',
        whyRelevant: 'Shows the type of work being done'
      }));
  }

  private summarizeToolResults(state: any, traces: WorkspaceMemoryTrace[]) {
    const toolsUsed = [...new Set(traces.map(t => t.metadata?.tool).filter(Boolean))];
    
    return toolsUsed.map(tool => ({
      toolName: tool,
      summary: `Tool was used during previous session`,
      stillRelevant: true
    }));
  }
}