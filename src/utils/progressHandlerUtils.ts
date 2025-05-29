import { PluginContext } from '../types';

/**
 * Get the namespaced key for progress handlers
 * @param pluginContext Optional plugin context for namespacing
 * @returns The key to use for window progress handlers
 */
export function getProgressHandlerKey(pluginContext?: PluginContext): string {
    if (pluginContext) {
        return `mcpProgressHandlers_${pluginContext.vaultId}_${pluginContext.pluginId}`;
    }
    return 'mcpProgressHandlers';
}

/**
 * Get progress handlers from window object
 * @param pluginContext Optional plugin context for namespacing
 * @returns Progress handlers object or undefined
 */
export function getProgressHandlers(pluginContext?: PluginContext): any {
    const key = getProgressHandlerKey(pluginContext);
    return (window as any)[key];
}

/**
 * Call update progress handler if available
 * @param data Progress update data
 * @param pluginContext Optional plugin context for namespacing
 */
export function updateProgress(data: {
    processed: number;
    total: number;
    remaining: number;
    operationId?: string;
}, pluginContext?: PluginContext): void {
    const handlers = getProgressHandlers(pluginContext);
    if (handlers?.updateProgress) {
        handlers.updateProgress(data);
    }
}

/**
 * Call complete progress handler if available
 * @param data Progress completion data
 * @param pluginContext Optional plugin context for namespacing
 */
export function completeProgress(data: {
    success: boolean;
    processed: number;
    failed: number;
    error?: string;
    operationId: string;
}, pluginContext?: PluginContext): void {
    const handlers = getProgressHandlers(pluginContext);
    if (handlers?.completeProgress) {
        handlers.completeProgress(data);
    }
}

/**
 * Call cancel progress handler if available
 * @param data Progress cancellation data
 * @param pluginContext Optional plugin context for namespacing
 */
export function cancelProgress(data: {
    operationId: string;
}, pluginContext?: PluginContext): void {
    const handlers = getProgressHandlers(pluginContext);
    if (handlers?.cancelProgress) {
        handlers.cancelProgress(data);
    }
}