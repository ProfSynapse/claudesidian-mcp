import { setIcon } from 'obsidian';
import BridgeMCPPlugin from '../main';

export type ServerStatus = 'initializing' | 'starting' | 'running' | 'stopping' | 'stopped' | 'error';

export class StatusBarComponent {
    private statusEl: HTMLElement;
    private iconEl: HTMLElement;
    private textEl: HTMLElement;
    private currentStatus: ServerStatus = 'stopped';

    constructor(statusBarItem: HTMLElement) {
        this.statusEl = statusBarItem;
        this.statusEl.addClass('bridge-mcp-status');
        
        // Create icon element
        this.iconEl = this.statusEl.createDiv('bridge-mcp-status-icon');
        
        // Create text element
        this.textEl = this.statusEl.createSpan('bridge-mcp-status-text');
        this.textEl.textContent = 'MCP';
        
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
            initializing: { text: 'MCP: Initializing...', icon: 'loader' },
            starting: { text: 'MCP: Starting...', icon: 'loader' },
            running: { text: 'MCP: Running', icon: 'check-circle' },
            stopping: { text: 'MCP: Stopping...', icon: 'loader' },
            stopped: { text: 'MCP: Stopped', icon: 'circle' },
            error: { text: 'MCP: Error', icon: 'alert-circle' }
        };

        const config = statusConfig[status];
        this.statusEl.setAttribute('aria-label', config.text);
        
        // Clear and set new icon
        this.iconEl.empty();
        setIcon(this.iconEl, config.icon);
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