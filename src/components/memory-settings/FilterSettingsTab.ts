import { Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';

/**
 * Filter Settings tab component
 * Handles exclude patterns and search preferences
 */
export class FilterSettingsTab extends BaseSettingsTab {
    /**
     * Display the filter settings tab
     */
    display(containerEl: HTMLElement): void {
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
    }
}