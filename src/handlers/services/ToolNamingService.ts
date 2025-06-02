import { App } from 'obsidian';
import { buildVaultToolName, extractAgentName } from '../../utils/vaultUtils';

/**
 * Service for handling vault-specific tool naming
 * 
 * This service encapsulates the logic for generating vault-specific tool names
 * and extracting agent names from tool names. It ensures consistent naming
 * across different vault instances.
 */
export class ToolNamingService {
    /**
     * Generate a vault-specific tool name
     * 
     * @param agentName - The base agent name
     * @param app - Optional Obsidian app instance for vault name extraction
     * @returns Vault-specific tool name or original name if app not provided
     */
    static generateVaultSpecificToolName(agentName: string, app?: App): string {
        if (!app) {
            return agentName;
        }
        
        try {
            const vaultName = app.vault.getName();
            return buildVaultToolName(agentName, vaultName);
        } catch (error) {
            console.warn('Failed to get vault name for tool naming:', error);
            return agentName;
        }
    }
    
    /**
     * Generate a vault-specific tool description
     * 
     * @param description - The base agent description
     * @param app - Optional Obsidian app instance for vault name extraction
     * @returns Vault-specific description or original description if app not provided
     */
    static generateVaultSpecificDescription(description: string, app?: App): string {
        if (!app) {
            return description;
        }
        
        try {
            const vaultName = app.vault.getName();
            return `${description} (Vault: ${vaultName})`;
        } catch (error) {
            console.warn('Failed to get vault name for tool description:', error);
            return description;
        }
    }
    
    /**
     * Extract the agent name from a vault-specific tool name
     * 
     * @param fullToolName - Full tool name that may include vault suffix
     * @returns Base agent name
     */
    static extractAgentNameFromTool(fullToolName: string): string {
        return extractAgentName(fullToolName);
    }
    
    /**
     * Safely get vault name from app
     * 
     * @param app - Optional Obsidian app instance
     * @returns Vault name or null if not available
     */
    static getVaultNameSafely(app?: App): string | null {
        if (!app) {
            return null;
        }
        
        try {
            return app.vault.getName();
        } catch (error) {
            console.warn('Failed to get vault name:', error);
            return null;
        }
    }
}