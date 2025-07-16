/**
 * StateCollector - Collects state data for workspace context
 * Follows Single Responsibility Principle by focusing only on state data collection
 */

import { MemoryService } from '../../../../../../database/services/MemoryService';

export interface StateInfo {
  id: string;
  name: string;
  description?: string;
  created: number;
  lastAccessed: number;
  hierarchyType: string;
  parentId?: string;
  completionStatus?: Record<string, boolean>;
  status?: string;
  memoryTraceCount?: number;
}

export interface StateCollectionOptions {
  limit?: number;
  includeInactive?: boolean;
  sortBy?: 'created' | 'lastAccessed' | 'name';
  sortOrder?: 'asc' | 'desc';
  hierarchyType?: string;
}

/**
 * Service responsible for collecting state data for workspace context
 * Follows SRP by focusing only on state data collection and formatting
 */
export class StateCollector {
  constructor(private memoryService: MemoryService) {}

  /**
   * Get workspace states
   */
  async getWorkspaceStates(
    workspaceId: string,
    options: StateCollectionOptions = {}
  ): Promise<StateInfo[]> {
    const {
      limit = 20,
      includeInactive = true,
      sortBy = 'lastAccessed',
      sortOrder = 'desc',
      hierarchyType
    } = options;

    try {
      // Get states from memory service
      const states = await this.memoryService.getSnapshots(workspaceId);
      
      // Convert to StateInfo format
      let stateInfos: StateInfo[] = states.map((state: any) => ({
        id: state.id,
        name: state.name,
        description: state.description,
        created: state.timestamp,
        lastAccessed: state.timestamp,
        hierarchyType: state.state?.workspace?.hierarchyType || 'workspace',
        parentId: state.state?.workspace?.parentId,
        completionStatus: state.state?.workspace?.completionStatus,
        status: state.state?.workspace?.status,
        memoryTraceCount: state.state?.recentTraces?.length || 0
      }));

      // Filter by hierarchy type if specified
      if (hierarchyType) {
        stateInfos = stateInfos.filter(state => state.hierarchyType === hierarchyType);
      }

      // Filter inactive states if requested
      if (!includeInactive) {
        stateInfos = stateInfos.filter(state => state.status !== 'inactive');
      }

      // Sort states
      this.sortStates(stateInfos, sortBy, sortOrder);

      // Apply limit
      return stateInfos.slice(0, limit);
    } catch (error) {
      console.error('Error getting workspace states:', error);
      return [];
    }
  }

  /**
   * Get active states only
   */
  async getActiveStates(workspaceId: string): Promise<StateInfo[]> {
    return this.getWorkspaceStates(workspaceId, {
      includeInactive: false,
      sortBy: 'lastAccessed',
      sortOrder: 'desc'
    });
  }

  /**
   * Get states by hierarchy type
   */
  async getStatesByHierarchy(
    workspaceId: string,
    hierarchyType: string,
    limit: number = 10
  ): Promise<StateInfo[]> {
    return this.getWorkspaceStates(workspaceId, {
      hierarchyType,
      limit,
      sortBy: 'lastAccessed',
      sortOrder: 'desc'
    });
  }

  /**
   * Get recent states
   */
  async getRecentStates(
    workspaceId: string,
    timeRangeMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days
  ): Promise<StateInfo[]> {
    const cutoffTime = Date.now() - timeRangeMs;
    
    const allStates = await this.getWorkspaceStates(workspaceId, {
      includeInactive: true,
      sortBy: 'lastAccessed',
      sortOrder: 'desc',
      limit: 50
    });

    return allStates.filter(state => state.lastAccessed >= cutoffTime);
  }

  /**
   * Get state statistics
   */
  async getStateStatistics(workspaceId: string): Promise<{
    totalStates: number;
    activeStates: number;
    byHierarchy: Record<string, number>;
    completionRates: Record<string, number>;
    averageMemoryTraces: number;
    mostRecentAccess?: number;
  }> {
    try {
      const states = await this.getWorkspaceStates(workspaceId, {
        includeInactive: true,
        limit: 100
      });

      const stats = {
        totalStates: states.length,
        activeStates: states.filter(s => s.status === 'active').length,
        byHierarchy: {} as Record<string, number>,
        completionRates: {} as Record<string, number>,
        averageMemoryTraces: 0,
        mostRecentAccess: states.length > 0 ? Math.max(...states.map(s => s.lastAccessed)) : undefined
      };

      // Calculate hierarchy distribution
      for (const state of states) {
        stats.byHierarchy[state.hierarchyType] = (stats.byHierarchy[state.hierarchyType] || 0) + 1;
      }

      // Calculate completion rates by hierarchy
      for (const hierarchyType of Object.keys(stats.byHierarchy)) {
        const hierarchyStates = states.filter(s => s.hierarchyType === hierarchyType);
        const completedStates = hierarchyStates.filter(s => {
          if (!s.completionStatus) return false;
          const entries = Object.entries(s.completionStatus);
          return entries.length > 0 && entries.every(([_, completed]) => completed);
        });
        stats.completionRates[hierarchyType] = hierarchyStates.length > 0 
          ? (completedStates.length / hierarchyStates.length) * 100 
          : 0;
      }

      // Calculate average memory traces
      const totalMemoryTraces = states.reduce((sum, s) => sum + (s.memoryTraceCount || 0), 0);
      stats.averageMemoryTraces = states.length > 0 ? totalMemoryTraces / states.length : 0;

      return stats;
    } catch (error) {
      console.error('Error calculating state statistics:', error);
      return {
        totalStates: 0,
        activeStates: 0,
        byHierarchy: {},
        completionRates: {},
        averageMemoryTraces: 0
      };
    }
  }

  /**
   * Get state summary text
   */
  async getStateSummary(workspaceId: string): Promise<string> {
    try {
      const stats = await this.getStateStatistics(workspaceId);
      const recentStates = await this.getRecentStates(workspaceId);

      let summary = `## Workspace States\n\n`;
      
      if (stats.totalStates === 0) {
        summary += `No states found for this workspace.\n`;
        return summary;
      }

      summary += `**Total States**: ${stats.totalStates}\n`;
      summary += `**Active States**: ${stats.activeStates}\n`;
      summary += `**Average Memory Traces**: ${stats.averageMemoryTraces.toFixed(1)}\n`;

      if (stats.mostRecentAccess) {
        summary += `**Most Recent Access**: ${new Date(stats.mostRecentAccess).toLocaleString()}\n`;
      }

      // Add hierarchy breakdown
      if (Object.keys(stats.byHierarchy).length > 0) {
        summary += `\n### By Hierarchy Type\n`;
        for (const [hierarchyType, count] of Object.entries(stats.byHierarchy)) {
          const completionRate = stats.completionRates[hierarchyType] || 0;
          summary += `- **${hierarchyType}**: ${count} states (${completionRate.toFixed(1)}% completion)\n`;
        }
      }

      // Add recent states
      if (recentStates.length > 0) {
        summary += `\n### Recent States (${recentStates.length})\n`;
        for (const state of recentStates.slice(0, 5)) {
          const statusIcon = state.status === 'active' ? '🟢' : state.status === 'completed' ? '✅' : '🔴';
          const hierarchyBadge = state.hierarchyType.charAt(0).toUpperCase() + state.hierarchyType.slice(1);
          summary += `- ${statusIcon} **${state.name}** (${hierarchyBadge})`;
          if (state.memoryTraceCount && state.memoryTraceCount > 0) {
            summary += ` - ${state.memoryTraceCount} traces`;
          }
          summary += `\n`;
          summary += `  Last accessed: ${new Date(state.lastAccessed).toLocaleString()}\n`;
          if (state.description) {
            summary += `  ${state.description}\n`;
          }
        }
      }

      return summary;
    } catch (error) {
      console.error('Error generating state summary:', error);
      return `Error generating state summary: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Get state details by ID
   */
  async getStateDetails(stateId: string): Promise<StateInfo | null> {
    try {
      // Get all snapshots and find the one with matching ID
      const allSnapshots = await this.memoryService.getSnapshots();
      const state = allSnapshots.find((s: any) => s.id === stateId);
      
      if (!state) {
        return null;
      }

      return {
        id: state.id,
        name: state.name,
        description: state.description,
        created: state.timestamp,
        lastAccessed: state.timestamp,
        hierarchyType: state.state?.workspace?.hierarchyType || 'workspace',
        parentId: state.state?.workspace?.parentId,
        completionStatus: state.state?.workspace?.completionStatus,
        status: state.state?.workspace?.status,
        memoryTraceCount: state.state?.recentTraces?.length || 0
      };
    } catch (error) {
      console.error(`Error getting state details for ${stateId}:`, error);
      return null;
    }
  }

  /**
   * Get states in a hierarchy tree
   */
  async getStateHierarchy(workspaceId: string): Promise<StateInfo[]> {
    const allStates = await this.getWorkspaceStates(workspaceId, {
      includeInactive: true,
      limit: 100
    });

    // Build hierarchy tree (simplified - return top-level states)
    return allStates.filter(state => !state.parentId);
  }

  /**
   * Sort states by specified criteria
   */
  private sortStates(
    states: StateInfo[],
    sortBy: 'created' | 'lastAccessed' | 'name',
    sortOrder: 'asc' | 'desc'
  ): void {
    states.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'created':
          comparison = a.created - b.created;
          break;
        case 'lastAccessed':
          comparison = a.lastAccessed - b.lastAccessed;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }
}