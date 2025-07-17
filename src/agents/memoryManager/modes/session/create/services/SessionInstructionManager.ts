/**
 * SessionInstructionManager - Handles session instruction management
 * Follows Single Responsibility Principle by focusing only on session instruction operations
 */

import { MemoryManagerAgent } from '../../../../memoryManager';
import { formatSessionInstructions, enhanceContextWithSessionInstructions } from '../../../../../../utils/sessionUtils';

export interface SessionInstructionResult {
    finalContextString: string;
    shouldIncludeInstructions: boolean;
    sessionInstructions?: string;
}

/**
 * Service responsible for managing session instructions
 * Follows SRP by focusing only on session instruction operations
 */
export class SessionInstructionManager {
    constructor(private agent: MemoryManagerAgent) {}

    /**
     * Process session instructions for the result
     */
    processSessionInstructions(
        sessionId: string,
        contextString: string,
        sessionName: string
    ): SessionInstructionResult {
        // Get the session context manager
        const sessionManager = (this.agent.plugin as any).services?.sessionContextManager;
        
        // Prepare the base context string
        let finalContextString = contextString ? 
            `Created session with purpose: ${contextString}` :
            `Created session ${sessionName || new Date().toLocaleString()}`;

        // Check if instructions should be added
        const shouldAddInstructions = sessionManager && !sessionManager.hasReceivedInstructions(sessionId);
        
        if (shouldAddInstructions) {
            // Enhance context with session instructions
            finalContextString = enhanceContextWithSessionInstructions(sessionId, finalContextString);
            
            // Mark instructions as received
            sessionManager.markInstructionsReceived(sessionId);
        }

        // Determine if instructions should be included in result
        const shouldIncludeInstructions = !sessionManager || 
            (sessionManager.hasReceivedInstructions(sessionId) && 
             finalContextString.includes("[SESSION_ID:"));

        return {
            finalContextString,
            shouldIncludeInstructions,
            sessionInstructions: shouldIncludeInstructions ? formatSessionInstructions(sessionId) : undefined
        };
    }

    /**
     * Check if session has received instructions
     */
    hasReceivedInstructions(sessionId: string): boolean {
        const sessionManager = (this.agent.plugin as any).services?.sessionContextManager;
        return sessionManager?.hasReceivedInstructions(sessionId) || false;
    }

    /**
     * Mark instructions as received for a session
     */
    markInstructionsReceived(sessionId: string): void {
        const sessionManager = (this.agent.plugin as any).services?.sessionContextManager;
        if (sessionManager) {
            sessionManager.markInstructionsReceived(sessionId);
        }
    }

    /**
     * Get session context manager status
     */
    getSessionManagerStatus(): {
        hasSessionManager: boolean;
        canTrackInstructions: boolean;
    } {
        const sessionManager = (this.agent.plugin as any).services?.sessionContextManager;
        
        return {
            hasSessionManager: !!sessionManager,
            canTrackInstructions: !!(sessionManager && 
                typeof sessionManager.hasReceivedInstructions === 'function' &&
                typeof sessionManager.markInstructionsReceived === 'function')
        };
    }

    /**
     * Format session instructions for display
     */
    formatSessionInstructions(sessionId: string): string {
        return formatSessionInstructions(sessionId);
    }

    /**
     * Enhance context with session instructions
     */
    enhanceContextWithInstructions(sessionId: string, contextString: string): string {
        return enhanceContextWithSessionInstructions(sessionId, contextString);
    }

    /**
     * Validate session instruction parameters
     */
    validateSessionInstructionParameters(sessionId: string, contextString: string): {
        isValid: boolean;
        errors: string[];
        warnings: string[];
    } {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate session ID
        if (!sessionId || typeof sessionId !== 'string') {
            errors.push('Session ID must be a non-empty string');
        }

        // Validate context string
        if (contextString && typeof contextString !== 'string') {
            errors.push('Context string must be a string');
        }

        // Warnings
        if (!contextString) {
            warnings.push('No context string provided - instructions will use default format');
        }

        const sessionManagerStatus = this.getSessionManagerStatus();
        if (!sessionManagerStatus.hasSessionManager) {
            warnings.push('No session context manager available - instructions may not be tracked properly');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Get instruction statistics
     */
    getInstructionStatistics(sessionId: string): {
        sessionId: string;
        hasReceivedInstructions: boolean;
        hasSessionManager: boolean;
        instructionFormat: string;
    } {
        const sessionManagerStatus = this.getSessionManagerStatus();
        
        return {
            sessionId,
            hasReceivedInstructions: this.hasReceivedInstructions(sessionId),
            hasSessionManager: sessionManagerStatus.hasSessionManager,
            instructionFormat: sessionManagerStatus.canTrackInstructions ? 'enhanced' : 'basic'
        };
    }

    /**
     * Reset instruction tracking for a session
     */
    resetInstructionTracking(sessionId: string): void {
        const sessionManager = (this.agent.plugin as any).services?.sessionContextManager;
        if (sessionManager && typeof sessionManager.resetInstructionTracking === 'function') {
            sessionManager.resetInstructionTracking(sessionId);
        }
    }

    /**
     * Get default context string
     */
    getDefaultContextString(sessionName?: string): string {
        return `Created session ${sessionName || new Date().toLocaleString()}`;
    }

    /**
     * Build context string with purpose
     */
    buildContextStringWithPurpose(purpose: string): string {
        return `Created session with purpose: ${purpose}`;
    }
}