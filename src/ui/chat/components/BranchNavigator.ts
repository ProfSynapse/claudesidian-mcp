/**
 * BranchNavigator - UI component for navigating between conversation branches
 * 
 * Shows branch indicators like "< 2/4 >" with navigation arrows
 * Only displays when conversation has multiple branches
 */

import { ConversationData } from '../../../types/chat/ChatTypes';
import { BranchManager } from '../services/BranchManager';

export interface BranchNavigatorEvents {
  onBranchChanged: (branchId: string) => void;
  onError: (message: string) => void;
}

export class BranchNavigator {
  private container: HTMLElement;
  private branchIndicator!: HTMLElement;
  private prevButton!: HTMLButtonElement;
  private nextButton!: HTMLButtonElement;
  private currentConversation: ConversationData | null = null;

  constructor(
    container: HTMLElement,
    private branchManager: BranchManager,
    private events: BranchNavigatorEvents
  ) {
    this.container = container;
    this.createBranchNavigator();
  }

  /**
   * Create the branch navigation UI
   */
  private createBranchNavigator(): void {
    this.container.addClass('branch-navigator');
    this.container.addClass('branch-navigator-hidden'); // Hidden by default

    // Previous branch button
    this.prevButton = this.container.createEl('button', {
      cls: 'branch-nav-button branch-nav-prev',
      attr: { 
        'aria-label': 'Previous branch',
        'title': 'Go to previous branch'
      }
    });
    this.prevButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15,18 9,12 15,6"></polyline>
      </svg>
    `;

    // Branch indicator (shows current/total like "2/4")
    this.branchIndicator = this.container.createDiv('branch-indicator');
    this.branchIndicator.textContent = '1/1';

    // Next branch button
    this.nextButton = this.container.createEl('button', {
      cls: 'branch-nav-button branch-nav-next',
      attr: { 
        'aria-label': 'Next branch',
        'title': 'Go to next branch'
      }
    });
    this.nextButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9,18 15,12 9,6"></polyline>
      </svg>
    `;

    // Event listeners
    this.prevButton.addEventListener('click', () => this.handlePreviousBranch());
    this.nextButton.addEventListener('click', () => this.handleNextBranch());
  }

  /**
   * Update the branch navigator for a new conversation
   */
  updateConversation(conversation: ConversationData | null): void {
    this.currentConversation = conversation;
    this.updateDisplay();
  }

  /**
   * Update the display based on current conversation
   */
  private updateDisplay(): void {
    if (!this.currentConversation) {
      this.hide();
      return;
    }

    const navigationInfo = this.branchManager.getBranchNavigationInfo(this.currentConversation);
    
    // Debug: Navigation display updated
    
    // Only show if there are multiple branches
    if (!navigationInfo.hasMultiple) {
      this.hide();
      return;
    }

    // Show and update the indicator
    this.show();
    this.branchIndicator.textContent = `${navigationInfo.current}/${navigationInfo.total}`;
    
    // Update button states
    this.updateButtonStates(navigationInfo);
  }

  /**
   * Update navigation button states
   */
  private updateButtonStates(navigationInfo: { current: number; total: number }): void {
    // Enable/disable buttons based on position
    const isFirst = navigationInfo.current === 1;
    const isLast = navigationInfo.current === navigationInfo.total;
    
    this.prevButton.disabled = isFirst;
    this.nextButton.disabled = isLast;
    
    // Update visual states
    this.prevButton.toggleClass('disabled', isFirst);
    this.nextButton.toggleClass('disabled', isLast);
  }

  /**
   * Handle previous branch navigation
   */
  private async handlePreviousBranch(): Promise<void> {
    if (!this.currentConversation) return;
    
    const previousBranchId = this.branchManager.getPreviousBranch(this.currentConversation);
    if (!previousBranchId) return;

    try {
      const success = await this.branchManager.switchToBranch(this.currentConversation, previousBranchId);
      if (success) {
        this.events.onBranchChanged(previousBranchId);
        this.updateDisplay();
      } else {
        this.events.onError('Failed to switch to previous branch');
      }
    } catch (error) {
      console.error('[BranchNavigator] Error switching to previous branch:', error);
      this.events.onError('Error switching branches');
    }
  }

  /**
   * Handle next branch navigation
   */
  private async handleNextBranch(): Promise<void> {
    if (!this.currentConversation) return;
    
    const nextBranchId = this.branchManager.getNextBranch(this.currentConversation);
    if (!nextBranchId) return;

    try {
      const success = await this.branchManager.switchToBranch(this.currentConversation, nextBranchId);
      if (success) {
        this.events.onBranchChanged(nextBranchId);
        this.updateDisplay();
      } else {
        this.events.onError('Failed to switch to next branch');
      }
    } catch (error) {
      console.error('[BranchNavigator] Error switching to next branch:', error);
      this.events.onError('Error switching branches');
    }
  }

  /**
   * Show the branch navigator
   */
  private show(): void {
    console.log('[BranchNavigator] Showing branch navigator');
    this.container.removeClass('branch-navigator-hidden');
    this.container.addClass('branch-navigator-visible');
    
    // Force visibility with inline style as backup
    this.container.style.opacity = '1';
    this.container.style.transform = 'translateX(0)';
    this.container.style.display = 'flex';
  }

  /**
   * Hide the branch navigator
   */
  private hide(): void {
    console.log('[BranchNavigator] Hiding branch navigator');
    this.container.removeClass('branch-navigator-visible');
    this.container.addClass('branch-navigator-hidden');
  }

  /**
   * Get current branch information for external use
   */
  getCurrentBranchInfo(): { current: number; total: number; hasMultiple: boolean } | null {
    if (!this.currentConversation) return null;
    return this.branchManager.getBranchNavigationInfo(this.currentConversation);
  }

  /**
   * Check if branch navigation is currently visible
   */
  isVisible(): boolean {
    return this.container.hasClass('branch-navigator-visible');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.prevButton.removeEventListener('click', () => this.handlePreviousBranch());
    this.nextButton.removeEventListener('click', () => this.handleNextBranch());
    this.container.empty();
  }
}