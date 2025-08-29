/**
 * ToolAccordion - Expandable display for tool executions
 * 
 * Shows tool calls and results in an accordion format
 */

import { ToolCall } from '../../../types/chat/ChatTypes';

export class ToolAccordion {
  private element: HTMLElement | null = null;
  private isExpanded = false;

  constructor(private toolCalls: ToolCall[]) {}

  /**
   * Create the tool accordion element
   */
  createElement(): HTMLElement {
    const accordion = document.createElement('div');
    accordion.addClass('tool-accordion');

    // Header with summary
    const header = accordion.createDiv('tool-accordion-header');
    header.addEventListener('click', () => this.toggle());

    // Tool count and status
    const summary = header.createDiv('tool-summary');
    const successCount = this.toolCalls.filter(tool => tool.success).length;
    const totalCount = this.toolCalls.length;
    
    const status = successCount === totalCount ? 'success' : 'partial';
    summary.addClass(`tool-status-${status}`);
    
    // Icon
    const icon = summary.createSpan('tool-icon');
    icon.textContent = status === 'success' ? '✅' : '⚠️';
    
    // Text
    const text = summary.createSpan('tool-text');
    if (totalCount === 1) {
      text.textContent = this.toolCalls[0].name;
    } else {
      const toolNames = this.toolCalls.map(tc => tc.name).slice(0, 2);
      const remaining = totalCount - 2;
      if (remaining > 0) {
        text.textContent = `${toolNames.join(', ')} +${remaining} more`;
      } else {
        text.textContent = toolNames.join(', ');
      }
    }
    
    // Expand indicator
    const expandIcon = header.createDiv('tool-expand-icon');
    expandIcon.textContent = '▶';

    // Content (initially hidden)
    const content = accordion.createDiv('tool-accordion-content');
    content.style.display = 'none';

    // Render tool calls
    this.toolCalls.forEach((toolCall, index) => {
      const toolItem = this.createToolCallItem(toolCall, index);
      content.appendChild(toolItem);
    });

    this.element = accordion;
    return accordion;
  }

  /**
   * Create individual tool call display
   */
  private createToolCallItem(toolCall: ToolCall, index: number): HTMLElement {
    const item = document.createElement('div');
    item.addClass('tool-call-item');
    item.addClass(toolCall.success ? 'tool-success' : 'tool-error');

    // Tool header
    const header = item.createDiv('tool-call-header');
    
    // Status indicator
    const statusIcon = header.createSpan('tool-status-icon');
    statusIcon.textContent = toolCall.success ? '✅' : '❌';
    
    // Tool name
    const name = header.createSpan('tool-name');
    name.textContent = toolCall.name;
    
    // Execution time (if available) 
    if (toolCall.executionTime) {
      const meta = header.createSpan('tool-meta');
      meta.textContent = `${toolCall.executionTime}ms`;
    }

    // Parameters section
    if (toolCall.parameters && Object.keys(toolCall.parameters).length > 0) {
      const paramsSection = item.createDiv('tool-section');
      const paramsHeader = paramsSection.createDiv('tool-section-header');
      paramsHeader.textContent = 'Parameters:';
      
      const paramsContent = paramsSection.createEl('pre', { cls: 'tool-code' });
      paramsContent.textContent = JSON.stringify(toolCall.parameters, null, 2);
    }

    // Result section
    if (toolCall.result) {
      const resultSection = item.createDiv('tool-section');
      const resultHeader = resultSection.createDiv('tool-section-header');
      resultHeader.textContent = 'Result:';
      
      const resultContent = resultSection.createEl('pre', { cls: 'tool-code' });
      
      // Format result based on type
      if (typeof toolCall.result === 'string') {
        resultContent.textContent = toolCall.result;
      } else {
        resultContent.textContent = JSON.stringify(toolCall.result, null, 2);
      }
    }

    // Error section
    if (!toolCall.success && toolCall.error) {
      const errorSection = item.createDiv('tool-section tool-error-section');
      const errorHeader = errorSection.createDiv('tool-section-header');
      errorHeader.textContent = 'Error:';
      
      const errorContent = errorSection.createDiv('tool-error-content');
      errorContent.textContent = toolCall.error;
    }

    return item;
  }

  /**
   * Toggle accordion expansion
   */
  private toggle(): void {
    if (!this.element) return;

    this.isExpanded = !this.isExpanded;
    
    const content = this.element.querySelector('.tool-accordion-content') as HTMLElement;
    const expandIcon = this.element.querySelector('.tool-expand-icon') as HTMLElement;
    
    if (this.isExpanded) {
      content.style.display = 'block';
      expandIcon.textContent = '▼';
      this.element.addClass('expanded');
    } else {
      content.style.display = 'none';
      expandIcon.textContent = '▶';
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
   * Cleanup resources
   */
  cleanup(): void {
    this.element = null;
  }
}