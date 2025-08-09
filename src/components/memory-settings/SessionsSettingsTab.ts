import { Setting, Notice } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';
import { MemoryManagerAgent } from '../../agents/memoryManager/MemoryManager';

/**
 * Sessions Settings tab component
 * Handles session and state management
 */
export class SessionsSettingsTab extends BaseSettingsTab {
    private memoryManager: MemoryManagerAgent | null;
    
    /**
     * Create a new sessions settings tab
     */
    constructor(settings: any, settingsManager: any, app: any, memoryManager?: MemoryManagerAgent) {
        super(settings, settingsManager, app);
        this.memoryManager = memoryManager || null;
    }
    
    /**
     * Display the sessions settings tab
     */
    display(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Session Management' });
        
        // If memory manager isn't available, show a message
        if (!this.memoryManager) {
            containerEl.createEl('p', { 
                text: 'Memory manager is not initialized. Sessions management will be available after restarting Obsidian.',
                cls: 'warning-text'
            });
            return;
        }
        
        // Session settings
        new Setting(containerEl)
            .setName('Auto-Create Sessions')
            .setDesc('Automatically create sessions when needed for tracking context')
            .addToggle(toggle => toggle
                .setValue(this.settings.autoCreateSessions !== false) // Default to true
                .onChange(async (value) => {
                    this.settings.autoCreateSessions = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Session Naming')
            .setDesc('How to name automatically created sessions')
            .addDropdown(dropdown => dropdown
                .addOption('timestamp', 'Timestamp Only')
                .addOption('workspace', 'Workspace + Timestamp')
                .addOption('content', 'Content Based (if available)')
                .setValue(this.settings.sessionNaming || 'workspace')
                .onChange(async (value: any) => {
                    this.settings.sessionNaming = value;
                    await this.saveSettings();
                })
            );
        
        // State settings
        containerEl.createEl('h3', { text: 'State Management' });
        
        new Setting(containerEl)
            .setName('Auto-Checkpoint')
            .setDesc('Automatically create checkpoints at regular intervals')
            .addToggle(toggle => toggle
                .setValue(this.settings.autoCheckpoint || false)
                .onChange(async (value) => {
                    this.settings.autoCheckpoint = value;
                    await this.saveSettings();
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                })
            );
            
        if (this.settings.autoCheckpoint) {
            new Setting(containerEl)
                .setName('Checkpoint Interval')
                .setDesc('Minutes between auto-checkpoints (0 = after each operation)')
                .addSlider(slider => slider
                    .setLimits(0, 60, 5)
                    .setValue(this.settings.checkpointInterval || 30)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.checkpointInterval = value;
                        await this.saveSettings();
                    })
                );
        }
            
        new Setting(containerEl)
            .setName('Maximum States')
            .setDesc('Maximum number of states to keep per workspace')
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.settings.maxStates || 10)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.maxStates = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('State Pruning Strategy')
            .setDesc('How to determine which states to remove when the limit is reached')
            .addDropdown(dropdown => dropdown
                .addOption('oldest', 'Oldest States')
                .addOption('least-important', 'Least Important States')
                .addOption('manual', 'Manual Cleanup Only')
                .setValue(this.settings.statePruningStrategy || 'oldest')
                .onChange(async (value: any) => {
                    this.settings.statePruningStrategy = value;
                    await this.saveSettings();
                })
            );
            
        // Current sessions summary
        containerEl.createEl('h3', { text: 'Active Sessions' });
        
        // Add a container for session list
        const sessionsContainer = containerEl.createEl('div', { cls: 'memory-sessions-list' });
        
        // Add a refresh button for session list
        const refreshButton = containerEl.createEl('button', {
            text: 'Refresh Sessions',
            cls: 'mod-cta',
            attr: { style: 'margin-top: 10px;' }
        });
        
        // Add click handler for refresh button
        refreshButton.addEventListener('click', () => this.refreshSessions(sessionsContainer));
        
        // Initial refresh
        this.refreshSessions(sessionsContainer);
    }
    
    /**
     * Refresh the sessions list
     */
    private async refreshSessions(sessionsContainer: HTMLElement): Promise<void> {
        sessionsContainer.empty();
        sessionsContainer.createEl('p', { text: 'Loading sessions...' });
        
        try {
            const workspaces = await this.getWorkspaces();
            if (!workspaces || workspaces.length === 0) {
                sessionsContainer.empty();
                sessionsContainer.createEl('p', { text: 'No workspaces found.' });
                return;
            }
            
            sessionsContainer.empty();
            let foundSessions = false;
            
            for (const workspace of workspaces) {
                // Only show workspaces that have active sessions
                const activeSessions = await this.memoryManager?.executeMode('listSessions', {
                    workspaceContext: { workspaceId: workspace.id },
                    activeOnly: true
                });
                
                if (activeSessions?.success && activeSessions.data?.sessions?.length > 0) {
                    foundSessions = true;
                    const sessions = activeSessions.data.sessions;
                    
                    // Create a workspace section
                    const workspaceSection = sessionsContainer.createEl('div', { cls: 'memory-workspace-item' });
                    workspaceSection.createEl('h4', { text: workspace.name });
                    
                    // Create session list
                    const sessionList = workspaceSection.createEl('ul', { cls: 'memory-session-list' });
                    
                    sessions.forEach((session: any) => {
                        const sessionItem = sessionList.createEl('li', { cls: 'memory-session-item' });
                        
                        const startTime = new Date(session.startTime).toLocaleString();
                        
                        sessionItem.createEl('div', {
                            text: `${session.name} (started ${startTime})`,
                            cls: 'memory-session-name'
                        });
                        
                        // Add a button to end this session
                        const endButton = sessionItem.createEl('button', {
                            text: 'End Session',
                            cls: 'mod-warning memory-session-end'
                        });
                        
                        endButton.addEventListener('click', async () => {
                            if (confirm(`Are you sure you want to end the session "${session.name}"?`)) {
                                try {
                                    await this.memoryManager?.executeMode('editSession', {
                                        workspaceContext: { workspaceId: workspace.id },
                                        sessionId: session.id,
                                        isActive: false
                                    });
                                    
                                    new Notice(`Session "${session.name}" ended`);
                                    this.refreshSessions(sessionsContainer);
                                } catch (error) {
                                    console.error('Error ending session:', error);
                                    new Notice(`Failed to end session: ${error instanceof Error ? error.message : String(error)}`);
                                }
                            }
                        });
                    });
                }
            }
            
            if (!foundSessions) {
                sessionsContainer.createEl('p', { text: 'No active sessions found.' });
            }
        } catch (error) {
            console.error('Error loading sessions:', error);
            sessionsContainer.empty();
            sessionsContainer.createEl('p', { text: `Error loading sessions: ${error instanceof Error ? error.message : String(error)}` });
        }
    }
    
    /**
     * Helper method to get workspaces
     */
    private async getWorkspaces(): Promise<any[]> {
        try {
            // Try to get from the plugin's workspace service
            const plugin = this.app.plugins.getPlugin('claudesidian-mcp') as any;
            if (plugin?.services?.workspaceService) {
                return await plugin.services.workspaceService.getWorkspaces();
            }
            
            // No workspaces found
            return [];
        } catch (error) {
            console.error('Error getting workspaces:', error);
            return [];
        }
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}