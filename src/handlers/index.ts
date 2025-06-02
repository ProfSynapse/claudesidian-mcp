/**
 * Main handlers module exports
 * 
 * This module exports all handler classes and maintains backward
 * compatibility with the existing requestHandlers.ts interface.
 */

// Handler classes
export { ToolHandler } from './tool/ToolHandler';
export { ToolExecutionHandler } from './tool/ToolExecutionHandler';
export { ResourceHandler } from './resource/ResourceHandler';
export { PromptHandler } from './prompt/PromptHandler';

// Services
export { ToolNamingService } from './services/ToolNamingService';
export { ValidationService } from './services/ValidationService';
export { SessionService } from './services/SessionService';
export { HandoffService } from './services/HandoffService';

// Base classes
export { BaseHandler } from './base/BaseHandler';
export { BaseToolHandler } from './base/BaseToolHandler';

// Backward compatibility functions
import { App } from 'obsidian';
import { IAgent } from '../agents/interfaces/IAgent';
import { SessionContextManager } from '../services/SessionContextManager';
import { ToolHandler } from './tool/ToolHandler';
import { ToolExecutionHandler } from './tool/ToolExecutionHandler';
import { ResourceHandler } from './resource/ResourceHandler';
import { PromptHandler } from './prompt/PromptHandler';

/**
 * Handle tool listing request (backward compatibility)
 */
export async function handleToolList(
    agents: Map<string, IAgent>,
    isVaultEnabled: boolean,
    app?: App
): Promise<{ tools: any[] }> {
    const handler = new ToolHandler();
    return await handler.handleToolList(agents, isVaultEnabled, app);
}

/**
 * Handle tool execution request (backward compatibility)
 */
export async function handleToolExecution(
    getAgent: (name: string) => IAgent,
    request: any,
    parsedArgs: any,
    sessionContextManager?: SessionContextManager
): Promise<any> {
    const handler = new ToolExecutionHandler(getAgent, sessionContextManager);
    return await handler.handleToolExecution(request, parsedArgs);
}

/**
 * Handle tool help request (backward compatibility)
 */
export async function handleToolHelp(
    getAgent: (name: string) => IAgent,
    request: any,
    parsedArgs: any
): Promise<{ content: { type: string, text: string }[] }> {
    const handler = new ToolHandler();
    return await handler.handleToolHelp(getAgent, request, parsedArgs);
}

/**
 * Handle resource listing request (backward compatibility)
 */
export async function handleResourceList(app: App): Promise<{ resources: any[] }> {
    const handler = new ResourceHandler(app);
    return await handler.handleResourceList();
}

/**
 * Handle resource reading request (backward compatibility)
 */
export async function handleResourceRead(app: App, request: any): Promise<{ contents: any[] }> {
    const handler = new ResourceHandler(app);
    return await handler.handleResourceRead(request);
}

/**
 * Handle prompts listing request (backward compatibility)
 */
export async function handlePromptsList(): Promise<{ prompts: any[] }> {
    const handler = new PromptHandler();
    return await handler.handlePromptsList();
}