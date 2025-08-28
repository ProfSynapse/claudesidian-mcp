/**
 * MCP Configuration Manager - Unified MCP configuration across providers
 * Manages MCP server URL, tool availability, and provider-specific configurations
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';

export interface MCPServerConfig {
  /** Server URL (HTTP/HTTPS endpoint) */
  url: string;
  
  /** Server display label */
  label: string;
  
  /** Server description */
  description?: string;
  
  /** Whether server is enabled */
  enabled: boolean;
  
  /** Authentication token if required */
  authToken?: string;
  
  /** Allowed tools (empty = all allowed) */
  allowedTools?: string[];
  
  /** Require approval for tool calls */
  requireApproval: 'always' | 'never' | { never: { tool_names: string[] } };
}

export interface ProviderMCPConfig {
  /** Whether this provider supports MCP */
  supported: boolean;
  
  /** Whether MCP is enabled for this provider */
  enabled: boolean;
  
  /** Provider-specific MCP configuration */
  config?: Record<string, any>;
}

export interface MCPConfiguration {
  /** Local MCP server configuration */
  server: MCPServerConfig;
  
  /** Per-provider MCP settings */
  providers: Record<string, ProviderMCPConfig>;
  
  /** Global MCP settings */
  global: {
    /** Default tool approval setting */
    defaultApproval: 'always' | 'never';
    
    /** Enable MCP logging */
    enableLogging: boolean;
    
    /** Maximum concurrent MCP connections */
    maxConnections: number;
  };
}

export class MCPConfigurationManager extends EventEmitter {
  private config: MCPConfiguration;
  private serverUrl: string | null = null;
  
  constructor() {
    super();
    
    // Initialize with default configuration
    this.config = this.getDefaultConfiguration();
  }

  /**
   * Initialize with server URL from running MCP server
   */
  initialize(serverUrl: string): void {
    this.serverUrl = serverUrl;
    
    // Update server configuration
    this.config.server.url = serverUrl;
    this.config.server.enabled = true;
    
    logger.systemLog(`[MCP Config] Initialized with server URL: ${serverUrl}`);
    this.emit('configUpdated', this.config);
  }

  /**
   * Get current MCP configuration
   */
  getConfiguration(): MCPConfiguration {
    return { ...this.config };
  }

  /**
   * Get server configuration for a specific provider
   */
  getProviderConfig(providerId: string): ProviderMCPConfig | null {
    return this.config.providers[providerId] || null;
  }

  /**
   * Enable/disable MCP for a specific provider
   */
  setProviderEnabled(providerId: string, enabled: boolean): void {
    if (!this.config.providers[providerId]) {
      this.config.providers[providerId] = {
        supported: true,
        enabled: false
      };
    }
    
    this.config.providers[providerId].enabled = enabled;
    
    logger.systemLog(`[MCP Config] ${providerId} MCP ${enabled ? 'enabled' : 'disabled'}`);
    this.emit('providerConfigChanged', providerId, this.config.providers[providerId]);
  }

  /**
   * Update provider MCP support status
   */
  setProviderSupported(providerId: string, supported: boolean): void {
    if (!this.config.providers[providerId]) {
      this.config.providers[providerId] = {
        supported,
        enabled: false
      };
    } else {
      this.config.providers[providerId].supported = supported;
      
      // Disable if no longer supported
      if (!supported) {
        this.config.providers[providerId].enabled = false;
      }
    }
    
    logger.systemLog(`[MCP Config] ${providerId} MCP support: ${supported}`);
    this.emit('providerConfigChanged', providerId, this.config.providers[providerId]);
  }

  /**
   * Update server configuration
   */
  updateServerConfig(updates: Partial<MCPServerConfig>): void {
    this.config.server = { ...this.config.server, ...updates };
    
    logger.systemLog(`[MCP Config] Server config updated`);
    this.emit('serverConfigChanged', this.config.server);
  }

  /**
   * Get server URL for provider integrations
   */
  getServerUrl(): string | null {
    return this.config.server.enabled ? this.config.server.url : null;
  }

  /**
   * Get server configuration for provider MCP tools
   */
  getServerConfigForProvider(providerId: string): MCPServerConfig | null {
    const providerConfig = this.config.providers[providerId];
    
    if (!providerConfig || !providerConfig.enabled || !this.config.server.enabled) {
      return null;
    }
    
    return this.config.server;
  }

  /**
   * Check if MCP is available for a provider
   */
  isProviderMCPAvailable(providerId: string): boolean {
    const providerConfig = this.config.providers[providerId];
    return !!(
      providerConfig?.supported &&
      providerConfig?.enabled &&
      this.config.server.enabled &&
      this.serverUrl
    );
  }

  /**
   * Get available tools for a provider
   */
  getAvailableToolsForProvider(providerId: string): string[] | null {
    if (!this.isProviderMCPAvailable(providerId)) {
      return null;
    }
    
    // Return allowed tools list, or null for all tools
    return this.config.server.allowedTools || null;
  }

  /**
   * Update global MCP settings
   */
  updateGlobalConfig(updates: Partial<MCPConfiguration['global']>): void {
    this.config.global = { ...this.config.global, ...updates };
    
    logger.systemLog(`[MCP Config] Global config updated`);
    this.emit('globalConfigChanged', this.config.global);
  }

  /**
   * Export configuration for persistence
   */
  exportConfig(): MCPConfiguration {
    return JSON.parse(JSON.stringify(this.config));
  }

  /**
   * Import configuration from persistence
   */
  importConfig(config: Partial<MCPConfiguration>): void {
    this.config = {
      ...this.getDefaultConfiguration(),
      ...config
    };
    
    logger.systemLog(`[MCP Config] Configuration imported`);
    this.emit('configUpdated', this.config);
  }

  /**
   * Get default MCP configuration
   */
  private getDefaultConfiguration(): MCPConfiguration {
    return {
      server: {
        url: 'http://localhost:3000/sse',
        label: 'Claudesidian',
        description: 'Local Claudesidian MCP server providing vault operations and AI agents',
        enabled: false,
        requireApproval: 'never'
      },
      providers: {
        openai: {
          supported: false, // Will be detected at runtime
          enabled: false
        },
        anthropic: {
          supported: false, // Will be detected at runtime  
          enabled: false
        },
        mistral: {
          supported: false,
          enabled: false
        },
        google: {
          supported: false,
          enabled: false
        }
      },
      global: {
        defaultApproval: 'never',
        enableLogging: true,
        maxConnections: 10
      }
    };
  }

  /**
   * Get configuration summary for debugging
   */
  getConfigSummary(): any {
    return {
      serverEnabled: this.config.server.enabled,
      serverUrl: this.config.server.url,
      providersEnabled: Object.entries(this.config.providers)
        .filter(([, config]) => config.enabled)
        .map(([id]) => id),
      providersSupported: Object.entries(this.config.providers)
        .filter(([, config]) => config.supported)
        .map(([id]) => id)
    };
  }
}