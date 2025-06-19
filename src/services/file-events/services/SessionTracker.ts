import { ISessionTracker } from '../interfaces/IFileEventServices';

export class SessionTracker implements ISessionTracker {
    private activeSessions: Record<string, string> = {}; // workspaceId -> sessionId

    setActiveSession(workspaceId: string, sessionId: string): void {
        this.activeSessions[workspaceId] = sessionId;
    }

    getActiveSession(workspaceId: string): string | undefined {
        return this.activeSessions[workspaceId];
    }

    removeSession(workspaceId: string): void {
        delete this.activeSessions[workspaceId];
    }

    getActiveSessions(): Record<string, string> {
        return { ...this.activeSessions };
    }

    // Utility methods
    hasActiveSession(workspaceId: string): boolean {
        return workspaceId in this.activeSessions;
    }

    getActiveWorkspaces(): string[] {
        return Object.keys(this.activeSessions);
    }

    getSessionCount(): number {
        return Object.keys(this.activeSessions).length;
    }

    clear(): void {
        this.activeSessions = {};
    }
}