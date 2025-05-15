import { EventTypes, ToolDefinition as CoreToolDefinition, BaseToolParams, BaseToolResult } from "../core/types";

/**
 * Extends the core ToolDefinition for MCP-specific context if needed.
 * Currently, it's identical but provides a specific type alias.
 */
export type MCPToolDefinition<P = BaseToolParams, R = BaseToolResult> = CoreToolDefinition<P, R>;

/**
 * Defines the structure for an MCP resource definition.
 * Resources represent data sources accessible via MCP.
 */
export interface MCPResourceDefinition {
  uri: string; // Unique URI identifying the resource
  description: string;
  // Add schema or access methods if needed
  // getSchema?(): any;
  // accessHandler?(params: any): Promise<any>;
}

/**
 * Represents an error specific to MCP operations.
 */
export class MCPError extends Error {
  public code?: number | string;
  public data?: any;
  public toolName?: string;
  public params?: any;

  constructor(message: string, toolName?: string, params?: any, code?: number | string, data?: any) {
    super(message);
    this.name = "MCPError";
    this.code = code;
    this.data = data;
    this.toolName = toolName;
    this.params = params;
    // Ensure the prototype chain is correct
    Object.setPrototypeOf(this, MCPError.prototype);
  }
}

/**
 * Represents a security-related error during MCP operations.
 */
export class MCPSecurityError extends MCPError {
  public agentId?: string; // Or relevant identifier
  public operation?: string; // e.g., tool name, resource URI

  constructor(message: string, agentId?: string, operation?: string, code?: string | number, data?: any) {
    super(message, undefined, undefined, code || 'security_error', data);
    this.name = "MCPSecurityError";
    this.agentId = agentId;
    this.operation = operation;
    Object.setPrototypeOf(this, MCPSecurityError.prototype);
  }
}


/**
 * Defines the specific event types related to MCP operations.
 * Extends the base EventTypes.
 */
export interface MCPEventTypes extends EventTypes {
  // BCP Loading Events
  'mcp:bcp.loading': { domain: string };
  'mcp:bcp.loaded': { domain: string; toolCount: number };
  'mcp:bcp.unloading': { domain: string };
  'mcp:bcp.unloaded': { domain: string };
  'mcp:bcp.error': { domain?: string; error: Error }; // Error during loading/unloading

  // Tool Registry Events (emitted by MCPClient/BCPLoader)
  'mcp:tool.registered': { name: string; definition: MCPToolDefinition }; // Fully qualified name
  'mcp:tool.unregistered': { name: string }; // Fully qualified name
  'mcp:tools.list.changed': void; // Indicates client should refresh tool list

  // Tool Execution Events
  'mcp:tool.executing': { name: string; params: BaseToolParams }; // Fully qualified name
  'mcp:tool.executed': { name: string; params: BaseToolParams; result: BaseToolResult }; // Fully qualified name
  'mcp:tool.error': { name: string; params: BaseToolParams; error: MCPError }; // Fully qualified name

  // Resource Events (if resources are implemented)
  'mcp:resource.registered': { definition: MCPResourceDefinition };
  'mcp:resource.unregistered': { uri: string };
  'mcp:resource.accessed': { uri: string; params?: any; result: any };
  'mcp:resource.error': { uri: string; params?: any; error: Error };

  // Streaming Events (can overlap with chat events, but useful here too)
  'mcp:stream.token': { streamId: string; toolName: string; token: string };
  'mcp:stream.complete': { streamId: string; toolName: string };
  'mcp:stream.error': { streamId: string; toolName: string; error: MCPError };

  // Security Events
  'mcp:security.access.attempt': { type: 'tool' | 'resource'; name: string; params?: any; agentId?: string };
  'mcp:security.access.granted': { type: 'tool' | 'resource'; name: string; agentId?: string };
  'mcp:security.access.denied': { type: 'tool' | 'resource'; name: string; reason: string; agentId?: string };
}
