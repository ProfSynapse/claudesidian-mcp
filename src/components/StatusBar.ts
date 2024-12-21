import { Plugin } from 'obsidian';
import { App } from 'obsidian';
import BridgeMCPPlugin from '../main';

export type ServerStatus = 'initializing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export class StatusBarComponent {
    private statusEl: HTMLElement;
    private currentStatus: ServerStatus = 'stopped';

    constructor(statusBarItem: HTMLElement) {
        this.statusEl = statusBarItem;
        this.statusEl.addClass('bridge-mcp-status');
        this.setStatus('stopped');
    }

    setStatus(status: ServerStatus) {
        // Remove old status class
        this.statusEl.removeClass(`bridge-mcp-status-${this.currentStatus}`);
        
        // Add new status class
        this.currentStatus = status;
        this.statusEl.addClass(`bridge-mcp-status-${status}`);

        // Update status text and icon
        const statusConfig = {
            initializing: { text: 'MCP: Initializing...', icon: '⚙️' },
            starting: { text: 'MCP: Starting...', icon: '🔄' },
            running: { text: 'MCP: Running', icon: '🟢' },
            stopping: { text: 'MCP: Stopping...', icon: '🔄' },
            stopped: { text: 'MCP: Stopped', icon: '⭕' },
            error: { text: 'MCP: Error', icon: '❌' }
        };

        const config = statusConfig[status];
        this.statusEl.setAttribute('aria-label', config.text);
        this.statusEl.innerHTML = `${config.icon} MCP`;
    }

    getStatus(): ServerStatus {
        return this.currentStatus;
    }
}

export class StatusBar {
    private statusEl: HTMLElement;
    private plugin: BridgeMCPPlugin;

    constructor(plugin: BridgeMCPPlugin) {
        this.plugin = plugin;
        this.statusEl = document.createElement('div');
        this.statusEl.className = 'mcp-status-bar';
        this.setStatus('stopped');
    }

    setStatus(status: 'running' | 'stopped' | 'error') {
        this.statusEl.textContent = `MCP: ${status}`;
        this.statusEl.className = `mcp-status-bar mcp-status-${status}`;
    }

    getElement(): HTMLElement {
        return this.statusEl;
    }
}