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
}

/**
 * Service responsible for generating comprehensive summaries for states
 * Follows SRP by focusing only on summary generation and formatting
 */
export class SummaryGenerator {
  /**
   * Generate comprehensive state summary
   */
  generateStateSummary(
    workspace: any,
    session: any,
    traces: WorkspaceMemoryTrace[],
    files: any[],
    metadata: any,
    name: string,
    description: string
  ): StateSummary {
    const summary = this.buildComprehensiveSummary(workspace, session, traces, files);
    const purpose = this.extractPurpose(description, metadata.reason);
    const sessionMemory = this.generateSessionMemory(session, traces);
    const toolContext = this.generateToolContext(traces, metadata.reason, name);
    
    return {
      summary,
      purpose,
      sessionMemory,
      toolContext,
      files: files.map(f => f.path || f.name || 'unknown'),
      traceCount: traces.length,
      tags: metadata.tags || [],
      reason: metadata.reason
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