/**
 * Static recommendation definitions for AgentManager tools
 * Provides workspace-agent optimization suggestions through MCP responses
 */

import { Recommendation } from '../../utils/recommendationUtils';

export const AGENT_MANAGER_RECOMMENDATIONS: Record<string, Recommendation[]> = {
	// Execute and batch execute prompt recommendations
	executePrompt: [
		{
			type: "workspace_agent",
			message: "Consider updating your workspace agent based on this task, or create a specialized agent if none exists."
		},
		{
			type: "workflow_optimization",
			message: "If you frequently run similar prompts, consider creating a custom agent for this workspace."
		}
	],

	batchExecutePrompt: [
		{
			type: "workspace_agent",
			message: "Batch operations suggest routine workflows. Consider creating a workspace-specific agent to automate these patterns."
		},
		{
			type: "agent_efficiency",
			message: "If these batch operations are workspace-specific, bind an agent to this workspace for automatic context loading."
		}
	],

	// Prompt management recommendations
	createAgent: [
		{
			type: "workspace_binding",
			message: "Consider associating this new agent with your current workspace for automatic loading."
		},
		{
			type: "agent_organization",
			message: "Group related prompts by workspace to improve agent discoverability and context relevance."
		}
	],

	updateAgent: [
		{
			type: "workspace_sync",
			message: "If this agent is bound to a workspace, the changes will be automatically available when the workspace loads."
		},
		{
			type: "version_control",
			message: "Consider documenting significant agent changes in your workspace context for better collaboration."
		}
	],

	deleteAgent: [
		{
			type: "workspace_cleanup",
			message: "If this agent was bound to a workspace, you may want to update the workspace configuration."
		},
		{
			type: "agent_migration",
			message: "Consider whether workspace-bound functionality should be transferred to another agent."
		}
	],

	toggleAgent: [
		{
			type: "workspace_management",
			message: "Toggling agents on/off can help manage workspace-specific vs. global agent availability."
		}
	],

	// Discovery and browsing recommendations
	listAgents: [
		{
			type: "workspace_discovery",
			message: "Consider which of these agents would be most useful for your current workspace context."
		},
		{
			type: "agent_binding",
			message: "You can bind frequently used agents to specific workspaces for automatic loading."
		}
	],

	getAgent: [
		{
			type: "workspace_integration",
			message: "If this agent fits your current workspace workflow, consider binding it for automatic availability."
		},
		{
			type: "agent_context",
			message: "Review if this agent's capabilities align with your workspace's typical tasks and content."
		}
	],

	// Tool discovery recommendations
	listModels: [
		{
			type: "workspace_optimization",
			message: "Different models may be optimal for different workspace types. Consider workspace-specific model preferences."
		},
		{
			type: "agent_configuration",
			message: "Workspace-bound agents can specify preferred models for consistent behavior in specific contexts."
		}
	],

	// Image generation recommendations
	generateImage: [
		{
			type: "workspace_assets",
			message: "Consider organizing generated images within your workspace structure for better project coherence."
		},
		{
			type: "visual_workflow",
			message: "If image generation is common in this workspace, consider creating a specialized visual content agent."
		}
	]
};