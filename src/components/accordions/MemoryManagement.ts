import { Accordion } from '../Accordion';
import { Settings } from '../../settings';
import { VaultLibrarianAgent } from '../../agents/vaultLibrarian/vaultLibrarian';
import { MemorySettingsTab } from '../MemorySettingsTab';
import { EmbeddingService } from '../../database/services/EmbeddingService';
import { FileEmbeddingAccessService } from '../../database/services/FileEmbeddingAccessService';
import { HnswSearchService } from '../../database/services/hnsw/HnswSearchService';
import { MemoryService } from '../../database/services/MemoryService';
import { EmbeddingManager } from '../../database/services/embeddingManager';
import { LazyServiceManager } from '../../services/LazyServiceManager';

/**
 * Memory Management accordion component
 * Controls enabling/disabling the memory manager and displays settings
 */
export class MemoryManagementAccordion extends Accordion {
    private settings: Settings;
    private memorySettingsContainer: HTMLElement;
    
    // ChromaDB Services
    private embeddingService: EmbeddingService | undefined;
    private fileEmbeddingAccessService: FileEmbeddingAccessService | undefined;
    private hnswSearchService: HnswSearchService | undefined;
    private memoryService: MemoryService | undefined;
    private embeddingManager: EmbeddingManager | undefined;
    
    // Agent (for backward compatibility)
    private vaultLibrarian: VaultLibrarianAgent | undefined;
    
    private memorySettingsTab: MemorySettingsTab | null = null;
    private serviceManager: LazyServiceManager | undefined;
    private readinessCheckInterval: NodeJS.Timeout | null = null;
    private statusElement: HTMLElement | null = null;
    
    /**
     * Create a new Memory Management accordion
     * @param containerEl Parent container element
     * @param settings Plugin settings
     * @param embeddingService EmbeddingService for generating and managing embeddings
     * @param fileEmbeddingAccessService FileEmbeddingAccessService for file embedding access
     * @param hnswSearchService HnswSearchService for search operations
     * @param memoryService MemoryService for memory traces and sessions
     * @param vaultLibrarian VaultLibrarian agent instance (optional, for backward compatibility)
     * @param embeddingManager EmbeddingManager for managing embedding providers (optional)
     * @param serviceManager LazyServiceManager instance for checking service readiness (optional)
     */
    constructor(
        containerEl: HTMLElement, 
        settings: Settings,
        embeddingService?: EmbeddingService,
        fileEmbeddingAccessService?: FileEmbeddingAccessService,
        hnswSearchService?: HnswSearchService,
        memoryService?: MemoryService,
        vaultLibrarian?: VaultLibrarianAgent,
        embeddingManager?: EmbeddingManager,
        serviceManager?: LazyServiceManager
    ) {
        super(containerEl, 'Memory Management', false);
        this.settings = settings;
        this.embeddingService = embeddingService;
        this.fileEmbeddingAccessService = fileEmbeddingAccessService;
        this.hnswSearchService = hnswSearchService;
        this.memoryService = memoryService;
        this.vaultLibrarian = vaultLibrarian;
        this.embeddingManager = embeddingManager;
        this.serviceManager = serviceManager;
        
        const contentEl = this.getContentEl();
        
        // Add simple description
        contentEl.createEl('p', {
            text: 'Configure settings for the Memory Manager feature.'
        });
        
        // Container for memory settings
        this.memorySettingsContainer = contentEl.createEl('div', {
            cls: 'memory-settings-container'
        });
        
        // Memory settings are now visible by default via CSS
        
        // Initialize UI based on current service state
        this.initializeUI();
        
        // Start monitoring service readiness if enabled
        if (this.settings.settings.memory?.enabled) {
            this.startServiceReadinessMonitoring();
        }
    }
    
    /**
     * Initialize UI based on current service state
     */
    private initializeUI(): void {
        if (this.areServicesReady()) {
            this.initializeMemorySettingsTab();
        } else if (this.settings.settings.memory?.enabled) {
            this.showServiceLoadingStatus();
        } else {
            this.showMemoryDisabledMessage();
        }
    }
    
    /**
     * Check if all required services are ready
     */
    private areServicesReady(): boolean {
        // If we have a service manager, use it to check readiness
        if (this.serviceManager) {
            const embeddingReady = this.serviceManager.isReady('embeddingService');
            const fileAccessReady = this.serviceManager.isReady('fileEmbeddingAccessService');
            const hnswReady = this.serviceManager.isReady('hnswSearchService');
            const memoryReady = this.serviceManager.isReady('memoryService');
            
            return embeddingReady && fileAccessReady && hnswReady && memoryReady;
        }
        
        // Fallback to direct service checks
        const hasServices = this.embeddingService && this.fileEmbeddingAccessService && 
                          this.hnswSearchService && this.memoryService;
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
            { name: 'Embedding Service', key: 'embeddingService', instance: this.embeddingService },
            { name: 'File Access Service', key: 'fileEmbeddingAccessService', instance: this.fileEmbeddingAccessService, dependency: 'vectorStore' },
            { name: 'Search Service', key: 'hnswSearchService', instance: this.hnswSearchService },
            { name: 'Memory Service', key: 'memoryService', instance: this.memoryService }
        ];
        
        services.forEach(service => {
            const isReady = this.serviceManager ? 
                this.serviceManager.isReady(service.key) : 
                !!service.instance;
            
            const listItem = serviceList.createEl('li');
            
            // Check dependency status for services that have dependencies
            if (service.dependency && this.serviceManager) {
                const depReady = this.serviceManager.isReady(service.dependency);
                const depStatus = depReady ? '✅' : '⏳';
                listItem.innerHTML = `${service.name}: ${isReady ? '✅ Ready' : `⏳ Loading... (${service.dependency}: ${depStatus})`}`;
            } else {
                listItem.innerHTML = `${service.name}: ${isReady ? '✅ Ready' : '⏳ Loading...'}`;
            }
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
     * Start monitoring service readiness
     */
    private startServiceReadinessMonitoring(): void {
        if (this.readinessCheckInterval) {
            clearInterval(this.readinessCheckInterval);
        }
        
        this.readinessCheckInterval = setInterval(() => {
            if (this.areServicesReady()) {
                console.log('[MemoryManagementAccordion] All services ready, initializing settings tab');
                this.stopServiceReadinessMonitoring();
                this.initializeMemorySettingsTab();
            } else {
                // Update status display if we're still loading
                this.updateServiceStatus();
            }
        }, 1500); // Check every 1.5 seconds
        
        // Set a timeout to stop monitoring after 30 seconds
        setTimeout(() => {
            if (this.readinessCheckInterval) {
                this.stopServiceReadinessMonitoring();
                if (!this.areServicesReady()) {
                    // Show the settings tab with whatever services are available
                    this.initializeMemorySettingsTab();
                } else if (this.statusElement) {
                    const warningEl = this.statusElement.createEl('p', {
                        text: 'Service initialization is taking longer than expected. Try reloading Obsidian if the issue persists.',
                        cls: 'memory-notice-warning'
                    });
                    warningEl.style.color = 'var(--text-warning)';
                }
            }
        }, 30000);
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
        embeddingService?: EmbeddingService,
        fileEmbeddingAccessService?: FileEmbeddingAccessService,
        hnswSearchService?: HnswSearchService,
        memoryService?: MemoryService,
        vaultLibrarian?: VaultLibrarianAgent,
        embeddingManager?: EmbeddingManager
    ): void {
        this.embeddingService = embeddingService;
        this.fileEmbeddingAccessService = fileEmbeddingAccessService;
        this.hnswSearchService = hnswSearchService;
        this.memoryService = memoryService;
        this.vaultLibrarian = vaultLibrarian;
        this.embeddingManager = embeddingManager;
        
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
                
                const services = ['embeddingService', 'fileEmbeddingAccessService', 'hnswSearchService', 'memoryService'];
                const statusList = statusEl.createEl('ul');
                
                services.forEach(serviceName => {
                    const isReady = this.serviceManager!.isReady(serviceName);
                    const listItem = statusList.createEl('li');
                    listItem.innerHTML = `${serviceName}: ${isReady ? '✅ Ready' : '❌ Not Ready'}`;
                });
            }
            
            errorEl.createEl('p', {
                text: 'Please restart Obsidian or check console for errors.'
            });
            return;
        }
        
        // Get services from LazyServiceManager if available, otherwise use direct references
        const embeddingService = this.serviceManager?.getIfReady<EmbeddingService>('embeddingService') || this.embeddingService;
        const hnswSearchService = this.serviceManager?.getIfReady<HnswSearchService>('hnswSearchService') || this.hnswSearchService;
        
        // Initialize the MemorySettingsTab with our services and agent
        this.memorySettingsTab = new MemorySettingsTab(
            this.memorySettingsContainer,
            this.settings,
            (window as any).app,
            this.embeddingManager,
            this.vaultLibrarian,
            embeddingService,
            hnswSearchService
        );
        
        // Display settings
        this.memorySettingsTab.display();
    }
}