/**
 * Interface for conversation state
 */
export interface ConversationState {
    /**
     * Whether the conversation is active
     */
    isActive: boolean;
    
    /**
     * Additional state properties can be added here
     */
}

/**
 * Interface for conversation manager
 * Follows Single Responsibility Principle by focusing only on conversation state management
 */
export interface IConversationManager {
    /**
     * Sets the conversation as active
     */
    setActive(): void;
    
    /**
     * Resets the conversation state
     */
    resetState(): void;
    
    /**
     * Gets the current conversation state
     * @returns The conversation state
     */
    getState(): ConversationState;
}
