/**
 * SessionCollector - Collects session data for workspace context
 * Follows Single Responsibility Principle by focusing only on session data collection
 */

import { MemoryService } from '../../../../../../database/services/MemoryService';

export interface SessionInfo {
  id: string;
  name: string;
  description?: string;
  startTime: number;
  endTime?: number;
  isActive: boolean;
  toolCalls: number;
  duration?: number;
}

export interface SessionCollectionOptions {
  limit?: number;
  includeInactive?: boolean;
  sortBy?: 'startTime' | 'endTime' | 'toolCalls' | 'name';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Service responsible for collecting session data for workspace context
 * Follows SRP by focusing only on session data collection and formatting
 */
export class SessionCollector {
  constructor(private memoryService: MemoryService) {}

  /**
   * Get workspace sessions
   */
  async getWorkspaceSessions(
    workspaceId: string,
    options: SessionCollectionOptions = {}
  ): Promise<SessionInfo[]> {
    const {
      limit = 10,
      includeInactive = true,
      sortBy = 'startTime',
      sortOrder = 'desc'
    } = options;

    try {
      // Get sessions from memory service
      const sessions = await this.memoryService.getSessions(workspaceId, !includeInactive);
      
      // Convert to SessionInfo format
      const sessionInfos: SessionInfo[] = sessions.map(session => ({
        id: session.id,
        name: session.name || 'Unnamed Session',
        description: session.description,
        startTime: session.startTime,
        endTime: session.endTime,
        isActive: session.isActive,
        toolCalls: session.toolCalls || 0,
        duration: this.calculateDuration(session.startTime, session.endTime)
      }));

      // Sort sessions
      this.sortSessions(sessionInfos, sortBy, sortOrder);

      // Apply limit
      return sessionInfos.slice(0, limit);
    } catch (error) {
      console.error('Error getting workspace sessions:', error);
      return [];
    }
  }

  /**
   * Get active sessions only
   */
  async getActiveSessions(workspaceId: string): Promise<SessionInfo[]> {
    return this.getWorkspaceSessions(workspaceId, {
      includeInactive: false,
      sortBy: 'startTime',
      sortOrder: 'desc'
    });
  }

  /**
   * Get recent sessions
   */
  async getRecentSessions(
    workspaceId: string,
    timeRangeMs: number = 7 * 24 * 60 * 60 * 1000 // 7 days
  ): Promise<SessionInfo[]> {
    const cutoffTime = Date.now() - timeRangeMs;
    
    const allSessions = await this.getWorkspaceSessions(workspaceId, {
      includeInactive: true,
      sortBy: 'startTime',
      sortOrder: 'desc',
      limit: 50
    });

    return allSessions.filter(session => session.startTime >= cutoffTime);
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(workspaceId: string): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalToolCalls: number;
    avgSessionDuration: number;
    longestSession: number;
    mostRecentSession?: number;
  }> {
    try {
      const sessions = await this.getWorkspaceSessions(workspaceId, {
        includeInactive: true,
        limit: 100
      });

      const stats = {
        totalSessions: sessions.length,
        activeSessions: sessions.filter(s => s.isActive).length,
        totalToolCalls: sessions.reduce((sum, s) => sum + s.toolCalls, 0),
        avgSessionDuration: 0,
        longestSession: 0,
        mostRecentSession: sessions.length > 0 ? sessions[0].startTime : undefined
      };

      // Calculate duration statistics
      const completedSessions = sessions.filter(s => s.duration !== undefined);
      if (completedSessions.length > 0) {
        const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0);
        stats.avgSessionDuration = totalDuration / completedSessions.length;
        stats.longestSession = Math.max(...completedSessions.map(s => s.duration || 0));
      }

      return stats;
    } catch (error) {
      console.error('Error calculating session statistics:', error);
      return {
        totalSessions: 0,
        activeSessions: 0,
        totalToolCalls: 0,
        avgSessionDuration: 0,
        longestSession: 0
      };
    }
  }

  /**
   * Get session summary text
   */
  async getSessionSummary(workspaceId: string): Promise<string> {
    try {
      const stats = await this.getSessionStatistics(workspaceId);
      const recentSessions = await this.getRecentSessions(workspaceId);

      let summary = `## Session Activity\n\n`;
      
      if (stats.totalSessions === 0) {
        summary += `No sessions found for this workspace.\n`;
        return summary;
      }

      summary += `**Total Sessions**: ${stats.totalSessions}\n`;
      summary += `**Active Sessions**: ${stats.activeSessions}\n`;
      summary += `**Total Tool Calls**: ${stats.totalToolCalls}\n`;

      if (stats.avgSessionDuration > 0) {
        summary += `**Average Session Duration**: ${this.formatDuration(stats.avgSessionDuration)}\n`;
        summary += `**Longest Session**: ${this.formatDuration(stats.longestSession)}\n`;
      }

      if (stats.mostRecentSession) {
        summary += `**Most Recent Activity**: ${new Date(stats.mostRecentSession).toLocaleString()}\n`;
      }

      // Add recent sessions
      if (recentSessions.length > 0) {
        summary += `\n### Recent Sessions (${recentSessions.length})\n`;
        for (const session of recentSessions.slice(0, 5)) {
          const statusIcon = session.isActive ? '🟢' : '🔴';
          const durationText = session.duration ? ` (${this.formatDuration(session.duration)})` : '';
          summary += `- ${statusIcon} **${session.name}** - ${session.toolCalls} tool calls${durationText}\n`;
          summary += `  Started: ${new Date(session.startTime).toLocaleString()}\n`;
          if (session.description) {
            summary += `  ${session.description}\n`;
          }
        }
      }

      return summary;
    } catch (error) {
      console.error('Error generating session summary:', error);
      return `Error generating session summary: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Calculate session duration
   */
  private calculateDuration(startTime: number, endTime?: number): number | undefined {
    if (!endTime) {
      return undefined;
    }
    return endTime - startTime;
  }

  /**
   * Sort sessions by specified criteria
   */
  private sortSessions(
    sessions: SessionInfo[],
    sortBy: 'startTime' | 'endTime' | 'toolCalls' | 'name',
    sortOrder: 'asc' | 'desc'
  ): void {
    sessions.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'startTime':
          comparison = a.startTime - b.startTime;
          break;
        case 'endTime':
          comparison = (a.endTime || 0) - (b.endTime || 0);
          break;
        case 'toolCalls':
          comparison = a.toolCalls - b.toolCalls;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  /**
   * Format duration for display
   */
  private formatDuration(durationMs: number): string {
    if (durationMs < 60000) { // Less than 1 minute
      return `${Math.round(durationMs / 1000)}s`;
    } else if (durationMs < 3600000) { // Less than 1 hour
      return `${Math.round(durationMs / 60000)}m`;
    } else if (durationMs < 86400000) { // Less than 1 day
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.round((durationMs % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    } else {
      const days = Math.floor(durationMs / 86400000);
      const hours = Math.round((durationMs % 86400000) / 3600000);
      return `${days}d ${hours}h`;
    }
  }

  /**
   * Get session details by ID
   */
  async getSessionDetails(sessionId: string): Promise<SessionInfo | null> {
    try {
      const session = await this.memoryService.getSession(sessionId);
      
      if (!session) {
        return null;
      }

      return {
        id: session.id,
        name: session.name || 'Unnamed Session',
        description: session.description,
        startTime: session.startTime,
        endTime: session.endTime,
        isActive: session.isActive,
        toolCalls: session.toolCalls || 0,
        duration: this.calculateDuration(session.startTime, session.endTime)
      };
    } catch (error) {
      console.error(`Error getting session details for ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * Get sessions within a time range
   */
  async getSessionsInRange(
    workspaceId: string,
    startTime: number,
    endTime: number
  ): Promise<SessionInfo[]> {
    const allSessions = await this.getWorkspaceSessions(workspaceId, {
      includeInactive: true,
      limit: 100
    });

    return allSessions.filter(session => {
      return session.startTime >= startTime && session.startTime <= endTime;
    });
  }
}