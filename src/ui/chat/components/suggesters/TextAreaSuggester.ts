/**
 * TextAreaSuggester - Suggestion system for plain HTML textarea
 * Similar to EditorSuggest but works with textarea instead of Obsidian Editor
 */

import { App } from 'obsidian';
import { SuggesterConfig, SuggestionItem } from './base/SuggesterInterfaces';

export abstract class TextAreaSuggester<T> {
  protected app: App;
  protected config: SuggesterConfig;
  protected textarea: HTMLTextAreaElement;
  protected suggestionContainer: HTMLElement | null = null;
  protected suggestions: SuggestionItem<T>[] = [];
  protected selectedIndex = 0;
  protected isActive = false;

  constructor(app: App, textarea: HTMLTextAreaElement, config: SuggesterConfig) {
    this.app = app;
    this.textarea = textarea;
    this.config = config;

    console.log('[TextAreaSuggester] Initialized for textarea');
    this.attachEventListeners();
  }

  // ==========================================================================
  // Abstract Methods
  // ==========================================================================

  abstract getSuggestions(query: string): Promise<SuggestionItem<T>[]> | SuggestionItem<T>[];
  abstract renderSuggestion(item: SuggestionItem<T>, el: HTMLElement): void;
  abstract selectSuggestion(item: SuggestionItem<T>): void;

  // ==========================================================================
  // Event Listeners
  // ==========================================================================

  private attachEventListeners(): void {
    this.textarea.addEventListener('input', this.onInput.bind(this));
    this.textarea.addEventListener('keydown', this.onKeyDown.bind(this));

    // Don't close on blur - let user click suggestions
    // Suggestions will close on selection or Escape key
  }

  private async onInput(): Promise<void> {
    const cursorPos = this.textarea.selectionStart;
    const text = this.textarea.value.substring(0, cursorPos);

    console.log('[TextAreaSuggester] Input event:', { text, cursorPos });

    // Check if trigger pattern matches
    const match = this.config.trigger.exec(text);

    if (!match) {
      console.log('[TextAreaSuggester] No trigger match');
      this.close();
      return;
    }

    const query = match[1] || '';
    console.log('[TextAreaSuggester] Trigger matched! Query:', query);

    // Get suggestions
    this.suggestions = await this.getSuggestions(query);
    console.log('[TextAreaSuggester] Got', this.suggestions.length, 'suggestions');

    if (this.suggestions.length === 0) {
      this.close();
      return;
    }

    // Show suggestions
    this.selectedIndex = 0;
    this.show();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.isActive) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectPrevious();
        break;
      case 'Enter':
        if (this.isActive) {
          e.preventDefault();
          this.confirmSelection();
        }
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  // ==========================================================================
  // Suggestion Management
  // ==========================================================================

  private show(): void {
    if (this.isActive && this.suggestionContainer) {
      // Already showing, just update
      this.renderSuggestions();
      return;
    }

    console.log('[TextAreaSuggester] Showing suggestions');

    // Create container
    this.suggestionContainer = document.createElement('div');
    this.suggestionContainer.addClass('suggestion-container', 'suggester-dropdown');

    // Position ABOVE textarea (not below)
    const rect = this.textarea.getBoundingClientRect();
    this.suggestionContainer.style.position = 'fixed';
    this.suggestionContainer.style.left = rect.left + 'px';
    this.suggestionContainer.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    this.suggestionContainer.style.width = rect.width + 'px';
    this.suggestionContainer.style.maxHeight = '300px';
    this.suggestionContainer.style.zIndex = '1000';

    document.body.appendChild(this.suggestionContainer);
    this.isActive = true;

    // Add click-outside handler to close
    setTimeout(() => {
      document.addEventListener('click', this.handleClickOutside);
    }, 100);

    this.renderSuggestions();
  }

  private handleClickOutside = (e: MouseEvent): void => {
    if (!this.suggestionContainer) return;

    const target = e.target as Node;
    if (!this.suggestionContainer.contains(target) && target !== this.textarea) {
      console.log('[TextAreaSuggester] Click outside detected, closing');
      this.close();
    }
  };

  private renderSuggestions(): void {
    if (!this.suggestionContainer) return;

    this.suggestionContainer.empty();

    this.suggestions.forEach((suggestion, index) => {
      const el = this.suggestionContainer!.createDiv({
        cls: index === this.selectedIndex ? 'suggester-item is-selected' : 'suggester-item'
      });

      // Render the suggestion using subclass method
      this.renderSuggestion(suggestion, el);

      // Click handler
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent textarea blur
        this.selectedIndex = index;
        this.confirmSelection();
      });

      // Hover handler
      el.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.renderSuggestions();
      });
    });
  }

  private selectNext(): void {
    this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
    this.renderSuggestions();
  }

  private selectPrevious(): void {
    this.selectedIndex = (this.selectedIndex - 1 + this.suggestions.length) % this.suggestions.length;
    this.renderSuggestions();
  }

  private confirmSelection(): void {
    if (this.suggestions.length === 0) return;

    const selected = this.suggestions[this.selectedIndex];
    console.log('[TextAreaSuggester] Confirmed selection:', selected.displayText);

    this.selectSuggestion(selected);
    this.close();
  }

  close(): void {
    console.log('[TextAreaSuggester] Closing suggestions');

    if (this.suggestionContainer) {
      this.suggestionContainer.remove();
      this.suggestionContainer = null;
    }

    // Remove click-outside handler
    document.removeEventListener('click', this.handleClickOutside);

    this.isActive = false;
    this.suggestions = [];
    this.selectedIndex = 0;
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  destroy(): void {
    this.close();
    // Event listeners will be cleaned up with textarea
  }
}
