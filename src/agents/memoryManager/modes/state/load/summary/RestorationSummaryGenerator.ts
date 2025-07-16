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
   * Generate comprehensive restoration summary
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

    const restorationTimestamp = new Date().toLocaleString();
    
    let summary = `# Workspace Restoration Summary\n`;
    summary += `Loaded at: ${restorationTimestamp}\n`;
    summary += `From state: "${state.name}" (created on ${stateCreatedAt})\n`;
    summary += `Original session: "${originalSessionName}"\n`;
    
    if (restorationGoal) {
      summary += `\n## Restoration Goal\n${restorationGoal}\n`;
    }
    
    summary += this.generateWorkspaceSection(workspace);
    
    // If not minimal context, include state metadata
    if (contextDepth !== 'minimal') {
      summary += this.generateStateMetadataSection(state);
    }
    
    // Include associated notes information
    if (associatedNotes.length > 0) {
      summary += this.generateAssociatedNotesSection(associatedNotes);
    }
    
    // If comprehensive context is requested and traces are available, include detailed information
    if (contextDepth === 'comprehensive' && traces.length > 0) {
      summary += this.generateHistoricalContextSection(traces);
    }
    
    return summary;
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
}