/**
 * Utility functions for vault-related operations
 * This module provides functions for working with vault names and identifiers
 */

/**
 * Sanitizes a vault name for use in identifiers, filenames, and configuration keys
 * 
 * This function standardizes vault names by:
 * - Converting to lowercase
 * - Removing special characters (keeping only alphanumeric, spaces, and hyphens)
 * - Replacing spaces with hyphens
 * - Normalizing multiple consecutive hyphens to a single hyphen
 * 
 * @param vaultName - The original vault name to sanitize
 * @returns A sanitized version of the vault name suitable for use in identifiers
 * @throws Error if the input is null, undefined, or not a string
 * 
 * @example
 * // Returns "my-vault-name"
 * sanitizeVaultName("My Vault Name!");
 * 
 * @example
 * // Returns "test-vault-123"
 * sanitizeVaultName("Test Vault 123 @#$%");
 */
export function sanitizeVaultName(vaultName: string): string {
    // Input validation
    if (vaultName === null || vaultName === undefined) {
        throw new Error('Vault name cannot be null or undefined');
    }
    
    if (typeof vaultName !== 'string') {
        throw new Error(`Expected vault name to be a string, got ${typeof vaultName}`);
    }
    
    // Sanitize the vault name
    return vaultName
        .toLowerCase()           // Convert to lowercase
        .replace(/[^\w\s-]/g, '') // Remove special characters (keep alphanumeric, spaces, hyphens)
        .replace(/\s+/g, '-')     // Replace spaces with hyphens
        .replace(/-+/g, '-');     // Replace multiple consecutive hyphens with a single one
}

/**
 * Builds a vault-specific tool name by appending the vault identifier
 * 
 * @param agentName - The base agent name
 * @param vaultName - The vault name to append
 * @returns Vault-specific tool name
 */
export function buildVaultToolName(agentName: string, vaultName: string): string {
    const sanitizedVaultName = sanitizeVaultName(vaultName);
    return `${agentName}_${sanitizedVaultName}`;
}

/**
 * Extracts the base agent name from a vault-specific tool name
 * 
 * @param fullToolName - Full tool name that may include vault suffix
 * @returns Base agent name
 */
export function extractAgentName(fullToolName: string): string {
    // Split on the last underscore to handle vault names with underscores
    const parts = fullToolName.split('_');
    if (parts.length <= 1) {
        return fullToolName; // No vault suffix
    }
    
    // Return all parts except the last one (which should be the vault name)
    return parts.slice(0, -1).join('_');
}