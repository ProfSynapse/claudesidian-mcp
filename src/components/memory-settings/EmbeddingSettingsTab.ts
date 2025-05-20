import { Setting } from 'obsidian';
import { BaseSettingsTab } from './BaseSettingsTab';

/**
 * Embedding Settings tab component
 * Handles content chunking, indexing schedules, and performance settings
 */
export class EmbeddingSettingsTab extends BaseSettingsTab {
    /**
     * Display the embedding settings tab
     */
    display(containerEl: HTMLElement): void {
        containerEl.createEl('h3', { text: 'Content Chunking' });
        
        new Setting(containerEl)
            .setName('Chunking Strategy')
            .setDesc('How to divide your notes into chunks for embedding')
            .addDropdown(dropdown => dropdown
                .addOption('paragraph', 'By Paragraph (recommended)')
                .addOption('heading', 'By Heading')
                .addOption('fixed-size', 'Fixed Size')
                .addOption('sliding-window', 'Sliding Window')
                .setValue(this.settings.chunkStrategy)
                .onChange(async (value: any) => {
                    this.settings.chunkStrategy = value;
                    await this.saveSettings();
                })
            );
        
        new Setting(containerEl)
            .setName('Maximum Chunk Size')
            .setDesc('Maximum number of tokens per chunk (larger chunks provide more context but cost more)')
            .addSlider(slider => slider
                .setLimits(128, 8000, 128)
                .setValue(this.settings.chunkSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.chunkSize = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Chunk Overlap')
            .setDesc('Number of tokens to overlap between chunks (helps maintain context)')
            .addSlider(slider => slider
                .setLimits(0, 200, 10)
                .setValue(this.settings.chunkOverlap)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.chunkOverlap = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Include Frontmatter')
            .setDesc('Include frontmatter in generated embeddings')
            .addToggle(toggle => toggle
                .setValue(this.settings.includeFrontmatter)
                .onChange(async (value) => {
                    this.settings.includeFrontmatter = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Minimum Content Length')
            .setDesc('Minimum length (in characters) required to create a chunk')
            .addText(text => text
                .setPlaceholder('50')
                .setValue(String(this.settings.minContentLength))
                .onChange(async (value) => {
                    const numValue = Number(value);
                    if (!isNaN(numValue) && numValue >= 0) {
                        this.settings.minContentLength = numValue;
                        await this.saveSettings();
                    }
                })
            );
            
        containerEl.createEl('h3', { text: 'Indexing Schedule' });
        
        new Setting(containerEl)
            .setName('When to Index')
            .setDesc('When should notes be indexed')
            .addDropdown(dropdown => dropdown
                .addOption('on-save', 'When Notes are Saved')
                .addOption('manual', 'Only Manually')
                // Future options to be implemented
                // .addOption('daily', 'Daily')
                // .addOption('weekly', 'Weekly')
                .setValue(this.settings.indexingSchedule)
                .onChange(async (value: any) => {
                    this.settings.indexingSchedule = value;
                    await this.saveSettings();
                })
            );
            
        // Add Embedding Strategy dropdown
        new Setting(containerEl)
            .setName('Embedding Strategy')
            .setDesc('How should new or modified notes be automatically embedded')
            .addDropdown(dropdown => dropdown
                .addOption('manual', 'Manual Only (No auto-embedding)')
                .addOption('idle', 'Idle (Embed after period of inactivity)')
                .addOption('startup', 'Startup (Embed non-indexed files on startup)')
                .setValue(this.settings.embeddingStrategy || 'manual')
                .onChange(async (value) => {
                    this.settings.embeddingStrategy = value as 'manual' | 'idle' | 'startup';
                    await this.saveSettings();
                    // Trigger re-render if needed
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged();
                    }
                })
            );
            
        // Show idle threshold setting only when idle strategy is selected
        if (this.settings.embeddingStrategy === 'idle') {
            new Setting(containerEl)
                .setName('Idle Time Threshold')
                .setDesc('How long to wait (in seconds) after the last change before embedding')
                .addSlider(slider => slider
                    .setLimits(5, 300, 5)
                    .setValue(this.settings.idleTimeThreshold ? this.settings.idleTimeThreshold / 1000 : 60) // Convert from ms to seconds
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.settings.idleTimeThreshold = value * 1000; // Convert to ms for storage
                        await this.saveSettings();
                    })
                )
                .addExtraButton(button => {
                    button
                        .setIcon('reset')
                        .setTooltip('Reset to default (60 seconds)')
                        .onClick(async () => {
                            this.settings.idleTimeThreshold = 60000;
                            await this.saveSettings();
                            if (this.onSettingsChanged) {
                                this.onSettingsChanged();
                            }
                        });
                });
        }
            
        containerEl.createEl('h3', { text: 'Performance' });
        
        new Setting(containerEl)
            .setName('Batch Size')
            .setDesc('Number of chunks to process at once during batch operations')
            .addSlider(slider => slider
                .setLimits(1, 50, 1)
                .setValue(this.settings.batchSize)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.batchSize = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Concurrent Requests')
            .setDesc('Number of concurrent API requests (higher values may cause rate limiting)')
            .addSlider(slider => slider
                .setLimits(1, 10, 1)
                .setValue(this.settings.concurrentRequests)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.concurrentRequests = value;
                    await this.saveSettings();
                })
            );
            
        new Setting(containerEl)
            .setName('Processing Delay')
            .setDesc('Milliseconds to wait between batches (larger values reduce freezing but slow down indexing)')
            .addSlider(slider => slider
                .setLimits(0, 5000, 100)
                .setValue(this.settings.processingDelay || 1000)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.settings.processingDelay = value;
                    await this.saveSettings();
                })
            );
    }
    
    // Optional callback for when settings change
    onSettingsChanged?: () => void;
}