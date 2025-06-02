import { BaseHandler } from '../base/BaseHandler';

/**
 * Handler for prompt-related operations
 * 
 * This handler manages prompt operations. Currently returns an empty
 * list as prompts are not yet implemented in the plugin.
 */
export class PromptHandler extends BaseHandler {
    /**
     * Handle prompts listing request
     * 
     * @returns Promise resolving to an object containing the prompts list
     */
    async handlePromptsList(): Promise<{ prompts: any[] }> {
        try {
            return { prompts: [] };
        } catch (error) {
            this.handleError(error, 'Prompts List');
        }
    }
}