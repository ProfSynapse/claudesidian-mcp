/**
 * ContextProgressBar - Visual indicator of context window usage
 * 
 * Shows how much of the current model's context window is being used
 * by the conversation history, helping users understand when they're
 * approaching the limit.
 */

export interface ContextUsage {
  used: number;
  total: number;
  percentage: number;
}

export class ContextProgressBar {
  private element: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private usageText: HTMLElement | null = null;
  private currentUsage: ContextUsage = { used: 0, total: 0, percentage: 0 };

  constructor(
    private container: HTMLElement,
    private getContextUsage: () => Promise<ContextUsage>
  ) {
    this.render();
  }

  /**
   * Render the context progress bar
   */
  private render(): void {
    this.container.empty();
    this.container.addClass('context-progress-container');

    // Header
    const header = this.container.createDiv('context-progress-header');
    const label = header.createSpan('context-progress-label');
    label.textContent = 'Context Usage';

    this.usageText = header.createSpan('context-progress-usage');
    this.usageText.textContent = '0 / 0 tokens (0%)';

    // Progress bar container
    const progressContainer = this.container.createDiv('context-progress-bar-container');
    
    // Background bar
    const backgroundBar = progressContainer.createDiv('context-progress-bar-bg');
    
    // Progress bar (filled portion)
    this.progressBar = backgroundBar.createDiv('context-progress-bar-fill');
    this.progressBar.style.width = '0%';

    // Segments for visual indication
    this.createSegments(backgroundBar);

    this.element = this.container;
    this.updateDisplay();
  }

  /**
   * Create visual segments on the progress bar
   */
  private createSegments(container: HTMLElement): void {
    // Add segment markers at 25%, 50%, 75% for visual reference
    const segments = [25, 50, 75];
    
    segments.forEach(percent => {
      const segment = container.createDiv('context-progress-segment');
      segment.style.left = `${percent}%`;
    });
  }

  /**
   * Update the progress bar display
   */
  public async update(): Promise<void> {
    try {
      this.currentUsage = await this.getContextUsage();
      this.updateDisplay();
    } catch (error) {
      console.error('[ContextProgressBar] Failed to update context usage:', error);
    }
  }

  /**
   * Update the visual display
   */
  private updateDisplay(): void {
    if (!this.progressBar || !this.usageText) return;

    const { used, total, percentage } = this.currentUsage;

    // Update progress bar width
    this.progressBar.style.width = `${Math.min(percentage, 100)}%`;
    
    // Update color based on usage level
    this.progressBar.className = 'context-progress-bar-fill';
    
    if (percentage >= 90) {
      this.progressBar.addClass('context-critical'); // Red
    } else if (percentage >= 75) {
      this.progressBar.addClass('context-warning'); // Orange
    } else if (percentage >= 50) {
      this.progressBar.addClass('context-moderate'); // Yellow
    } else {
      this.progressBar.addClass('context-safe'); // Green
    }

    // Update usage text
    const usedFormatted = this.formatTokenCount(used);
    const totalFormatted = this.formatTokenCount(total);
    
    this.usageText.textContent = `${usedFormatted} / ${totalFormatted} tokens (${Math.round(percentage)}%)`;
    
    // Add tooltip with more details
    this.usageText.title = this.createTooltipText();
  }

  /**
   * Format token count for display
   */
  private formatTokenCount(tokens: number): string {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(1)}M`;
    } else if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}k`;
    } else {
      return tokens.toString();
    }
  }

  /**
   * Create detailed tooltip text
   */
  private createTooltipText(): string {
    const { used, total, percentage } = this.currentUsage;
    const remaining = total - used;
    
    return [
      `Context Window Usage`,
      `Used: ${used.toLocaleString()} tokens`,
      `Total: ${total.toLocaleString()} tokens`,
      `Remaining: ${remaining.toLocaleString()} tokens`,
      `Usage: ${percentage.toFixed(1)}%`
    ].join('\n');
  }

  /**
   * Set context usage directly (for immediate updates)
   */
  public setUsage(usage: ContextUsage): void {
    this.currentUsage = usage;
    this.updateDisplay();
  }

  /**
   * Get current usage
   */
  public getCurrentUsage(): ContextUsage {
    return { ...this.currentUsage };
  }

  /**
   * Show warning when approaching limit
   */
  public checkWarningThresholds(): void {
    const { percentage } = this.currentUsage;
    
    if (percentage >= 95) {
      this.showWarning('Context window nearly full. Consider starting a new conversation.', 'critical');
    } else if (percentage >= 85) {
      this.showWarning('Context window getting full. Responses may be truncated soon.', 'warning');
    }
  }

  /**
   * Show context usage warning
   */
  private showWarning(message: string, level: 'warning' | 'critical'): void {
    // Create temporary warning element
    const warning = document.createElement('div');
    warning.addClass('context-warning-message');
    warning.addClass(`context-warning-${level}`);
    warning.textContent = message;
    
    // Insert after the progress bar
    if (this.element) {
      this.element.appendChild(warning);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (warning.parentElement) {
          warning.remove();
        }
      }, 5000);
    }
  }

  /**
   * Reset usage (for new conversations)
   */
  public reset(): void {
    this.currentUsage = { used: 0, total: 0, percentage: 0 };
    this.updateDisplay();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.element = null;
    this.progressBar = null;
    this.usageText = null;
  }
}