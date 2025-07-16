/**
 * SummaryGenerator - Generates workspace summaries and descriptions
 * Follows Single Responsibility Principle by focusing only on summary generation
 */

export interface WorkspaceSummary {
  description: string;
  stats: {
    hierarchyLevel: string;
    childCount?: number;
    hasParent: boolean;
    created: string;
    lastAccessed: string;
  };
  structure: {
    rootFolder: string;
    hasCustomPath: boolean;
    pathDepth: number;
  };
}

/**
 * Service responsible for generating workspace summaries
 * Follows SRP by focusing only on summary generation logic
 */
export class SummaryGenerator {
  /**
   * Generate comprehensive workspace summary
   */
  generateWorkspaceSummary(
    workspace: any,
    children?: Array<{id: string; name: string; hierarchyType: string}>
  ): WorkspaceSummary {
    const stats = this.generateWorkspaceStats(workspace, children);
    const structure = this.generateStructureInfo(workspace);
    const description = this.generateDescription(workspace, stats, structure);

    return {
      description,
      stats,
      structure
    };
  }

  /**
   * Generate workspace statistics
   */
  private generateWorkspaceStats(
    workspace: any,
    children?: Array<{id: string; name: string; hierarchyType: string}>
  ): WorkspaceSummary['stats'] {
    return {
      hierarchyLevel: workspace.hierarchyType || 'workspace',
      childCount: children?.length,
      hasParent: !!(workspace.parentId || (workspace.path && workspace.path.length > 1)),
      created: new Date(workspace.created).toLocaleDateString(),
      lastAccessed: new Date(workspace.lastAccessed).toLocaleDateString()
    };
  }

  /**
   * Generate workspace structure information
   */
  private generateStructureInfo(workspace: any): WorkspaceSummary['structure'] {
    const path = workspace.path || [];
    
    return {
      rootFolder: workspace.rootFolder || '/',
      hasCustomPath: path.length > 1,
      pathDepth: path.length
    };
  }

  /**
   * Generate descriptive summary text
   */
  private generateDescription(
    workspace: any,
    stats: WorkspaceSummary['stats'],
    structure: WorkspaceSummary['structure']
  ): string {
    let description = `# ${workspace.name}\n\n`;
    
    // Add workspace description if available
    if (workspace.description) {
      description += `${workspace.description}\n\n`;
    }

    // Add hierarchy information
    description += `**Type**: ${this.formatHierarchyType(stats.hierarchyLevel)}\n`;
    
    if (stats.hasParent) {
      description += `**Parent**: Has parent workspace\n`;
    }

    if (stats.childCount && stats.childCount > 0) {
      description += `**Children**: ${stats.childCount} sub-${stats.hierarchyLevel === 'workspace' ? 'phases' : 'tasks'}\n`;
    }

    // Add structure information
    description += `**Location**: ${structure.rootFolder}\n`;
    
    if (structure.hasCustomPath) {
      description += `**Path Depth**: ${structure.pathDepth} levels\n`;
    }

    // Add timing information
    description += `**Created**: ${stats.created}\n`;
    description += `**Last Accessed**: ${stats.lastAccessed}\n`;

    // Add status if available
    if (workspace.status) {
      description += `**Status**: ${this.formatStatus(workspace.status)}\n`;
    }

    // Add completion status if available
    if (workspace.completionStatus) {
      const completionInfo = this.formatCompletionStatus(workspace.completionStatus);
      if (completionInfo) {
        description += `**Progress**: ${completionInfo}\n`;
      }
    }

    // Add relevance settings summary if available
    if (workspace.relevanceSettings) {
      description += `\n**Relevance Weights**:\n`;
      description += `- Folder Proximity: ${(workspace.relevanceSettings.folderProximityWeight * 100).toFixed(0)}%\n`;
      description += `- Recency: ${(workspace.relevanceSettings.recencyWeight * 100).toFixed(0)}%\n`;
      description += `- Frequency: ${(workspace.relevanceSettings.frequencyWeight * 100).toFixed(0)}%\n`;
    }

    return description;
  }

  /**
   * Format hierarchy type for display
   */
  private formatHierarchyType(hierarchyType: string): string {
    switch (hierarchyType) {
      case 'workspace':
        return 'Project Workspace';
      case 'phase':
        return 'Project Phase';
      case 'task':
        return 'Task';
      default:
        return hierarchyType.charAt(0).toUpperCase() + hierarchyType.slice(1);
    }
  }

  /**
   * Format status for display
   */
  private formatStatus(status: string): string {
    switch (status) {
      case 'active':
        return '🟢 Active';
      case 'paused':
        return '🟡 Paused';
      case 'completed':
        return '✅ Completed';
      default:
        return status;
    }
  }

  /**
   * Format completion status
   */
  private formatCompletionStatus(completionStatus: any): string | null {
    if (!completionStatus || typeof completionStatus !== 'object') {
      return null;
    }

    const entries = Object.entries(completionStatus);
    if (entries.length === 0) {
      return null;
    }

    const completed = entries.filter(([_, status]) => status === true).length;
    const total = entries.length;
    const percentage = Math.round((completed / total) * 100);

    return `${completed}/${total} items completed (${percentage}%)`;
  }

  /**
   * Generate quick summary for lists
   */
  generateQuickSummary(workspace: any): string {
    const type = this.formatHierarchyType(workspace.hierarchyType || 'workspace');
    const folder = workspace.rootFolder || '/';
    const status = workspace.status ? ` (${this.formatStatus(workspace.status)})` : '';
    
    return `${type} in ${folder}${status}`;
  }

  /**
   * Generate summary with child information
   */
  generateSummaryWithChildren(
    workspace: any,
    children?: Array<{id: string; name: string; hierarchyType: string}>
  ): string {
    let summary = this.generateQuickSummary(workspace);
    
    if (children && children.length > 0) {
      const childTypes = children.reduce((acc, child) => {
        acc[child.hierarchyType] = (acc[child.hierarchyType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const childSummary = Object.entries(childTypes)
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ');

      summary += ` with ${childSummary}`;
    }

    return summary;
  }
}