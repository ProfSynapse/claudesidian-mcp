import { Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';

/**
 * Advanced Settings tab component
 * Handles database settings and advanced configuration
 */
export class AdvancedSettingsTab extends BaseSettingsTab {
    /**
     * Display the advanced settings tab
     */
    display(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Database Settings' });
            
        new Setting(containerEl)
            .setName('Maximum Database Size')
            .setDesc('Maximum size of the database in MB')
            .addSlider(slider => slider
                .setLimits(100, 2000, 100)
                .setValue(this.settings.maxDbSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.maxDbSize = value;
                    await this.saveSettings();
                })
            );
            
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
}