import { CardManager, CardItem } from '../CardManager';
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { ProjectWorkspace } from '../../database/workspace-types';
import { WorkspaceEditModal } from './WorkspaceEditModal';

/**
 * Workspace-specific card item interface
 * Extends CardItem to work with CardManager pattern
 */
export interface WorkspaceCardItem extends CardItem {
  id: string;
  name: string;
  description: string;
  isEnabled: boolean;

  // Core workspace fields
  rootFolder: string;
  created: number;
  lastAccessed: number;

  // Rich context fields
  purpose?: string;
  currentGoal?: string;
  status?: string;

  // Full workspace reference for editing
  workspace: ProjectWorkspace;
}

/**
 * Workspace card manager using DRY pattern from existing Card/CardManager
 */
export class WorkspaceCardManager {
  private cardManager: CardManager<WorkspaceCardItem>;
  private workspaceService: WorkspaceService;
  private containerEl: HTMLElement;

  constructor(
    containerEl: HTMLElement,
    workspaceService: WorkspaceService
  ) {
    this.containerEl = containerEl;
    this.workspaceService = workspaceService;

    this.cardManager = new CardManager<WorkspaceCardItem>({
      containerEl: containerEl,
      title: 'Workspace Management',
      addButtonText: 'Add Workspace',
      emptyStateText: 'No workspaces found. Create your first workspace to get started.',
      items: [],
      onAdd: () => this.handleAddWorkspace(),
      onToggle: (item, enabled) => this.handleToggleWorkspace(item, enabled),
      onEdit: (item) => this.handleEditWorkspace(item),
      onDelete: (item) => this.handleDeleteWorkspace(item),
      showToggle: true,
      showAddButton: true
    });
  }

  /**
   * Load and display workspaces
   */
  async refreshWorkspaces(): Promise<void> {
    try {
      const workspaces = await this.workspaceService.getAllWorkspaces();
      const cardItems = workspaces.map(workspace => this.workspaceToCardItem(workspace));
      this.cardManager.updateItems(cardItems);
    } catch (error) {
      console.error('Error loading workspaces:', error);
    }
  }

  /**
   * Convert ProjectWorkspace to WorkspaceCardItem
   */
  private workspaceToCardItem(workspace: ProjectWorkspace): WorkspaceCardItem {
    return {
      id: workspace.id,
      name: workspace.name,
      description: this.generateCardDescription(workspace),
      isEnabled: workspace.isActive ?? true,
      rootFolder: workspace.rootFolder,
      created: workspace.created,
      lastAccessed: workspace.lastAccessed,
      purpose: workspace.context?.purpose,
      currentGoal: workspace.context?.currentGoal,
      status: workspace.context?.status,
      workspace: workspace
    };
  }

  /**
   * Generate a meaningful description for the card
   */
  private generateCardDescription(workspace: ProjectWorkspace): string {
    if (workspace.description) {
      return workspace.description;
    }

    if (workspace.context?.purpose) {
      const parts = [workspace.context.purpose];
      if (workspace.context.currentGoal) {
        parts.push(`Goal: ${workspace.context.currentGoal}`);
      }
      if (workspace.context.status) {
        parts.push(`Status: ${workspace.context.status}`);
      }
      return parts.join(' • ');
    }

    return `Workspace in ${workspace.rootFolder}`;
  }

  /**
   * Handle add workspace button click
   */
  private async handleAddWorkspace(): Promise<void> {
    const modal = new WorkspaceEditModal(
      this.containerEl.ownerDocument.defaultView!.app,
      this.workspaceService,
      'create',
      undefined,
      () => this.refreshWorkspaces()
    );
    modal.open();
  }

  /**
   * Handle workspace enable/disable toggle
   */
  private async handleToggleWorkspace(item: WorkspaceCardItem, enabled: boolean): Promise<void> {
    try {
      await this.workspaceService.updateWorkspace(item.id, { isActive: enabled });
      await this.refreshWorkspaces();
    } catch (error) {
      console.error('Error toggling workspace:', error);
    }
  }

  /**
   * Handle edit workspace button click
   */
  private async handleEditWorkspace(item: WorkspaceCardItem): Promise<void> {
    const modal = new WorkspaceEditModal(
      this.containerEl.ownerDocument.defaultView!.app,
      this.workspaceService,
      'edit',
      item.workspace,
      () => this.refreshWorkspaces()
    );
    modal.open();
  }

  /**
   * Handle delete workspace button click
   */
  private async handleDeleteWorkspace(item: WorkspaceCardItem): Promise<void> {
    const confirmed = confirm(`Are you sure you want to delete workspace "${item.name}"? This action cannot be undone.`);

    if (confirmed) {
      try {
        await this.workspaceService.deleteWorkspace(item.id);
        await this.refreshWorkspaces();
      } catch (error) {
        console.error('Error deleting workspace:', error);
      }
    }
  }

  /**
   * Initial display
   */
  async display(): Promise<void> {
    await this.refreshWorkspaces();
  }
}