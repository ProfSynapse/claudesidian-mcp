import { PluginContext } from '../types';

/**
 * Utility functions for handling storage with vault-specific namespacing
 */

/**
 * Get a namespaced storage key for vault isolation
 * @param key Base storage key
 * @param pluginContext Optional plugin context for namespacing
 * @returns Namespaced storage key
 */
export function getStorageKey(key: string, pluginContext?: PluginContext): string {
    if (pluginContext) {
        return `${key}_${pluginContext.vaultId}_${pluginContext.pluginId}`;
    }
    // Fall back to just the key if no context
    return key;
}

/**
 * Get a namespaced event name for vault isolation
 * @param eventName Base event name
 * @param pluginContext Optional plugin context for namespacing
 * @returns Namespaced event name
 */
export function getEventName(eventName: string, pluginContext?: PluginContext): string {
    if (pluginContext) {
        return `${eventName}_${pluginContext.vaultId}_${pluginContext.pluginId}`;
    }
    return eventName;
}

/**
 * Check if a storage key matches a namespaced pattern
 * @param key Storage key to check
 * @param baseKey Base key to match against
 * @param pluginContext Optional plugin context
 * @returns True if the key matches the pattern
 */
export function isMatchingStorageKey(key: string, baseKey: string, pluginContext?: PluginContext): boolean {
    if (!key) return false;
    
    if (pluginContext) {
        const expectedKey = getStorageKey(baseKey, pluginContext);
        return key === expectedKey;
    }
    
    // If no context, check if key starts with base key
    return key.startsWith(baseKey);
}

/**
 * Set a value in localStorage with vault-specific namespacing
 * @param key Storage key
 * @param value Value to store
 * @param pluginContext Optional plugin context
 */
export function setStorageValue(key: string, value: any, pluginContext?: PluginContext): void {
    const namespacedKey = getStorageKey(key, pluginContext);
    localStorage.setItem(namespacedKey, JSON.stringify(value));
}

/**
 * Get a value from localStorage with vault-specific namespacing
 * @param key Storage key
 * @param pluginContext Optional plugin context
 * @returns Parsed value or null if not found
 */
export function getStorageValue<T = any>(key: string, pluginContext?: PluginContext): T | null {
    const namespacedKey = getStorageKey(key, pluginContext);
    const value = localStorage.getItem(namespacedKey);
    if (value) {
        try {
            return JSON.parse(value);
        } catch {
            return value as any;
        }
    }
    return null;
}

/**
 * Remove a value from localStorage with vault-specific namespacing
 * @param key Storage key
 * @param pluginContext Optional plugin context
 */
export function removeStorageValue(key: string, pluginContext?: PluginContext): void {
    const namespacedKey = getStorageKey(key, pluginContext);
    localStorage.removeItem(namespacedKey);
}

/**
 * Dispatch a custom storage event with vault-specific namespacing
 * @param key Storage key
 * @param value Value that was stored
 * @param pluginContext Optional plugin context
 */
export function dispatchStorageEvent(key: string, value: any, pluginContext?: PluginContext): void {
    const namespacedKey = getStorageKey(key, pluginContext);
    if (typeof window !== 'undefined' && typeof StorageEvent === 'function') {
        window.dispatchEvent(new StorageEvent('storage', {
            key: namespacedKey,
            newValue: JSON.stringify(value),
            storageArea: localStorage
        }));
    }
}