import { CardManager, CardItem } from '../CardManager';
import { WorkspaceService } from '../../agents/memoryManager/services/WorkspaceService';
import { ProjectWorkspace } from '../../database/workspace-types';
import { WorkspaceEditModal } from './WorkspaceEditModal';
import { Settings } from '../../settings';

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
  private settings: Settings;
  private containerEl: HTMLElement;

  constructor(
    containerEl: HTMLElement,
    workspaceService: WorkspaceService,
    settings: Settings
  ) {
    this.containerEl = containerEl;
    this.workspaceService = workspaceService;
    this.settings = settings;

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
      let workspaces = await this.workspaceService.getAllWorkspaces();

      // Consolidate multiple root workspaces into one
      workspaces = this.consolidateRootWorkspaces(workspaces);

      const cardItems = workspaces.map(workspace => this.workspaceToCardItem(workspace));
      this.cardManager.updateItems(cardItems);
    } catch (error) {
      console.error('Error loading workspaces:', error);
    }
  }

  /**
   * Consolidate multiple root workspaces into a single default workspace
   */
  private consolidateRootWorkspaces(workspaces: ProjectWorkspace[]): ProjectWorkspace[] {
    const rootWorkspaces = workspaces.filter(w =>
      !w.rootFolder || w.rootFolder === '/' || w.rootFolder === ''
    );
    const nonRootWorkspaces = workspaces.filter(w =>
      w.rootFolder && w.rootFolder !== '/' && w.rootFolder !== ''
    );

    if (rootWorkspaces.length <= 1) {
      return workspaces; // No consolidation needed
    }

    // Find the most recent or preferred root workspace
    let primaryRoot = rootWorkspaces.find(w =>
      w.name === 'Plugin Testing Workspace' ||
      w.name === 'Comprehensive Tool Testing Workspace' ||
      !w.name.startsWith('Workspace ')
    );

    if (!primaryRoot) {
      // Use the most recently accessed one
      primaryRoot = rootWorkspaces.reduce((latest, current) =>
        current.lastAccessed > latest.lastAccessed ? current : latest
      );
    }

    // Mark the primary root as the default
    const consolidatedRoot: ProjectWorkspace = {
      ...primaryRoot,
      name: primaryRoot.name.startsWith('Workspace ') ? 'Default Workspace' : primaryRoot.name,
      description: primaryRoot.description || 'Default workspace for vault root',
      rootFolder: '/'
    };

    return [consolidatedRoot, ...nonRootWorkspaces];
  }

  /**
   * Convert ProjectWorkspace to WorkspaceCardItem
   */
  private workspaceToCardItem(workspace: ProjectWorkspace): WorkspaceCardItem {
    return {
      id: workspace.id,
      name: this.generateWorkspaceName(workspace),
      description: this.generateCardDescription(workspace),
      isEnabled: workspace.isActive ?? true,
      rootFolder: workspace.rootFolder,
      created: workspace.created,
      lastAccessed: workspace.lastAccessed,
      purpose: workspace.context?.purpose,
      currentGoal: workspace.context?.currentGoal,
      status: (workspace.context as any)?.status, // Legacy field for backward compatibility
      workspace: workspace
    };
  }

  /**
   * Generate a user-friendly workspace name based on folder
   */
  private generateWorkspaceName(workspace: ProjectWorkspace): string {
    // If there's a custom name that's not the generic pattern, use it
    if (workspace.name &&
        !workspace.name.startsWith('Workspace ') &&
        workspace.name !== 'workspace' &&
        workspace.name !== 'default-workspace') {
      return workspace.name;
    }

    // Use folder-based naming
    if (!workspace.rootFolder || workspace.rootFolder === '/' || workspace.rootFolder === '') {
      return 'Default (Root)';
    }

    // Extract the folder name from the path
    const folderName = workspace.rootFolder.split('/').filter(part => part).pop() || 'Root';
    return folderName;
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
      if ((workspace.context as any).status) {
        parts.push(`Status: ${(workspace.context as any).status}`);
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
      this.settings,
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
      this.settings,
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