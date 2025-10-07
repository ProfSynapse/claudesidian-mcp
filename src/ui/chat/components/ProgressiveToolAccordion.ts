/**
 * ProgressiveToolAccordion - Real-time tool execution display
 *
 * Shows tool execution progress in real-time with visual feedback:
 * - Shows tools as they start executing (glow effect)
 * - Updates with results as they complete
 * - Provides rich visual feedback during execution
 */

import { setIcon } from 'obsidian';

export interface ProgressiveToolCall {
  id: string;
  name: string;
  parameters?: any;
  status: 'pending' | 'streaming' | 'executing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  executionTime?: number;
  startTime?: number;
  parametersComplete?: boolean; // True when parameters are fully streamed
}

export class ProgressiveToolAccordion {
  private element: HTMLElement | null = null;
  private isExpanded = false;
  private tools: ProgressiveToolCall[] = [];

  constructor() {}

  /**
   * Create the progressive tool accordion element
   */
  createElement(): HTMLElement {
    const accordion = document.createElement('div');
    accordion.addClass('progressive-tool-accordion');

    // Header with summary (initially hidden until first tool)
    const header = accordion.createDiv('progressive-tool-header');
    header.addEventListener('click', () => this.toggle());
    header.style.display = 'none'; // Hidden until first tool starts

    // Status summary
    const summary = header.createDiv('tool-summary');
    
    // Icon (will update based on status)
    const icon = summary.createSpan('tool-icon');
    
    // Text (will update as tools execute)
    const text = summary.createSpan('tool-text');
    
    // Expand indicator
    const expandIcon = header.createDiv('tool-expand-icon');
    setIcon(expandIcon, 'chevron-right');

    // Content (initially hidden)
    const content = accordion.createDiv('progressive-tool-content');
    content.style.display = 'none';

    this.element = accordion;
    return accordion;
  }

  /**
   * Detect a tool (parameters streaming) - shows it immediately with streaming state
   */
  detectTool(toolCall: { id: string; name: string; parameters?: any; isComplete?: boolean }): void {
    // Check if tool already exists
    const existingTool = this.tools.find(t => t.id === toolCall.id);
    if (existingTool) {
      // Tool already detected, just update parameters
      this.updateToolParameters(toolCall.id, toolCall.parameters, toolCall.isComplete || false);
      return;
    }

    const progressiveTool: ProgressiveToolCall = {
      id: toolCall.id,
      name: toolCall.name,
      parameters: toolCall.parameters,
      status: toolCall.isComplete ? 'pending' : 'streaming',
      parametersComplete: toolCall.isComplete || false,
      startTime: Date.now()
    };

    this.tools.push(progressiveTool);
    this.updateDisplay();
    this.renderToolItem(progressiveTool);
  }

  /**
   * Update tool parameters during streaming
   */
  updateToolParameters(toolId: string, parameters: any, isComplete: boolean): void {
    const tool = this.tools.find(t => t.id === toolId);
    if (!tool) return;

    tool.parameters = parameters;
    tool.parametersComplete = isComplete;

    if (isComplete && tool.status === 'streaming') {
      tool.status = 'pending'; // Ready to execute
    }

    this.updateDisplay();
    this.updateToolItemParameters(tool);
  }

  /**
   * Start executing a tool - shows it immediately with glow effect
   */
  startTool(toolCall: { id: string; name: string; parameters?: any }): void {
    const tool = this.tools.find(t => t.id === toolCall.id);
    if (tool) {
      // Tool already exists from detection, just update status
      tool.status = 'executing';
      tool.startTime = Date.now();
      this.updateDisplay();
      this.updateToolItem(tool);
    } else {
      // New tool execution (legacy path)
      const progressiveTool: ProgressiveToolCall = {
        id: toolCall.id,
        name: toolCall.name,
        parameters: toolCall.parameters,
        status: 'executing',
        parametersComplete: true,
        startTime: Date.now()
      };

      this.tools.push(progressiveTool);
      this.updateDisplay();
      this.renderToolItem(progressiveTool);
    }
  }

  /**
   * Complete a tool execution with results
   */
  completeTool(toolId: string, result: any, success: boolean, error?: string): void {
    const tool = this.tools.find(t => t.id === toolId);
    if (!tool) return;

    tool.status = success ? 'completed' : 'failed';
    tool.result = result;
    tool.error = error;
    if (tool.startTime) {
      tool.executionTime = Date.now() - tool.startTime;
    }

    this.updateDisplay();
    this.updateToolItem(tool);
  }

  /**
   * Update the header display based on current tools
   */
  private updateDisplay(): void {
    if (!this.element) return;

    const header = this.element.querySelector('.progressive-tool-header') as HTMLElement;
    const icon = this.element.querySelector('.tool-icon') as HTMLElement;
    const text = this.element.querySelector('.tool-text') as HTMLElement;

    if (this.tools.length === 0) {
      header.style.display = 'none';
      return;
    }

    header.style.display = 'flex';

    const executing = this.tools.filter(t => t.status === 'executing');
    const completed = this.tools.filter(t => t.status === 'completed');
    const failed = this.tools.filter(t => t.status === 'failed');
    const total = this.tools.length;

    // Update icon based on status with color states
    if (executing.length > 0) {
      icon.empty();
      setIcon(icon, 'loader'); // Executing - spinning
      icon.addClass('tool-executing');
      icon.removeClass('tool-success', 'tool-failed');
      header.addClass('tool-executing');
    } else if (failed.length > 0) {
      icon.empty();
      setIcon(icon, 'alert-triangle'); // Some failed - orange
      icon.addClass('tool-failed');
      icon.removeClass('tool-executing', 'tool-success');
      header.removeClass('tool-executing');
    } else {
      icon.empty();
      setIcon(icon, 'check-circle'); // All completed - green
      icon.addClass('tool-success');
      icon.removeClass('tool-executing', 'tool-failed');
      header.removeClass('tool-executing');
    }

    // Update text based on tool names and status
    if (total === 1) {
      const tool = this.tools[0];
      if (tool.status === 'executing') {
        text.textContent = `${tool.name} (running...)`;
      } else {
        text.textContent = tool.name;
      }
    } else {
      const runningTools = executing.map(t => t.name).slice(0, 2);
      if (executing.length > 0) {
        if (executing.length === 1) {
          text.textContent = `${runningTools[0]} (running...) +${total - 1} more`;
        } else {
          text.textContent = `${runningTools.join(', ')} +${total - 2} more (running...)`;
        }
      } else {
        const toolNames = this.tools.map(t => t.name).slice(0, 2);
        const remaining = total - 2;
        if (remaining > 0) {
          text.textContent = `${toolNames.join(', ')} +${remaining} more`;
        } else {
          text.textContent = toolNames.join(', ');
        }
      }
    }
  }

  /**
   * Render individual tool execution item
   */
  private renderToolItem(tool: ProgressiveToolCall): void {
    if (!this.element) return;

    const content = this.element.querySelector('.progressive-tool-content') as HTMLElement;
    
    const item = document.createElement('div');
    item.addClass('progressive-tool-item');
    item.addClass(`tool-${tool.status}`);
    item.setAttribute('data-tool-id', tool.id);

    // Tool header
    const header = item.createDiv('progressive-tool-header-item');

    // Tool name (no status icon - it's in the accordion header now)
    const name = header.createSpan('tool-name');
    name.textContent = tool.name;
    
    // Execution info
    const meta = header.createSpan('tool-meta');
    this.updateExecutionMeta(meta, tool);

    // Parameters section (collapsible)
    if (tool.parameters && Object.keys(tool.parameters).length > 0) {
      const paramsSection = item.createDiv('tool-section');
      const paramsHeader = paramsSection.createDiv('tool-section-header');
      paramsHeader.textContent = 'Parameters:';
      
      const paramsContent = paramsSection.createEl('pre', { cls: 'tool-code' });
      paramsContent.textContent = JSON.stringify(tool.parameters, null, 2);
    }

    // Result section (will be filled when completed)
    const resultSection = item.createDiv('tool-section tool-result-section');
    resultSection.setAttribute('data-result-section', tool.id);
    resultSection.style.display = 'none'; // Hidden until completed

    // Error section (will be shown if failed)
    const errorSection = item.createDiv('tool-section tool-error-section');
    errorSection.setAttribute('data-error-section', tool.id);
    errorSection.style.display = 'none'; // Hidden unless failed

    content.appendChild(item);
  }

  /**
   * Update existing tool item when execution completes
   */
  private updateToolItem(tool: ProgressiveToolCall): void {
    if (!this.element) return;

    const item = this.element.querySelector(`[data-tool-id="${tool.id}"]`) as HTMLElement;
    if (!item) return;

    // Update status classes
    item.className = item.className.replace(/tool-(pending|streaming|executing|completed|failed)/g, '');
    item.addClass(`tool-${tool.status}`);

    // Update execution meta (status icon removed - now only in accordion header)
    const meta = item.querySelector('.tool-meta') as HTMLElement;
    this.updateExecutionMeta(meta, tool);

    // Show result section if completed successfully
    if (tool.status === 'completed' && tool.result) {
      const resultSection = item.querySelector(`[data-result-section="${tool.id}"]`) as HTMLElement;
      resultSection.style.display = 'block';
      
      const resultHeader = resultSection.createDiv('tool-section-header');
      resultHeader.textContent = 'Result:';
      
      const resultContent = resultSection.createEl('pre', { cls: 'tool-code' });
      if (typeof tool.result === 'string') {
        resultContent.textContent = tool.result;
      } else {
        resultContent.textContent = JSON.stringify(tool.result, null, 2);
      }
    }

    // Show error section if failed
    if (tool.status === 'failed' && tool.error) {
      const errorSection = item.querySelector(`[data-error-section="${tool.id}"]`) as HTMLElement;
      errorSection.style.display = 'block';
      
      const errorHeader = errorSection.createDiv('tool-section-header');
      errorHeader.textContent = 'Error:';
      
      const errorContent = errorSection.createDiv('tool-error-content');
      errorContent.textContent = tool.error;
    }
  }

  /**
   * Update tool item parameters display during streaming
   */
  private updateToolItemParameters(tool: ProgressiveToolCall): void {
    if (!this.element) return;

    const item = this.element.querySelector(`[data-tool-id="${tool.id}"]`) as HTMLElement;
    if (!item) return;

    // Find the parameters section
    const paramsContent = item.querySelector('.tool-code') as HTMLElement;
    if (!paramsContent) return;

    // Parse parameters for display
    let displayText = '';
    try {
      const params = typeof tool.parameters === 'string'
        ? JSON.parse(tool.parameters)
        : tool.parameters;
      displayText = JSON.stringify(params, null, 2);
    } catch {
      // If parsing fails, show raw parameters
      displayText = typeof tool.parameters === 'string'
        ? tool.parameters
        : JSON.stringify(tool.parameters);
    }

    paramsContent.textContent = displayText;

    // Update streaming indicator
    let streamingIndicator = paramsContent.nextElementSibling as HTMLElement;

    if (!tool.parametersComplete) {
      // Add or update streaming indicator
      if (!streamingIndicator || !streamingIndicator.hasClass('tool-streaming-indicator')) {
        streamingIndicator = paramsContent.parentElement!.createDiv('tool-streaming-indicator');
        streamingIndicator.textContent = '⋯ streaming parameters';
      }
      paramsContent.addClass('tool-parameters-streaming');
    } else {
      // Remove streaming indicator
      if (streamingIndicator && streamingIndicator.hasClass('tool-streaming-indicator')) {
        streamingIndicator.remove();
      }
      paramsContent.removeClass('tool-parameters-streaming');
    }

    // Update status classes (status icon removed - now only in accordion header)
    item.className = item.className.replace(/tool-(pending|streaming|executing|completed|failed)/g, '');
    item.addClass(`tool-${tool.status}`);
  }

  /**
   * Update execution metadata display
   */
  private updateExecutionMeta(metaElement: HTMLElement, tool: ProgressiveToolCall): void {
    switch (tool.status) {
      case 'executing':
        if (tool.startTime) {
          const elapsed = Date.now() - tool.startTime;
          metaElement.textContent = `${Math.round(elapsed / 100) / 10}s`;
        }
        break;
      case 'completed':
      case 'failed':
        if (tool.executionTime) {
          metaElement.textContent = `${tool.executionTime}ms`;
        }
        break;
    }
  }

  /**
   * Toggle accordion expansion
   */
  private toggle(): void {
    if (!this.element) return;

    this.isExpanded = !this.isExpanded;
    
    const content = this.element.querySelector('.progressive-tool-content') as HTMLElement;
    const expandIcon = this.element.querySelector('.tool-expand-icon') as HTMLElement;
    
    if (this.isExpanded) {
      content.style.display = 'block';
      expandIcon.empty();
      setIcon(expandIcon, 'chevron-down');
      this.element.addClass('expanded');
    } else {
      content.style.display = 'none';
      expandIcon.empty();
      setIcon(expandIcon, 'chevron-right');
      this.element.removeClass('expanded');
    }
  }

  /**
   * Get the DOM element
   */
  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Get current tool status summary
   */
  getToolSummary(): { total: number; executing: number; completed: number; failed: number } {
    return {
      total: this.tools.length,
      executing: this.tools.filter(t => t.status === 'executing').length,
      completed: this.tools.filter(t => t.status === 'completed').length,
      failed: this.tools.filter(t => t.status === 'failed').length
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.tools = [];
    this.element = null;
  }
}