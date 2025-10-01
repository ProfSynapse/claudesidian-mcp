import { App } from 'obsidian';
import { CardManager, CardItem } from '../CardManager';
import { WorkspaceService } from '../../services/WorkspaceService';
import { IndividualWorkspace, WorkspaceMetadata } from '../../types/storage/StorageTypes';
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

  // Workspace ID for loading full data when needed
  workspaceId: string;
}

/**
 * Workspace card manager using DRY pattern from existing Card/CardManager
 */
export class WorkspaceCardManager {
  private cardManager: CardManager<WorkspaceCardItem>;
  private workspaceService: WorkspaceService;
  private settings: Settings;
  private containerEl: HTMLElement;
  private app: App;
  private onEditCallback?: (workspace: any) => void;
  private onCreateCallback?: () => void;

  constructor(
    containerEl: HTMLElement,
    workspaceService: WorkspaceService,
    settings: Settings,
    app: App,
    onEditCallback?: (workspace: any) => void,
    onCreateCallback?: () => void
  ) {
    this.containerEl = containerEl;
    this.workspaceService = workspaceService;
    this.settings = settings;
    this.app = app;
    this.onEditCallback = onEditCallback;
    this.onCreateCallback = onCreateCallback;

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
    if (!this.workspaceService) {
      console.error('[WorkspaceCardManager] Cannot refresh - workspaceService is undefined');
      return;
    }

    try {
      // Use lightweight index-based listing instead of loading all workspace files
      let workspaceMetadata = await this.workspaceService.listWorkspaces();

      // Consolidate multiple root workspaces into one
      workspaceMetadata = this.consolidateRootWorkspacesMetadata(workspaceMetadata);

      const cardItems = workspaceMetadata.map(metadata => this.metadataToCardItem(metadata));

      this.cardManager.updateItems(cardItems);
    } catch (error) {
      console.error('[WorkspaceCardManager] Error loading workspaces:', error);
    }
  }

  /**
   * Consolidate multiple root workspaces into a single default workspace (metadata version)
   */
  private consolidateRootWorkspacesMetadata(workspaces: WorkspaceMetadata[]): WorkspaceMetadata[] {
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
    const consolidatedRoot: WorkspaceMetadata = {
      ...primaryRoot,
      name: primaryRoot.name.startsWith('Workspace ') ? 'Default Workspace' : primaryRoot.name,
      description: primaryRoot.description || 'Default workspace for vault root',
      rootFolder: '/'
    };

    return [consolidatedRoot, ...nonRootWorkspaces];
  }

  /**
   * Convert WorkspaceMetadata to WorkspaceCardItem
   */
  private metadataToCardItem(metadata: WorkspaceMetadata): WorkspaceCardItem {
    return {
      id: metadata.id,
      name: this.generateWorkspaceNameFromMetadata(metadata),
      description: this.generateCardDescriptionFromMetadata(metadata),
      isEnabled: metadata.isActive ?? true,
      rootFolder: metadata.rootFolder,
      created: metadata.created,
      lastAccessed: metadata.lastAccessed,
      workspaceId: metadata.id
    };
  }

  /**
   * Generate a user-friendly workspace name from metadata
   */
  private generateWorkspaceNameFromMetadata(metadata: WorkspaceMetadata): string {
    // If there's a custom name that's not the generic pattern, use it
    if (metadata.name &&
        !metadata.name.startsWith('Workspace ') &&
        metadata.name !== 'workspace' &&
        metadata.name !== 'default-workspace') {
      return metadata.name;
    }

    // Use folder-based naming
    if (!metadata.rootFolder || metadata.rootFolder === '/' || metadata.rootFolder === '') {
      return 'Default (Root)';
    }

    // Extract the folder name from the path
    const folderName = metadata.rootFolder.split('/').filter((part: string) => part).pop() || 'Root';
    return folderName;
  }

  /**
   * Generate a meaningful description from metadata
   */
  private generateCardDescriptionFromMetadata(metadata: WorkspaceMetadata): string {
    if (metadata.description) {
      return metadata.description;
    }

    const parts: string[] = [];

    // Show session and trace counts if available
    if (metadata.sessionCount !== undefined) {
      parts.push(`${metadata.sessionCount} session${metadata.sessionCount !== 1 ? 's' : ''}`);
    }
    if (metadata.traceCount !== undefined && metadata.traceCount > 0) {
      parts.push(`${metadata.traceCount} trace${metadata.traceCount !== 1 ? 's' : ''}`);
    }

    if (parts.length > 0) {
      return parts.join(' • ');
    }

    return `Workspace in ${metadata.rootFolder}`;
  }

  /**
   * Handle add workspace button click
   */
  private async handleAddWorkspace(): Promise<void> {
    if (this.onCreateCallback) {
      this.onCreateCallback();
    } else {
      // Fallback to modal for backward compatibility
      const modal = new WorkspaceEditModal(
        this.app,
        this.workspaceService,
        this.settings,
        'create',
        undefined,
        () => this.refreshWorkspaces()
      );
      modal.open();
    }
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
    // Load full workspace data for editing
    const workspace = await this.workspaceService.getWorkspace(item.workspaceId);

    if (!workspace) {
      console.error(`Failed to load workspace: ${item.workspaceId}`);
      return;
    }

    if (this.onEditCallback) {
      this.onEditCallback(workspace);
    } else {
      // Fallback to modal for backward compatibility
      const modal = new WorkspaceEditModal(
        this.app,
        this.workspaceService,
        this.settings,
        'edit',
        workspace,
        () => this.refreshWorkspaces()
      );
      modal.open();
    }
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