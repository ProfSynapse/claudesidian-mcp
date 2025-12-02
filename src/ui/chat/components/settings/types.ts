/**
 * Chat Settings Section Types
 *
 * Shared types and interfaces for the ChatSettingsModal section renderers.
 * Following SOLID principles - each section renderer handles a single responsibility.
 */

import { App } from 'obsidian';
import { WorkspaceService } from '../../../../services/WorkspaceService';
import { ModelAgentManager } from '../../services/ModelAgentManager';
import { ModelOption } from '../ModelSelector';
import { AgentOption } from '../AgentSelector';
import { WorkspaceMetadata } from '../../../../types/storage/StorageTypes';

/**
 * Thinking effort levels - unified interface across all providers
 */
export type ThinkingEffort = 'low' | 'medium' | 'high';

/**
 * Thinking settings state
 */
export interface ThinkingSettings {
  enabled: boolean;
  effort: ThinkingEffort;
}

/**
 * Interface for section renderers
 * Each section renderer handles a single settings section
 */
export interface ISectionRenderer {
  /**
   * Render the section into the container
   */
  render(container: HTMLElement): void;

  /**
   * Update the section (e.g., when model changes)
   */
  update?(): void;

  /**
   * Clean up resources when section is destroyed
   */
  destroy?(): void;
}

/**
 * Shared state for all section renderers
 */
export interface ChatSettingsState {
  selectedWorkspaceId: string | null;
  selectedModel: ModelOption | null;
  selectedAgent: AgentOption | null;
  contextNotes: string[];
  availableWorkspaces: WorkspaceMetadata[];
  availableModels: ModelOption[];
  availableAgents: AgentOption[];
  thinking: ThinkingSettings;
}

/**
 * Dependencies injected into section renderers
 */
export interface ChatSettingsDependencies {
  app: App;
  workspaceService: WorkspaceService;
  modelAgentManager: ModelAgentManager;
  conversationId: string | null;

  // Callbacks for cross-section communication
  onWorkspaceChange?: (workspaceId: string | null) => Promise<void>;
  onModelChange?: (model: ModelOption | null) => void;
  onAgentChange?: (agent: AgentOption | null) => void;
  onContextNotesChange?: (notes: string[]) => void;
  onThinkingChange?: (settings: ThinkingSettings) => void;
  onOpenNotePicker?: () => void;
}
