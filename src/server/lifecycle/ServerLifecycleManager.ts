/**
 * ServerLifecycleManager - Handles server lifecycle operations
 * Follows Single Responsibility Principle by focusing only on lifecycle management
 */

import { AgentRegistry } from '../services/AgentRegistry';
import { HttpTransportManager } from '../transport/HttpTransportManager';
import { IPCTransportManager } from '../transport/IPCTransportManager';
import { EventManager } from '../../services/EventManager';
import { ServerStatus } from '../../types';
import { logger } from '../../utils/logger';

/**
 * Service responsible for server lifecycle management
 * Follows SRP by focusing only on lifecycle operations
 */
export class ServerLifecycleManager {
    private status: ServerStatus = 'stopped';

    constructor(
        private agentRegistry: AgentRegistry,
        private httpTransportManager: HttpTransportManager,
        private ipcTransportManager: IPCTransportManager,
        private eventManager: EventManager
    ) {}

    /**
     * Start the server
     */
    async startServer(): Promise<void> {
        if (this.status === 'running') {
            logger.systemWarn('Server is already running');
            return;
        }

        try {
            this.status = 'starting';
            logger.systemLog('Starting server...');

            // Initialize agents
            await this.initializeAgents();

            // Start transports
            await this.startTransports();

            this.status = 'running';
            this.eventManager.emit('server:started', null);
            logger.systemLog('Server started successfully');
            
            // Test if HTTP server is actually running
            try {
                const httpStatus = this.httpTransportManager.getTransportStatus();
                if (httpStatus.isRunning) {
                    logger.systemLog(`✅ MCP HTTP server confirmed running on: ${httpStatus.endpoint}`);
                }
            } catch (error) {
                // Silently continue if status check fails
            }
        } catch (error) {
            this.status = 'error';
            logger.systemError(error as Error, 'Server Start');
            throw error;
        }
    }

    /**
     * Stop the server
     */
    async stopServer(): Promise<void> {
        if (this.status === 'stopped') {
            logger.systemWarn('Server is already stopped');
            return;
        }

        try {
            this.status = 'stopping';
            logger.systemLog('Stopping server...');

            // Stop transports
            await this.stopTransports();

            this.status = 'stopped';
            this.eventManager.emit('server:stopped', null);
            logger.systemLog('Server stopped successfully');
        } catch (error) {
            this.status = 'error';
            logger.systemError(error as Error, 'Server Stop');
            throw error;
        }
    }

    /**
     * Restart the server
     */
    async restartServer(): Promise<void> {
        logger.systemLog('Restarting server...');
        await this.stopServer();
        await this.startServer();
    }

    /**
     * Initialize all registered agents
     */
    private async initializeAgents(): Promise<void> {
        try {
            await this.agentRegistry.initializeAgents();
            logger.systemLog('All agents initialized successfully');
        } catch (error) {
            logger.systemError(error as Error, 'Agent Initialization');
            throw error;
        }
    }

    /**
     * Start both transports
     */
    private async startTransports(): Promise<void> {
        try {
            // Start HTTP transport first (critical for MCP functionality)
            const httpResult = await this.httpTransportManager.startTransport();
            
            // Start IPC transport second
            const ipcResult = await this.ipcTransportManager.startTransport();

            logger.systemLog('Both transports started successfully');
        } catch (error) {
            logger.systemError(error as Error, 'Transport Start');
            throw error;
        }
    }

    /**
     * Stop both transports
     */
    private async stopTransports(): Promise<void> {
        try {
            await Promise.all([
                this.httpTransportManager.stopTransport(),
                this.ipcTransportManager.stopTransport()
            ]);

            logger.systemLog('Both transports stopped successfully');
        } catch (error) {
            logger.systemError(error as Error, 'Transport Stop');
            throw error;
        }
    }

    /**
     * Get current server status
     */
    getStatus(): ServerStatus {
        return this.status;
    }

    /**
     * Check if server is running
     */
    isRunning(): boolean {
        return this.status === 'running';
    }

    /**
     * Check if server is in error state
     */
    isInError(): boolean {
        return this.status === 'error';
    }

    /**
     * Get detailed server status
     */
    getDetailedStatus(): {
        status: ServerStatus;
        isRunning: boolean;
        agentCount: number;
        httpTransportStatus: any;
        ipcTransportStatus: any;
        uptime?: number;
    } {
        return {
            status: this.status,
            isRunning: this.isRunning(),
            agentCount: this.agentRegistry.getAgentCount(),
            ipcTransportStatus: this.ipcTransportManager.getTransportStatus(),
            httpTransportStatus: this.httpTransportManager.getTransportStatus()
        };
    }

    /**
     * Handle server error
     */
    handleServerError(error: Error): void {
        logger.systemError(error, 'Server Error');
        this.status = 'error';
        this.eventManager.emit('server:error', error);
    }

    /**
     * Perform health check
     */
    async performHealthCheck(): Promise<{
        isHealthy: boolean;
        status: ServerStatus;
        agentStatus: any;
        transportStatus: any;
        issues: string[];
    }> {
        const issues: string[] = [];

        // Check status
        if (this.status !== 'running') {
            issues.push(`Server status is ${this.status}, expected 'running'`);
        }

        // Check agents
        const agentStats = this.agentRegistry.getAgentStatistics();
        if (agentStats.totalAgents === 0) {
            issues.push('No agents registered');
        }

        // Check transports
        const httpStatus = this.httpTransportManager.getTransportStatus();
        const ipcStatus = this.ipcTransportManager.getTransportStatus();

        if (!httpStatus.isRunning) {
            issues.push('STDIO transport not connected');
        }

        if (!ipcStatus.isRunning) {
            issues.push('IPC transport not running');
        }

        return {
            isHealthy: issues.length === 0,
            status: this.status,
            agentStatus: agentStats,
            transportStatus: {
                http: httpStatus,
                ipc: ipcStatus
            },
            issues
        };
    }

    /**
     * Get server diagnostics
     */
    async getDiagnostics(): Promise<{
        lifecycle: any;
        agents: any;
        transports: any;
        events: any;
    }> {
        return {
            lifecycle: {
                status: this.status,
                isRunning: this.isRunning(),
                isInError: this.isInError()
            },
            agents: this.agentRegistry.getAgentStatistics(),
            transports: {
                http: this.httpTransportManager.getTransportStatus(),
                ipc: this.ipcTransportManager.getDiagnostics()
            },
            events: {
                hasEventManager: !!this.eventManager,
                // Could add event statistics here if EventManager supports it
            }
        };
    }

    /**
     * Force shutdown (emergency stop)
     */
    async forceShutdown(): Promise<void> {
        logger.systemWarn('Force shutdown initiated');
        
        try {
            // Try to stop transports gracefully first
            await Promise.race([
                this.stopTransports(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Transport shutdown timeout')), 5000)
                )
            ]);
        } catch (error) {
            logger.systemError(error as Error, 'Force Shutdown - Transport Stop');
        }

        // Force cleanup
        try {
            await this.ipcTransportManager.forceCleanupSocket();
        } catch (error) {
            logger.systemError(error as Error, 'Force Shutdown - Socket Cleanup');
        }

        this.status = 'stopped';
        this.eventManager.emit('server:force-shutdown', null);
        logger.systemWarn('Force shutdown completed');
    }
}