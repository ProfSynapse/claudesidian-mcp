// Main router
export { RequestRouter } from './RequestRouter';

// Interfaces
export type * from './interfaces/IRequestHandlerServices';

// Services
export { ValidationService } from './services/ValidationService';
export { SessionService } from './services/SessionService';
export { ToolExecutionService } from './services/ToolExecutionService';
export { HandoffProcessor } from './services/HandoffProcessor';
export { ResponseFormatter } from './services/ResponseFormatter';
export { ToolListService } from './services/ToolListService';

// Strategies
export type { IRequestStrategy } from './strategies/IRequestStrategy';
export { ToolExecutionStrategy } from './strategies/ToolExecutionStrategy';
export { ToolListStrategy } from './strategies/ToolListStrategy';

// Legacy handlers (for backwards compatibility during transition)
export {
    handleResourceList,
    handleResourceRead,
    handlePromptsList,
    handleToolHelp,
    handleToolExecution,
    handleToolList
} from './requestHandlers';