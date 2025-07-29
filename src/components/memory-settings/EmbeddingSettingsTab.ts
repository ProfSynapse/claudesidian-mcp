import { Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';

/**
 * Embedding Settings tab component
 * Handles content chunking, indexing schedules, performance settings, filtering, and advanced database settings
 */
export class EmbeddingSettingsTab extends BaseSettingsTab {
    /**
     * Display the embedding settings tab
     */
    display(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Automatic Embedding' });
        
        // Add Embedding Strategy dropdown
        new Setting(containerEl)
            .setName('Automatic Indexing')
            .setDesc('Controls when new or modified notes are automatically indexed and embedded for search')
            .addDropdown(dropdown => dropdown
                .addOption('idle', 'Idle Mode - Index when Obsidian is inactive')
                .addOption('startup', 'Startup Mode - Index missing files on restart')
                .setValue(this.settings.embeddingStrategy || 'idle')
                .onChange(async (value) => {
                    this.settings.embeddingStrategy = value as 'idle' | 'startup';
                    await this.saveSettings();
                    // Trigger re-render if needed
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                })
            );
            
        // Show idle threshold setting only when idle strategy is selected
        if (this.settings.embeddingStrategy === 'idle') {
            const idleTimeSetting = new Setting(containerEl)
                .setName('Idle Time Threshold')
                .setDesc('How long to wait (in seconds) after the last change before embedding (minimum: 5 seconds)');
            
            let idleTimeInput: HTMLInputElement;
            let errorEl: HTMLElement;
            
            idleTimeSetting
                .addText(text => {
                    idleTimeInput = text.inputEl;
                    text
                        .setPlaceholder('60')
                        .setValue(String(this.settings.idleTimeThreshold ? this.settings.idleTimeThreshold / 1000 : 60)) // Convert from ms to seconds
                        .onChange(async (value) => {
                            const numValue = Number(value);
                            
                            // Clear previous error styling
                            idleTimeInput.style.borderColor = '';
                            if (errorEl) {
                                errorEl.remove();
                            }
                            
                            if (value.trim() === '') {
                                // Empty value, show error
                                idleTimeInput.style.borderColor = 'var(--text-error)';
                                errorEl = idleTimeSetting.settingEl.createDiv({
                                    text: 'Idle time is required',
                                    cls: 'setting-error'
                                });
                                return;
                            }
                            
                            if (isNaN(numValue)) {
                                // Invalid number, show error
                                idleTimeInput.style.borderColor = 'var(--text-error)';
                                errorEl = idleTimeSetting.settingEl.createDiv({
                                    text: 'Please enter a valid number',
                                    cls: 'setting-error'
                                });
                                return;
                            }
                            
                            if (numValue < 5) {
                                // Below minimum, show error
                                idleTimeInput.style.borderColor = 'var(--text-error)';
                                errorEl = idleTimeSetting.settingEl.createDiv({
                                    text: 'Minimum idle time is 5 seconds',
                                    cls: 'setting-error'
                                });
                                return;
                            }
                            
                            if (numValue > 3600) {
                                // Above reasonable maximum (1 hour), show warning
                                idleTimeInput.style.borderColor = 'var(--text-warning)';
                                errorEl = idleTimeSetting.settingEl.createDiv({
                                    text: 'Warning: Very long idle times may delay embedding',
                                    cls: 'setting-warning'
                                });
                            }
                            
                            // Valid value, save it
                            this.settings.idleTimeThreshold = numValue * 1000; // Convert to ms for storage
                            await this.saveSettings();
                            
                            // Show success feedback briefly
                            idleTimeInput.style.borderColor = 'var(--text-success)';
                            setTimeout(() => {
                                idleTimeInput.style.borderColor = '';
                            }, 1000);
                        });
                })
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Reset to default (60 seconds)')
                        .onClick(async () => {
                            this.settings.idleTimeThreshold = 60000;
                            idleTimeInput.value = '60';
                            await this.saveSettings();
                            if (this.onSettingsChanged) {
                                this.onSettingsChanged();
                            }
                        });
                });
        }
            
        // Filter Settings section (moved from FilterSettingsTab)
        containerEl.createEl('h3', { text: 'Exclude Patterns' });
        
        const excludePatternsSetting = new Setting(containerEl)
            .setName('Exclude Patterns')
            .setDesc('Exclude files matching these patterns (glob format, one per line)');
            
        const excludeTextarea = excludePatternsSetting.controlEl.createEl('textarea', {
            cls: 'memory-settings-textarea',
            attr: {
                rows: '4'
            }
        });
        
        excludeTextarea.value = this.settings.excludePaths.join('\n');
        excludeTextarea.addEventListener('change', async () => {
            const patterns = excludeTextarea.value.split('\n')
                .map(p => p.trim())
                .filter(p => p.length > 0);
            
            this.settings.excludePaths = patterns;
            await this.saveSettings();
        });
        
        containerEl.createEl('h3', { text: 'Search Preferences' });
        
        new Setting(containerEl)
            .setName('Default Result Limit')
            .setDesc('Default number of results to return')
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.settings.defaultResultLimit)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.defaultResultLimit = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Default Similarity Threshold')
            .setDesc('Minimum similarity score (0-1) for search results')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.settings.defaultThreshold)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.defaultThreshold = value;
                    await this.saveSettings();
                })
            );
            
        // REMOVED: Semantic Search Threshold setting
        // The plugin now uses pure score-based ranking instead of threshold filtering
        // This provides more consistent and intuitive search results
        
        // Migration notice for users who had threshold settings
        if (this.settings.semanticThreshold !== undefined && this.settings.semanticThreshold !== 0.5) {
            const notice = containerEl.createDiv('setting-item');
            notice.createDiv('setting-item-info').innerHTML = `
                <div class="setting-item-name" style="color: #e69138;">🔄 Settings Updated</div>
                <div class="setting-item-description">
                    Semantic threshold setting has been replaced with score-based ranking for better search results.
                    Your search experience will be improved with more consistent relevance ordering.
                </div>
            `;
        }
            
        new Setting(containerEl)
            .setName('Enable Backlink Boost')
            .setDesc('Boost results from files with backlinks to/from high-scoring results')
            .addToggle(toggle => toggle
                .setValue(this.settings.backlinksEnabled)
                .onChange(async (value) => {
                    this.settings.backlinksEnabled = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Graph Boost Factor')
            .setDesc('How much to boost results based on connections (0-1)')
            .addSlider(slider => slider
                .setLimits(0, 1, 0.05)
                .setValue(this.settings.graphBoostFactor)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.graphBoostFactor = value;
                    await this.saveSettings();
                })
            );
            
        // Database Settings section (moved from AdvancedSettingsTab)
        containerEl.createEl('h3', { text: 'Database Settings' });
            
        const dbSizeSetting = new Setting(containerEl)
            .setName('Maximum Database Size')
            .setDesc('Maximum size of the memory traces and snapshots database in MB (minimum: 100 MB)');
            
        let dbSizeInput: HTMLInputElement;
        let errorEl: HTMLElement;
        
        dbSizeSetting
            .addText(text => {
                dbSizeInput = text.inputEl;
                text
                    .setPlaceholder('500')
                    .setValue(String(this.settings.maxDbSize))
                    .onChange(async (value) => {
                        const numValue = Number(value);
                        
                        // Clear previous error styling
                        dbSizeInput.style.borderColor = '';
                        if (errorEl) {
                            errorEl.remove();
                        }
                        
                        if (value.trim() === '') {
                            // Empty value, show error
                            dbSizeInput.style.borderColor = 'var(--text-error)';
                            errorEl = dbSizeSetting.settingEl.createDiv({
                                text: 'Database size is required',
                                cls: 'setting-error'
                            });
                            return;
                        }
                        
                        if (isNaN(numValue)) {
                            // Invalid number, show error
                            dbSizeInput.style.borderColor = 'var(--text-error)';
                            errorEl = dbSizeSetting.settingEl.createDiv({
                                text: 'Please enter a valid number',
                                cls: 'setting-error'
                            });
                            return;
                        }
                        
                        if (numValue < 100) {
                            // Below minimum, show error
                            dbSizeInput.style.borderColor = 'var(--text-error)';
                            errorEl = dbSizeSetting.settingEl.createDiv({
                                text: 'Minimum database size is 100 MB',
                                cls: 'setting-error'
                            });
                            return;
                        }
                        
                        if (numValue > 10000) {
                            // Above reasonable maximum, show warning
                            dbSizeInput.style.borderColor = 'var(--text-warning)';
                            errorEl = dbSizeSetting.settingEl.createDiv({
                                text: 'Warning: Very large database size may impact performance',
                                cls: 'setting-warning'
                            });
                        }
                        
                        // Valid value, save it
                        this.settings.maxDbSize = numValue;
                        await this.saveSettings();
                        
                        // Show success feedback briefly
                        dbSizeInput.style.borderColor = 'var(--text-success)';
                        setTimeout(() => {
                            dbSizeInput.style.borderColor = '';
                        }, 1000);
                    });
            });
            
        new Setting(containerEl)
            .setName('Clean Orphaned Embeddings')
            .setDesc('Automatically clean up embeddings for deleted files')
            .addToggle(toggle => toggle
                .setValue(this.settings.autoCleanOrphaned)
                .onChange(async (value) => {
                    this.settings.autoCleanOrphaned = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Pruning Strategy')
            .setDesc('Strategy for removing embeddings when database is full')
            .addDropdown(dropdown => dropdown
                .addOption('oldest', 'Oldest Embeddings')
                .addOption('least-used', 'Least Used Embeddings')
                .addOption('manual', 'Manual Cleanup Only')
                .setValue(this.settings.pruningStrategy)
                .onChange(async (value: any) => {
                    this.settings.pruningStrategy = value;
                    await this.saveSettings();
                })
            );
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}