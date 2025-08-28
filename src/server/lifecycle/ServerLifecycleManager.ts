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
        console.log('[MCP Debug] ServerLifecycleManager.startServer() called - ACTUAL METHOD');
        logger.systemLog('[MCP Debug] ServerLifecycleManager.startServer() called');
        
        console.log('[MCP Debug] Current server status:', this.status);
        
        if (this.status === 'running') {
            console.log('[MCP Debug] Server is already running - returning early');
            logger.systemWarn('[MCP Debug] Server is already running');
            return;
        }

        try {
            console.log('[MCP Debug] Setting status to starting');
            this.status = 'starting';
            console.log('[MCP Debug] Status set to starting, about to log');
            logger.systemLog('[MCP Debug] Starting server...');

            // Initialize agents
            console.log('[MCP Debug] About to initialize agents');
            logger.systemLog('[MCP Debug] About to initialize agents');
            await this.initializeAgents();
            console.log('[MCP Debug] Agents initialized successfully');

            // Start transports
            console.log('[MCP Debug] About to start transports');
            logger.systemLog('[MCP Debug] About to start transports');
            await this.startTransports();
            console.log('[MCP Debug] Transports started successfully');

            this.status = 'running';
            this.eventManager.emit('server:started', null);
            console.log('[MCP Debug] Server started successfully');
            logger.systemLog('[MCP Debug] Server started successfully');
            
            // Test if HTTP server is actually running
            try {
                const httpStatus = this.httpTransportManager.getTransportStatus();
                console.log('[MCP Debug] HTTP transport status:', httpStatus);
                if (httpStatus.isRunning) {
                    console.log('[MCP Debug] ✅ HTTP server confirmed running on:', httpStatus.endpoint);
                    logger.systemLog(`✅ MCP HTTP server confirmed running on: ${httpStatus.endpoint}`);
                } else {
                    console.log('[MCP Debug] ❌ HTTP server not running despite successful startup');
                }
            } catch (error) {
                console.error('[MCP Debug] Error checking HTTP transport status:', error);
            }
        } catch (error) {
            console.error('[MCP Debug] ServerLifecycleManager.startServer() caught error:', error);
            logger.systemError(error as Error, '[MCP Debug] ServerLifecycleManager.startServer() failed');
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
        logger.systemLog('[MCP Debug] startTransports() called');
        try {
            logger.systemLog('[MCP Debug] About to start HTTP transport first');
            // Start HTTP transport first (critical for MCP functionality)
            const httpResult = await this.httpTransportManager.startTransport();
            logger.systemLog('[MCP Debug] HTTP transport started successfully');
            
            logger.systemLog('[MCP Debug] About to start IPC transport');
            // Start IPC transport second
            const ipcResult = await this.ipcTransportManager.startTransport();
            logger.systemLog('[MCP Debug] IPC transport started successfully');

            logger.systemLog('[MCP Debug] Both transports started successfully');
            logger.systemLog('Both transports started successfully');
        } catch (error) {
            logger.systemError(error as Error, '[MCP Debug] Transport start failed');
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