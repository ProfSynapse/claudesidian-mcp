import { Setting, App, ToggleComponent } from 'obsidian';
import { Settings } from '../../settings';
import { ChatViewSettings } from '../../types';

export interface ChatViewTabConfig {
    containerEl: HTMLElement;
    settings: ChatViewSettings;
    app: App;
    onSettingsChange: (settings: ChatViewSettings) => Promise<void>;
    onChatViewEnabled?: () => Promise<void>;
}

/**
 * ChatView Tab - Experimental AI Chat controls and warnings
 * Provides settings for the experimental ChatView feature with appropriate warnings
 */
export class ChatViewTab {
    private config: ChatViewTabConfig;
    
    constructor(config: ChatViewTabConfig) {
        this.config = config;
        this.createContent();
    }
    
    /**
     * Create the tab content with experimental warnings and controls
     */
    private createContent(): void {
        const { containerEl } = this.config;
        containerEl.empty();
        
        // Experimental warning banner
        this.createExperimentalWarning();
        
        // ChatView enable/disable controls
        this.createChatViewControls();
        
        // Additional information
        this.createAdditionalInfo();
    }
    
    /**
     * Create the experimental warning banner
     */
    private createExperimentalWarning(): void {
        const warningContainer = this.config.containerEl.createDiv('experimental-warning-container');
        
        // Warning icon and header
        const warningHeader = warningContainer.createDiv('experimental-warning-header');
        warningHeader.createSpan({ text: '⚠️', cls: 'experimental-warning-icon' });
        warningHeader.createEl('h3', { text: 'Experimental Feature', cls: 'experimental-warning-title' });
        
        // Warning message
        const warningMessage = warningContainer.createDiv('experimental-warning-message');
        warningMessage.createEl('p', {
            text: 'The AI Chat feature is experimental and may contain bugs or unexpected behavior. Use at your own risk.'
        });
        
        // Feedback link
        const feedbackParagraph = warningMessage.createEl('p');
        feedbackParagraph.createSpan({ text: 'Found an issue? ' });
        const feedbackLink = feedbackParagraph.createEl('a', {
            text: 'Report it on GitHub',
            href: 'https://github.com/ProfSynapse/claudesidian-mcp/issues'
        });
        feedbackLink.setAttribute('target', '_blank');
        feedbackLink.setAttribute('rel', 'noopener noreferrer');
    }
    
    /**
     * Create ChatView enable/disable controls
     */
    private createChatViewControls(): void {
        const controlsSection = this.config.containerEl.createDiv('chatview-controls-section');
        controlsSection.createEl('h4', { text: 'AI Chat Settings' });
        
        // Enable ChatView toggle
        new Setting(controlsSection)
            .setName('Enable AI Chat')
            .setDesc('Enable the experimental AI chat interface. Requires acknowledgment of experimental nature.')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(this.config.settings.enabled)
                    .onChange(async (value: boolean) => {
                        if (value && !this.config.settings.acknowledgedExperimental) {
                            // If enabling but not acknowledged, show acknowledgment first
                            toggle.setValue(false);
                            this.showAcknowledgmentDialog(async () => {
                                // After acknowledgment, enable the toggle
                                this.config.settings.acknowledgedExperimental = true;
                                this.config.settings.enabled = true;
                                toggle.setValue(true);
                                await this.saveSettings();
                                this.refreshAcknowledgmentDisplay();
                                
                                // Trigger ChatView activation (register UI and auto-open)
                                if (this.config.onChatViewEnabled) {
                                    await this.config.onChatViewEnabled();
                                }
                            });
                        } else {
                            this.config.settings.enabled = value;
                            await this.saveSettings();
                            
                            // If enabling (and already acknowledged), trigger ChatView activation
                            if (value && this.config.onChatViewEnabled) {
                                await this.config.onChatViewEnabled();
                            }
                        }
                    });
            });
        
        // Acknowledgment status
        this.createAcknowledgmentDisplay();
    }
    
    /**
     * Create acknowledgment status display
     */
    private createAcknowledgmentDisplay(): void {
        const ackContainer = this.config.containerEl.createDiv('acknowledgment-display');
        this.refreshAcknowledgmentDisplay();
    }
    
    /**
     * Refresh the acknowledgment display
     */
    private refreshAcknowledgmentDisplay(): void {
        const ackContainer = this.config.containerEl.querySelector('.acknowledgment-display') as HTMLElement;
        if (!ackContainer) return;
        
        ackContainer.empty();
        
        if (this.config.settings.acknowledgedExperimental) {
            const ackStatus = ackContainer.createDiv('acknowledgment-status acknowledged');
            ackStatus.createSpan({ text: '✓', cls: 'acknowledgment-check' });
            ackStatus.createSpan({ text: 'Experimental nature acknowledged' });
        } else {
            const ackStatus = ackContainer.createDiv('acknowledgment-status not-acknowledged');
            ackStatus.createSpan({ text: '○', cls: 'acknowledgment-pending' });
            ackStatus.createSpan({ text: 'Experimental acknowledgment required to enable' });
        }
    }
    
    /**
     * Show acknowledgment dialog
     */
    private showAcknowledgmentDialog(onAcknowledge: () => Promise<void>): void {
        const modal = document.createElement('div');
        modal.className = 'modal-container mod-dim';
        
        const modalBg = modal.createDiv('modal-bg');
        const modalContent = modal.createDiv('modal');
        
        // Modal header
        const modalHeader = modalContent.createDiv('modal-header');
        modalHeader.createEl('h2', { text: 'Acknowledge Experimental Feature' });
        
        // Modal body
        const modalBody = modalContent.createDiv('modal-body');
        modalBody.createEl('p', {
            text: 'The AI Chat feature is experimental and may:'
        });
        
        const riskList = modalBody.createEl('ul');
        riskList.createEl('li', { text: 'Contain bugs or unexpected behavior' });
        riskList.createEl('li', { text: 'Change significantly in future updates' });
        riskList.createEl('li', { text: 'Consume API tokens from your LLM providers' });
        riskList.createEl('li', { text: 'Not work reliably in all scenarios' });
        
        modalBody.createEl('p', {
            text: 'By proceeding, you acknowledge these risks and agree to use the feature at your own discretion.'
        });
        
        // Modal buttons
        const modalButtons = modalContent.createDiv('modal-button-container');
        
        const cancelBtn = modalButtons.createEl('button', { text: 'Cancel' });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        const acknowledgeBtn = modalButtons.createEl('button', { 
            text: 'I Understand - Enable Chat', 
            cls: 'mod-cta' 
        });
        acknowledgeBtn.addEventListener('click', async () => {
            await onAcknowledge();
            document.body.removeChild(modal);
        });
        
        // Close on background click
        modalBg.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        document.body.appendChild(modal);
    }
    
    /**
     * Create additional information section
     */
    private createAdditionalInfo(): void {
        const infoSection = this.config.containerEl.createDiv('chatview-info-section');
        infoSection.createEl('h4', { text: 'About AI Chat' });
        
        const infoParagraph = infoSection.createEl('p');
        infoParagraph.createSpan({ 
            text: 'The AI Chat feature provides a conversational interface for interacting with AI models. '
        });
        infoParagraph.createSpan({
            text: 'It integrates with your configured LLM providers and can execute vault operations through MCP tools.'
        });
        
        // Usage notes
        const usageSection = infoSection.createDiv('chatview-usage-notes');
        usageSection.createEl('h5', { text: 'Usage Notes:' });
        
        const notesList = usageSection.createEl('ul');
        notesList.createEl('li', { text: 'Ensure you have LLM providers configured in the "🔑 LLM Providers" tab' });
        notesList.createEl('li', { text: 'Chat conversations will consume API tokens from your providers' });
        notesList.createEl('li', { text: 'The chat can access and modify your vault through available agents' });
        notesList.createEl('li', { text: 'Report any issues or unexpected behavior on GitHub' });
        
        // Chat input shortcuts
        usageSection.createEl('h5', { text: 'Chat Input Shortcuts:' });
        
        const shortcutsList = usageSection.createEl('ul');
        shortcutsList.createEl('li', { text: '@ - Mention agents/prompts (e.g., @research-assistant)' });
        shortcutsList.createEl('li', { text: '/ - Browse and execute MCP tools (e.g., /createContent)' });
        shortcutsList.createEl('li', { text: '[[ - Reference vault notes with context (e.g., [[My Note]])' });
    }
    
    /**
     * Save settings changes
     */
    private async saveSettings(): Promise<void> {
        await this.config.onSettingsChange(this.config.settings);
    }
    
    /**
     * Update settings and refresh display
     */
    updateSettings(settings: ChatViewSettings): void {
        this.config.settings = settings;
        this.refreshAcknowledgmentDisplay();
    }
    
    /**
     * Cleanup when tab is destroyed
     */
    destroy(): void {
        // No cleanup needed for this component
    }
}