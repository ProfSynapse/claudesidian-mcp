import { ConversationState, IConversationManager } from './interfaces/IConversationManager';

/**
 * Service for conversation state management
 * Implements IConversationManager interface
 */
export class ConversationManager implements IConversationManager {
    /**
     * Current conversation state
     */
    private state: ConversationState = {
        isActive: false
    };
    
    /**
     * Sets the conversation as active
     */
    setActive(): void {
        this.state.isActive = true;
    }
    
    /**
     * Resets the conversation state
     */
    resetState(): void {
        this.state = {
            isActive: false
        };
    }
    
    /**
     * Gets the current conversation state
     * @returns The conversation state
     */
    getState(): ConversationState {
        return this.state;
    }
}
