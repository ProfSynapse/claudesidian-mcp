import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { MemorySettingsTab } from '../MemorySettingsTab';
import { MemoryService } from "../../agents/memoryManager/services/MemoryService";
import { WorkspaceService } from '../../services/WorkspaceService';
import type { ServiceManager } from '../../core/ServiceManager';

/**
 * Memory Management accordion component
 * Controls enabling/disabling the memory manager and displays settings
 */
export class MemoryManagementAccordion extends Accordion {
    private settings: Settings;
    private memorySettingsContainer: HTMLElement;

    // Simplified Services
    private memoryService: MemoryService | undefined;
    private workspaceService: WorkspaceService | undefined;
    
    // Agent (for backward compatibility)
    private vaultLibrarian: VaultLibrarianAgent | undefined;
    
    private memorySettingsTab: MemorySettingsTab | null = null;
    private serviceManager: ServiceManager | undefined;
    private readinessCheckInterval: NodeJS.Timeout | null = null;
    private statusElement: HTMLElement | null = null;
    
    /**
     * Create a new Memory Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param memoryService MemoryService for memory traces and sessions
     * @param workspaceService WorkspaceService for workspace management
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     * @param serviceManager ServiceManager instance for checking service readiness (optional)
     */
    constructor(
        containerEl: HTMLElement,
        settings: Settings,
        memoryService?: MemoryService,
        workspaceService?: WorkspaceService,
        vaultLibrarian?: VaultLibrarianAgent,
        serviceManager?: ServiceManager
    ) {
        super(containerEl, 'Memory Management', false);
        this.settings = settings;
        this.memoryService = memoryService;
        this.workspaceService = workspaceService;
        this.vaultLibrarian = vaultLibrarian;
        this.serviceManager = serviceManager;
        
        const contentEl = this.getContentEl();
        
        // Add simple description
        contentEl.createEl('p', {
            text: 'Manage workspaces: view, create, edit, and delete workspace configurations.'
        });
        
        // Container for memory settings
        this.memorySettingsContainer = contentEl.createEl('div', {
            cls: 'memory-settings-container'
        });
        
        // Memory settings are now visible by default via CSS
        
        // Initialize UI based on current service state
        this.initializeUI();

        // Start monitoring service readiness
        this.startServiceReadinessMonitoring();
    }
    
    /**
     * Initialize UI based on current service state
     */
    private initializeUI(): void {
        if (this.areServicesReady()) {
            this.initializeMemorySettingsTab();
        } else {
            this.showServiceLoadingStatus();
        }
    }
    
    /**
     * Check if all required services are ready
     */
    private areServicesReady(): boolean {
        // If we have a service manager, use it to check readiness
        if (this.serviceManager) {
            const memoryReady = this.serviceManager.isServiceReady('memoryService');
            return memoryReady;
        }
        
        // Fallback to direct service checks
        const hasServices = this.memoryService;
        const hasAgent = this.vaultLibrarian;
        
        return !!(hasServices || hasAgent);
    }
    
    /**
     * Show service loading status with periodic updates
     */
    private showServiceLoadingStatus(): void {
        // Clear existing content
        this.memorySettingsContainer.empty();
        
        this.statusElement = this.memorySettingsContainer.createEl('div', {
            cls: 'memory-notice'
        });
        
        this.statusElement.createEl('p', {
            text: 'Memory Manager is enabled and services are initializing...'
        });
        
        this.updateServiceStatus();
        
        this.statusElement.createEl('p', {
            text: 'Settings will appear automatically when all services are ready.',
            cls: 'memory-notice-small'
        });
    }
    
    /**
     * Update service status display
     */
    private updateServiceStatus(): void {
        if (!this.statusElement) return;
        
        // Remove existing service status
        const existingStatus = this.statusElement.querySelector('.service-status');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        const serviceStatus = this.statusElement.createEl('div', {
            cls: 'service-status'
        });
        
        serviceStatus.createEl('p', {
            text: 'Service Status:'
        });
        
        // Create service status list
        const serviceList = serviceStatus.createEl('ul');
        
        const services = [
            { name: 'Memory Service', key: 'memoryService', instance: this.memoryService }
        ];
        
        services.forEach(service => {
            const isReady = this.serviceManager ? 
                this.serviceManager.isServiceReady(service.key) : 
                !!service.instance;
            
            const listItem = serviceList.createEl('li');
            
            // Simple service status display
            listItem.innerHTML = `${service.name}: ${isReady ? '✅ Ready' : '⏳ Loading...'}`;
        });
    }
    
    /**
     * Show message when memory manager is disabled
     */
    private showMemoryDisabledMessage(): void {
        this.memorySettingsContainer.empty();
        this.memorySettingsContainer.createEl('div', {
            cls: 'memory-notice',
            text: 'Memory Manager configuration options will appear here once enabled. Use the toggle in the Memory Manager Settings above to enable this feature.'
        });
    }
    
    /**
     * Start monitoring service readiness (services should already be initializing in background)
     */
    private startServiceReadinessMonitoring(): void {
        // Services should already be initializing in background
        if (this.areServicesReady()) {
            this.initializeMemorySettingsTab();
            return;
        }
        
        // Display current status
        this.updateServiceStatus();
        
        // Check once more after background initialization should complete
        setTimeout(() => {
            if (this.areServicesReady()) {
                this.initializeMemorySettingsTab();
            } else {
                // If still not ready, show current status and allow timeout handling
                this.updateServiceStatus();
                this.startFallbackMonitoring();
            }
        }, 3000); // Single check after background init
    }
    
    /**
     * Fallback monitoring for cases where background init is slow
     */
    private startFallbackMonitoring(): void {
        if (this.readinessCheckInterval) {
            clearInterval(this.readinessCheckInterval);
        }
        
        this.readinessCheckInterval = setInterval(() => {
            if (this.areServicesReady()) {
                this.stopServiceReadinessMonitoring();
                this.initializeMemorySettingsTab();
            } else {
                this.updateServiceStatus();
            }
        }, 2000); // Check every 2 seconds as fallback
        
        // Set a timeout to stop monitoring after 15 seconds
        setTimeout(() => {
            if (this.readinessCheckInterval) {
                this.stopServiceReadinessMonitoring();
                // Show the settings tab with whatever services are available
                this.initializeMemorySettingsTab();
                
                if (this.statusElement && !this.areServicesReady()) {
                    const warningEl = this.statusElement.createEl('p', {
                        text: 'Some services are still initializing. Settings may be limited until complete.',
                        cls: 'memory-notice-warning'
                    });
                    warningEl.style.color = 'var(--text-warning)';
                }
            }
        }, 15000); // Reduced timeout
    }
    
    /**
     * Stop monitoring service readiness
     */
    private stopServiceReadinessMonitoring(): void {
        if (this.readinessCheckInterval) {
            clearInterval(this.readinessCheckInterval);
            this.readinessCheckInterval = null;
        }
    }
    
    /**
     * Update services (called externally when services become available)
     */
    public updateServices(
        memoryService?: MemoryService,
        vaultLibrarian?: VaultLibrarianAgent
    ): void {
        this.memoryService = memoryService;
        this.vaultLibrarian = vaultLibrarian;
        
        // Refresh UI
        this.initializeUI();
    }
    
    /**
     * Cleanup method to clear intervals
     */
    public cleanup(): void {
        this.stopServiceReadinessMonitoring();
    }
    
    /**
     * Initialize the memory settings tab
     */
    private initializeMemorySettingsTab(): void {
        // Clear existing content
        this.memorySettingsContainer.empty();
        
        // Check if we have services available (preferred) or need to fall back to agents
        const hasServices = this.areServicesReady();
        const hasAgent = this.vaultLibrarian;
        
        if (!hasServices && !hasAgent) {
            // Show error message if neither services nor agents are available
            const errorEl = this.memorySettingsContainer.createEl('div', {
                cls: 'memory-notice error'
            });
            errorEl.createEl('p', {
                text: 'Memory Manager services are not available.'
            });
            
            // Show detailed service status for debugging
            if (this.serviceManager) {
                const statusEl = errorEl.createEl('div', {
                    cls: 'service-status-debug'
                });
                statusEl.createEl('p', {
                    text: 'Service Status:'
                });
                
                const services = ['memoryService'];
                const statusList = statusEl.createEl('ul');
                
                services.forEach(serviceName => {
                    const isReady = this.serviceManager!.isServiceReady(serviceName);
                    const listItem = statusList.createEl('li');
                    listItem.innerHTML = `${serviceName}: ${isReady ? '✅ Ready' : '❌ Not Ready'}`;
                });
            }
            
            errorEl.createEl('p', {
                text: 'Please restart Obsidian or check console for errors.'
            });
            return;
        }
        
        // Initialize the MemorySettingsTab with simplified services
        if (this.memoryService) {
            this.memorySettingsTab = new MemorySettingsTab(
                this.memorySettingsContainer,
                (window as any).app,
                this.workspaceService!,
                this.memoryService,
                this.settings
            );
        }
        
        // Display settings
        if (this.memorySettingsTab) {
            this.memorySettingsTab.display();
        }
    }
}