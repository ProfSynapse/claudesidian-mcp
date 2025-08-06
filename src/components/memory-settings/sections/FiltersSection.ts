import { Setting } from 'obsidian';

/**
 * Location: src/components/memory-settings/sections/FiltersSection.ts
 * 
 * FiltersSection component handles file exclusion pattern configuration including:
 * - Exclude patterns textarea with glob format support
 * - Pattern validation and formatting
 * - Real-time pattern parsing and storage
 * - User guidance for glob pattern syntax
 * 
 * Used by: EmbeddingSettingsTab for exclude patterns section
 * Dependencies: Obsidian Setting
 */
export class FiltersSection {
    constructor(
        private settings: any,
        private saveSettings: () => Promise<void>
    ) {}

    /**
     * Renders the file exclusion filters section
     */
    async display(containerEl: HTMLElement): Promise<void> {
        // Add section description
        this.renderSectionDescription(containerEl);
        
        // Exclude patterns textarea
        await this.renderExcludePatterns(containerEl);
        
        // Add pattern examples and help
        this.renderPatternHelp(containerEl);
    }

    /**
     * Renders the section description
     */
    private renderSectionDescription(containerEl: HTMLElement): void {
        const descEl = containerEl.createEl('p', {
            cls: 'setting-item-description',
            text: 'Configure which files and folders to exclude from embedding indexing. Use glob patterns to match file paths.'
        });
    }

    /**
     * Renders the exclude patterns textarea setting
     */
    private async renderExcludePatterns(containerEl: HTMLElement): Promise<void> {
        const excludePatternsSetting = new Setting(containerEl)
            .setName('Exclude Patterns')
            .setDesc('Exclude files matching these patterns (glob format, one per line)');
            
        const excludeTextarea = excludePatternsSetting.controlEl.createEl('textarea', {
            cls: 'memory-settings-textarea',
            attr: {
                rows: '6',
                placeholder: 'Enter exclude patterns, one per line:\n*.tmp\nDrafts/**\n.obsidian/**\nPrivate Notes/*'
            }
        });
        
        // Set current value
        excludeTextarea.value = this.settings.excludePaths.join('\n');
        
        // Handle changes
        excludeTextarea.addEventListener('input', async () => {
            await this.handlePatternChange(excludeTextarea);
        });
        
        excludeTextarea.addEventListener('blur', async () => {
            await this.handlePatternChange(excludeTextarea);
        });
    }

    /**
     * Renders pattern help and examples
     */
    private renderPatternHelp(containerEl: HTMLElement): void {
        const helpContainer = containerEl.createDiv({ cls: 'exclude-patterns-help' });
        
        // Pattern examples
        const examplesEl = helpContainer.createEl('details');
        const summaryEl = examplesEl.createEl('summary', { text: 'Pattern Examples' });
        
        const examplesList = examplesEl.createEl('ul');
        
        const examples = [
            { pattern: '*.tmp', description: 'Exclude all .tmp files' },
            { pattern: 'Drafts/**', description: 'Exclude entire Drafts folder and subfolders' },
            { pattern: 'Private/**/*', description: 'Exclude all files in Private folder tree' },
            { pattern: '.obsidian/**', description: 'Exclude Obsidian configuration folder' },
            { pattern: '**/Archive/*', description: 'Exclude Archive folders at any level' },
            { pattern: '!Important.md', description: 'Never exclude Important.md (negation pattern)' }
        ];
        
        examples.forEach(example => {
            const listItem = examplesList.createEl('li');
            const codeEl = listItem.createEl('code', { text: example.pattern });
            listItem.appendText(` - ${example.description}`);
        });
        
        // Pattern syntax help
        const syntaxEl = helpContainer.createEl('details');
        syntaxEl.createEl('summary', { text: 'Glob Pattern Syntax' });
        
        const syntaxList = syntaxEl.createEl('ul');
        const syntaxRules = [
            { symbol: '*', description: 'Matches any number of characters except /' },
            { symbol: '**', description: 'Matches any number of characters including /' },
            { symbol: '?', description: 'Matches exactly one character' },
            { symbol: '[abc]', description: 'Matches any one character in brackets' },
            { symbol: '!pattern', description: 'Negates the pattern (files that match will NOT be excluded)' }
        ];
        
        syntaxRules.forEach(rule => {
            const listItem = syntaxList.createEl('li');
            const codeEl = listItem.createEl('code', { text: rule.symbol });
            listItem.appendText(` - ${rule.description}`);
        });
        
        // Performance tip
        const tipEl = helpContainer.createEl('div', { cls: 'exclude-patterns-tip' });
        tipEl.createEl('strong', { text: 'Tip: ' });
        tipEl.appendText('More specific patterns improve performance. Use folder exclusions (e.g., "Folder/**") rather than file extension patterns when possible.');
    }

    /**
     * Handles changes to exclude patterns with validation
     */
    private async handlePatternChange(textarea: HTMLTextAreaElement): Promise<void> {
        const rawPatterns = textarea.value.split('\n');
        const patterns = this.parseAndValidatePatterns(rawPatterns);
        
        // Update settings
        this.settings.excludePaths = patterns.valid;
        await this.saveSettings();
        
        // Provide visual feedback for invalid patterns
        this.updateTextareaFeedback(textarea, patterns);
    }

    /**
     * Parses and validates exclude patterns
     */
    private parseAndValidatePatterns(rawPatterns: string[]): {
        valid: string[],
        invalid: { pattern: string, reason: string }[]
    } {
        const valid: string[] = [];
        const invalid: { pattern: string, reason: string }[] = [];
        
        rawPatterns.forEach(pattern => {
            const trimmed = pattern.trim();
            
            // Skip empty lines
            if (trimmed.length === 0) {
                return;
            }
            
            // Skip comments (lines starting with #)
            if (trimmed.startsWith('#')) {
                return;
            }
            
            // Basic validation
            const validation = this.validatePattern(trimmed);
            if (validation.isValid) {
                valid.push(trimmed);
            } else {
                invalid.push({ pattern: trimmed, reason: validation.reason });
            }
        });
        
        return { valid, invalid };
    }

    /**
     * Validates a single exclude pattern
     */
    private validatePattern(pattern: string): { isValid: boolean, reason: string } {
        // Check for obviously invalid patterns
        if (pattern.includes('\\')) {
            return { isValid: false, reason: 'Use forward slashes (/) instead of backslashes (\\)' };
        }
        
        if (pattern.startsWith('/')) {
            return { isValid: false, reason: 'Patterns should not start with /' };
        }
        
        if (pattern.includes('//')) {
            return { isValid: false, reason: 'Double slashes (//) are not valid' };
        }
        
        // Check for potentially problematic patterns
        if (pattern === '*' || pattern === '**') {
            return { isValid: false, reason: 'Pattern would exclude all files' };
        }
        
        if (pattern.length > 200) {
            return { isValid: false, reason: 'Pattern is too long (max 200 characters)' };
        }
        
        // Pattern appears valid
        return { isValid: true, reason: '' };
    }

    /**
     * Updates textarea visual feedback based on pattern validation
     */
    private updateTextareaFeedback(textarea: HTMLTextAreaElement, patterns: { valid: string[], invalid: { pattern: string, reason: string }[] }): void {
        // Remove existing feedback
        const existingFeedback = textarea.parentElement?.querySelector('.pattern-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }
        
        // Add new feedback if there are invalid patterns
        if (patterns.invalid.length > 0) {
            const feedbackEl = textarea.parentElement?.createEl('div', { cls: 'pattern-feedback pattern-feedback-error' });
            if (feedbackEl) {
                feedbackEl.createEl('strong', { text: 'Invalid patterns found:' });
                const errorList = feedbackEl.createEl('ul');
                
                patterns.invalid.forEach(error => {
                    const listItem = errorList.createEl('li');
                    const codeEl = listItem.createEl('code', { text: error.pattern });
                    listItem.appendText(` - ${error.reason}`);
                });
            }
            
            // Add error styling to textarea
            textarea.style.borderColor = 'var(--text-error)';
        } else {
            // Remove error styling
            textarea.style.borderColor = '';
            
            // Show success feedback for valid patterns
            if (patterns.valid.length > 0) {
                const feedbackEl = textarea.parentElement?.createEl('div', { cls: 'pattern-feedback pattern-feedback-success' });
                if (feedbackEl) {
                    feedbackEl.textContent = `✓ ${patterns.valid.length} valid pattern${patterns.valid.length !== 1 ? 's' : ''}`;
                    
                    // Remove after 2 seconds
                    setTimeout(() => {
                        feedbackEl.remove();
                    }, 2000);
                }
            }
        }
    }
}