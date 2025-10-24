/**
 * MessageBubble - Individual message bubble component
 * 
 * Renders user/AI messages with copy, retry, and edit actions
 */

import { ConversationMessage } from '../../../types/chat/ChatTypes';
import { ProgressiveToolAccordion } from './ProgressiveToolAccordion';
import { MessageBranchNavigator, MessageBranchNavigatorEvents } from './MessageBranchNavigator';
import { MarkdownRenderer } from '../utils/MarkdownRenderer';
import { setIcon, Component, App } from 'obsidian';
import { ExtractedReference, ReferenceMetadata } from '../utils/ReferenceExtractor';
import { formatToolDisplayName, normalizeToolName } from '../../../utils/toolNameUtils';

interface ReferencePlaceholder {
  token: string;
  index: number;
  reference: ExtractedReference;
}

export class MessageBubble extends Component {
  private static readonly PLACEHOLDER_PREFIX = '\uFFF0REF';
  private static readonly PLACEHOLDER_SUFFIX = '\uFFF1';

  private element: HTMLElement | null = null;
  private loadingInterval: any = null;
  private progressiveToolAccordions: Map<string, ProgressiveToolAccordion> = new Map(); // Keyed by tool.id
  private messageBranchNavigator: MessageBranchNavigator | null = null;
  private toolBubbleElement: HTMLElement | null = null; // Separate tool bubble
  private textBubbleElement: HTMLElement | null = null; // Separate text bubble

  constructor(
    private message: ConversationMessage,
    private app: App,
    private onCopy: (messageId: string) => void,
    private onRetry: (messageId: string) => void,
    private onEdit?: (messageId: string, newContent: string) => void,
    private onToolEvent?: (messageId: string, event: 'detected' | 'started' | 'completed', data: any) => void,
    private onMessageAlternativeChanged?: (messageId: string, alternativeIndex: number) => void
  ) {
    super();
  }

  /**
   * Create the message bubble element
   * For assistant messages with toolCalls, returns a fragment containing tool bubble + text bubble
   */
  createElement(): HTMLElement {
    // Check if we need to split into tool bubble + text bubble
    const hasToolCalls = this.message.role === 'assistant' && this.message.toolCalls && this.message.toolCalls.length > 0;

    if (hasToolCalls) {
      // Create a wrapper fragment that will hold both bubbles
      const wrapper = document.createElement('div');
      wrapper.addClass('message-group');
      wrapper.setAttribute('data-message-id', this.message.id);

      // Create tool bubble
      this.toolBubbleElement = this.createToolBubble();
      wrapper.appendChild(this.toolBubbleElement);

      // Create text bubble (if there's content)
      if (this.message.content && this.message.content.trim()) {
        this.textBubbleElement = this.createTextBubble();
        wrapper.appendChild(this.textBubbleElement);
      }

      this.element = wrapper;
      return wrapper;
    }

    // Normal single bubble for user messages or assistant without tools
    const messageContainer = document.createElement('div');
    messageContainer.addClass('message-container');
    messageContainer.addClass(`message-${this.message.role}`);
    messageContainer.setAttribute('data-message-id', this.message.id);

    // Create the actual bubble
    const bubble = messageContainer.createDiv('message-bubble');

    // Message header with role icon only
    const header = bubble.createDiv('message-header');

    // Role icon
    const roleIcon = header.createDiv('message-role-icon');
    if (this.message.role === 'user') {
      setIcon(roleIcon, 'user');
    } else if (this.message.role === 'tool') {
      setIcon(roleIcon, 'wrench');
    } else {
      setIcon(roleIcon, 'bot');
    }

    // Add loading state in header if AI message is loading with empty content
    if (this.message.role === 'assistant' && this.message.isLoading && !this.message.content.trim()) {
      const loadingSpan = header.createEl('span', { cls: 'ai-loading-header' });
      loadingSpan.innerHTML = 'Thinking<span class="dots">...</span>';
      this.startLoadingAnimation(loadingSpan);
    }

    // Message content
    const content = bubble.createDiv('message-content');

    // Render content with enhanced markdown support (use active alternative if any)
    const activeContent = this.getActiveMessageContent(this.message);
    this.renderContent(content, activeContent).catch(error => {
      console.error('[MessageBubble] Error rendering initial content:', error);
    });

    // Create actions - inside bubble for assistant, outside for user/tool
    const actions = this.message.role === 'assistant'
      ? bubble.createDiv('message-actions-external')
      : messageContainer.createDiv('message-actions-external');
    
    if (this.message.role === 'user') {
      // Edit button for user messages
      if (this.onEdit) {
        const editBtn = actions.createEl('button', { 
          cls: 'message-action-btn',
          attr: { title: 'Edit message' }
        });
        setIcon(editBtn, 'edit');
        editBtn.addEventListener('click', () => this.handleEdit());
      }
      
      // Retry button for user messages
      const retryBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Retry message' }
      });
      setIcon(retryBtn, 'rotate-ccw');
      retryBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (this.onRetry) {
          this.onRetry(this.message.id);
        } else {
          console.error('[MessageBubble] onRetry callback is null/undefined!');
        }
      });
    } else if (this.message.role === 'tool') {
      // Tool messages get minimal actions - just copy for debugging
      const copyBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Copy tool execution details' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.addEventListener('click', () => {
        this.showCopyFeedback(copyBtn);
        this.onCopy(this.message.id);
      });
    } else {
      // Copy button for AI messages
      const copyBtn = actions.createEl('button', { 
        cls: 'message-action-btn',
        attr: { title: 'Copy message' }
      });
      setIcon(copyBtn, 'copy');
      copyBtn.addEventListener('click', () => {
        this.showCopyFeedback(copyBtn);
        this.onCopy(this.message.id);
      });
      
      // Message branch navigator for AI messages with alternatives
      if (this.message.alternatives && this.message.alternatives.length > 0) {
        const navigatorContainer = actions.createDiv('message-branch-navigator-container');
        
        const navigatorEvents: MessageBranchNavigatorEvents = {
          onAlternativeChanged: (messageId, alternativeIndex) => {
            if (this.onMessageAlternativeChanged) {
              this.onMessageAlternativeChanged(messageId, alternativeIndex);
            }
          },
          onError: (message) => console.error('[MessageBubble] Branch navigation error:', message)
        };
        
        this.messageBranchNavigator = new MessageBranchNavigator(navigatorContainer, navigatorEvents);
        this.messageBranchNavigator.updateMessage(this.message);
      }
    }

    this.element = messageContainer;
    return messageContainer;
  }

  /**
   * Create tool bubble containing multiple tool accordions
   */
  private createToolBubble(): HTMLElement {
    const toolContainer = document.createElement('div');
    toolContainer.addClass('message-container');
    toolContainer.addClass('message-tool');
    toolContainer.setAttribute('data-message-id', `${this.message.id}_tools`);

    const bubble = toolContainer.createDiv('message-bubble tool-bubble');

    // Header with wrench icon
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    setIcon(roleIcon, 'wrench');

    // Content area for tool accordions
    const content = bubble.createDiv('tool-bubble-content');

    // Create one ProgressiveToolAccordion per tool
    if (this.message.toolCalls) {
      this.message.toolCalls.forEach(toolCall => {
        const accordion = new ProgressiveToolAccordion();
        const accordionEl = accordion.createElement();

        // Initialize accordion with completed state from JSON
        const rawName = toolCall.technicalName || toolCall.name || toolCall.function?.name || 'Unknown Tool';
        const displayName = toolCall.displayName || formatToolDisplayName(rawName);
        const technicalName = toolCall.technicalName || normalizeToolName(rawName) || rawName;
        const fallbackArguments = this.getToolCallArguments(toolCall);
        const parameters = this.parseParameterValue(
          toolCall.parameters !== undefined ? toolCall.parameters : fallbackArguments
        );

        accordion.detectTool({
          id: toolCall.id,
          name: displayName,
          technicalName: technicalName,
          parameters,
          isComplete: true
        });

        // If tool has results, mark as completed
        if (toolCall.result !== undefined || toolCall.success !== undefined) {
          accordion.completeTool(
            toolCall.id,
            toolCall.result,
            toolCall.success !== false,
            toolCall.error
          );
        }

        content.appendChild(accordionEl);
        this.progressiveToolAccordions.set(toolCall.id, accordion);
      });
    }

    return toolContainer;
  }

  /**
   * Create text bubble containing only the assistant response text
   */
  private createTextBubble(): HTMLElement {
    const messageContainer = document.createElement('div');
    messageContainer.addClass('message-container');
    messageContainer.addClass('message-assistant');
    messageContainer.setAttribute('data-message-id', `${this.message.id}_text`);

    const bubble = messageContainer.createDiv('message-bubble');

    // Actions inside the bubble (for sticky positioning)
    const actions = bubble.createDiv('message-actions-external');

    // Header with bot icon
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    setIcon(roleIcon, 'bot');

    // Message content
    const content = bubble.createDiv('message-content');

    // Render content with enhanced markdown support
    const activeContent = this.getActiveMessageContent(this.message);
    this.renderContent(content, activeContent).catch(error => {
      console.error('[MessageBubble] Error rendering text bubble content:', error);
    });

    // Populate actions (already created above)

    // Copy button
    const copyBtn = actions.createEl('button', {
      cls: 'message-action-btn',
      attr: { title: 'Copy message' }
    });
    setIcon(copyBtn, 'copy');
    copyBtn.addEventListener('click', () => {
      this.showCopyFeedback(copyBtn);
      this.onCopy(this.message.id);
    });

    // Message branch navigator for messages with alternatives
    if (this.message.alternatives && this.message.alternatives.length > 0) {
      const navigatorContainer = actions.createDiv('message-branch-navigator-container');

      const navigatorEvents: MessageBranchNavigatorEvents = {
        onAlternativeChanged: (messageId, alternativeIndex) => {
          if (this.onMessageAlternativeChanged) {
            this.onMessageAlternativeChanged(messageId, alternativeIndex);
          }
        },
        onError: (message) => console.error('[MessageBubble] Branch navigation error:', message)
      };

      this.messageBranchNavigator = new MessageBranchNavigator(navigatorContainer, navigatorEvents);
      this.messageBranchNavigator.updateMessage(this.message);
    }

    return messageContainer;
  }

  /**
   * Render message content using enhanced markdown renderer
   */
  private async renderContent(container: HTMLElement, content: string): Promise<void> {
    // Skip rendering if loading with empty content (loading is shown in header)
    if (this.message.isLoading && this.message.role === 'assistant' && !content.trim()) {
      return;
    }

    const referenceMetadata = this.getReferenceMetadata();
    let contentToRender = content;
    let placeholders: ReferencePlaceholder[] | null = null;

    if (referenceMetadata && referenceMetadata.references.length > 0) {
      const transformation = this.injectReferencePlaceholders(content, referenceMetadata.references);
      contentToRender = transformation.content;
      placeholders = transformation.placeholders;
    }

    // Use enhanced markdown renderer with Obsidian's native rendering
    try {
      await MarkdownRenderer.renderMarkdown(contentToRender, container, this.app, this);
    } catch (error) {
      console.error('[MessageBubble] Error rendering markdown:', error);
      // Fallback to plain text
      const pre = container.createEl('pre');
      pre.style.whiteSpace = 'pre-wrap';
      pre.textContent = contentToRender;
    }

    if (placeholders && placeholders.length > 0) {
      this.replacePlaceholdersWithBadges(container, placeholders);
    }

    // Tool calls are now rendered separately in createToolBubble() or via handleToolEvent()
  }

  /**
   * Safely read reference metadata from the message
   */
  private getReferenceMetadata(): ReferenceMetadata | undefined {
    const metadata = this.message.metadata as ReferenceMetadata | undefined;
    if (!metadata || !Array.isArray(metadata.references)) {
      return undefined;
    }

    const normalizedReferences = metadata.references
      .map(ref => {
        if (!ref) return null;
        const type = ref.type;
        if (type !== 'tool' && type !== 'agent' && type !== 'note') {
          return null;
        }
        const position = typeof ref.position === 'number' ? ref.position : Number(ref.position);
        if (!Number.isFinite(position)) {
          return null;
        }
        if (typeof ref.displayText !== 'string' || typeof ref.technicalName !== 'string') {
          return null;
        }
        return {
          type,
          displayText: ref.displayText,
          technicalName: ref.technicalName,
          position: Math.max(0, position)
        } as ExtractedReference;
      })
      .filter((ref): ref is ExtractedReference => ref !== null);

    if (normalizedReferences.length === 0) {
      return undefined;
    }

    return {
      references: normalizedReferences
    };
  }

  /**
   * Inject placeholders into content for reference positions
   */
  private injectReferencePlaceholders(
    content: string,
    references: ExtractedReference[]
  ): { content: string; placeholders: ReferencePlaceholder[] } {
    if (references.length === 0) {
      return { content, placeholders: [] };
    }

    const sorted = [...references].sort((a, b) => a.position - b.position);
    let cursor = 0;
    let result = '';
    const placeholders: ReferencePlaceholder[] = [];

    sorted.forEach((reference, index) => {
      const boundedPosition = Math.min(Math.max(reference.position, 0), content.length);
      if (boundedPosition > cursor) {
        result += content.slice(cursor, boundedPosition);
        cursor = boundedPosition;
      } else if (boundedPosition < cursor) {
        cursor = boundedPosition;
      }

      const token = `${MessageBubble.PLACEHOLDER_PREFIX}${index}${MessageBubble.PLACEHOLDER_SUFFIX}`;
      result += token;
      placeholders.push({
        token,
        index,
        reference
      });

      // Skip the original reference text in the rendered content to avoid duplicates
      const displayTextLength = reference.displayText?.length ?? 0;
      if (displayTextLength > 0) {
        const skipTo = Math.min(content.length, boundedPosition + displayTextLength);
        // Only skip forward (never backward)
        if (skipTo > cursor) {
          cursor = skipTo;
        }
      }
    });

    result += content.slice(cursor);

    return {
      content: result,
      placeholders
    };
  }

  /**
   * Replace placeholder tokens with styled badge elements
   */
  private replacePlaceholdersWithBadges(container: HTMLElement, placeholders: ReferencePlaceholder[]): void {
    if (placeholders.length === 0) {
      return;
    }

    const placeholderMap = new Map<number, ExtractedReference>();
    placeholders.forEach(placeholder => {
      placeholderMap.set(placeholder.index, placeholder.reference);
    });

    const pattern = new RegExp(
      `${MessageBubble.escapeForRegex(MessageBubble.PLACEHOLDER_PREFIX)}(\\d+)${MessageBubble.escapeForRegex(MessageBubble.PLACEHOLDER_SUFFIX)}`,
      'g'
    );

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const nodesToProcess: Text[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
      const textNode = currentNode as Text;
      const text = textNode.nodeValue ?? '';
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        nodesToProcess.push(textNode);
      }
      currentNode = walker.nextNode();
    }

    nodesToProcess.forEach(node => {
      const originalText = node.nodeValue ?? '';
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      const tokenPattern = new RegExp(pattern, 'g');
      let match: RegExpExecArray | null;

      while ((match = tokenPattern.exec(originalText)) !== null) {
        const matchIndex = match.index;
        if (matchIndex > lastIndex) {
          fragment.appendChild(document.createTextNode(originalText.slice(lastIndex, matchIndex)));
        }

        const placeholderIndex = Number(match[1]);
        const reference = placeholderMap.get(placeholderIndex);

        if (reference) {
          fragment.appendChild(this.createReferenceBadge(reference));
        } else {
          fragment.appendChild(document.createTextNode(match[0]));
        }

        lastIndex = matchIndex + match[0].length;
      }

      if (lastIndex < originalText.length) {
        fragment.appendChild(document.createTextNode(originalText.slice(lastIndex)));
      }

      node.replaceWith(fragment);
    });
  }

  /**
   * Create badge element for a reference
   */
  private createReferenceBadge(reference: ExtractedReference): HTMLElement {
    const badge = document.createElement('span');
    badge.className = `chat-reference chat-reference-${reference.type}`;
    badge.setAttribute('data-type', reference.type);
    badge.setAttribute('data-name', reference.technicalName);
    badge.textContent = reference.displayText;
    badge.setAttribute('contenteditable', 'false');
    return badge;
  }

  private static escapeForRegex(value: string): string {
    return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  }

  /**
   * Handle edit functionality
   */
  private handleEdit(): void {
    if (!this.onEdit || !this.element) return;
    
    const contentDiv = this.element.querySelector('.message-bubble .message-content');
    if (!contentDiv) return;

    // Create textarea for editing
    const textarea = document.createElement('textarea');
    textarea.className = 'message-edit-textarea';
    textarea.value = this.message.content;
    textarea.style.width = '100%';
    textarea.style.minHeight = '60px';
    textarea.style.resize = 'vertical';
    
    // Create edit controls
    const editControls = document.createElement('div');
    editControls.className = 'message-edit-controls';
    
    const saveBtn = editControls.createEl('button', {
      text: 'Save',
      cls: 'message-edit-save'
    });
    
    const cancelBtn = editControls.createEl('button', {
      text: 'Cancel', 
      cls: 'message-edit-cancel'
    });
    
    // Store original content
    const originalContent = contentDiv.innerHTML;
    
    // Replace content with edit interface
    contentDiv.empty();
    contentDiv.appendChild(textarea);
    contentDiv.appendChild(editControls);
    
    // Focus textarea
    textarea.focus();
    
    // Save handler
    saveBtn.addEventListener('click', () => {
      const newContent = textarea.value.trim();
      if (newContent && newContent !== this.message.content) {
        this.onEdit!(this.message.id, newContent);
      }
      this.exitEditMode(contentDiv, originalContent);
    });
    
    // Cancel handler
    cancelBtn.addEventListener('click', () => {
      this.exitEditMode(contentDiv, originalContent);
    });
    
    // ESC key handler
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.exitEditMode(contentDiv, originalContent);
      }
    });
  }

  /**
   * Exit edit mode and restore original content
   */
  private exitEditMode(contentDiv: Element, originalContent: string): void {
    contentDiv.innerHTML = originalContent;
  }

  /**
   * Get the DOM element
   */
  getElement(): HTMLElement | null {
    return this.element;
  }

  /**
   * Start loading animation (animated dots)
   */
  private startLoadingAnimation(container: HTMLElement): void {
    const dotsElement = container.querySelector('.dots');
    if (dotsElement) {
      let dotCount = 0;
      this.loadingInterval = setInterval(() => {
        dotCount = (dotCount + 1) % 4;
        dotsElement.textContent = '.'.repeat(dotCount);
      }, 500);
    }
  }

  /**
   * Stop loading animation and remove loading UI
   */
  stopLoadingAnimation(): void {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }

    // Remove the "Thinking..." element from the header
    if (this.element) {
      const loadingElement = this.element.querySelector('.ai-loading-header');
      if (loadingElement) {
        loadingElement.remove();
      }
    }
  }

  /**
   * Update static message content - MessageBubble now handles final content only
   * Streaming is handled by StreamingController
   */
  updateContent(content: string): void {
    if (!this.element) return;

    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Stop any loading animations
    this.stopLoadingAnimation();

    // If we have progressive accordions, preserve them during content update
    // Save reference to progressive accordion elements before clearing
    const progressiveAccordions: HTMLElement[] = [];
    if (this.progressiveToolAccordions.size > 0) {
      const accordionElements = contentElement.querySelectorAll('.progressive-tool-accordion');
      accordionElements.forEach(el => {
        if (el instanceof HTMLElement) {
          progressiveAccordions.push(el);
          el.remove(); // Temporarily remove from DOM
        }
      });
    }

    // Clear any existing content
    contentElement.empty();

    // Render final content using Obsidian's markdown renderer
    this.renderContent(contentElement as HTMLElement, content).catch(error => {
      console.error('[MessageBubble] Error rendering content:', error);
      // Fallback to plain text
      const fallbackDiv = document.createElement('div');
      fallbackDiv.textContent = content;
      contentElement.appendChild(fallbackDiv);
    });

    // Re-append progressive accordions if they were preserved
    // (renderContent will call renderToolCalls which creates static accordion if tools are complete)
    // So we only re-append if progressive accordions still exist
    if (this.progressiveToolAccordions.size > 0 && progressiveAccordions.length > 0) {
      progressiveAccordions.forEach(accordion => {
        contentElement.appendChild(accordion);
      });
    }
  }


  /**
   * Update MessageBubble with new message data (including tool calls)
   * This triggers a re-render when tool calls are detected from LLM
   */
  updateWithNewMessage(newMessage: ConversationMessage): void {
    // If we have progressive accordions AND the message has completed tool calls,
    // it's time to transition from progressive to static
    if (this.progressiveToolAccordions.size > 0 && newMessage.toolCalls) {
      const hasCompletedTools = newMessage.toolCalls.some(tc =>
        tc.result !== undefined || tc.success !== undefined
      );

      if (hasCompletedTools) {
        // Tools are complete - transition complete
        // No need to cleanup - ProgressiveToolAccordions already show completed state
      } else {
        // Tools still executing - preserve progressive accordion
        this.message = newMessage;
        if (this.messageBranchNavigator) {
          this.messageBranchNavigator.updateMessage(newMessage);
        }
        return;
      }
    }

    // Update stored message reference
    this.message = newMessage;
    
    // Update branch navigator if it exists
    if (this.messageBranchNavigator) {
      this.messageBranchNavigator.updateMessage(newMessage);
    }

    if (!this.element) return;
    const contentElement = this.element.querySelector('.message-content');
    if (!contentElement) return;

    // Clear existing content
    contentElement.empty();

    // Re-render content with the active alternative (if any)
    const activeContent = this.getActiveMessageContent(newMessage);
    this.renderContent(contentElement as HTMLElement, activeContent).catch(error => {
      console.error('[MessageBubble] Error re-rendering content:', error);
    });

    // Tool calls are now rendered by renderContent -> renderToolCalls()
    // No need to call separately here

    // If still loading, show appropriate loading state
    if (newMessage.isLoading && newMessage.role === 'assistant') {
      const loadingDiv = contentElement.createDiv('ai-loading-continuation');
      loadingDiv.innerHTML = '<span class="ai-loading">Thinking<span class="dots">...</span></span>';
      this.startLoadingAnimation(loadingDiv);
    }

    // Re-rendered with tool calls
  }

  /**
   * Clean up progressive tool accordions and prepare for static accordion
   */
  private cleanupProgressiveAccordions(): void {
    // Clean up all progressive accordions
    this.progressiveToolAccordions.forEach(accordion => {
      const element = accordion.getElement();
      if (element) {
        element.remove();  // Remove from DOM
      }
      accordion.cleanup();  // Clean up internal state
    });

    this.progressiveToolAccordions.clear();
  }

  /**
   * Get the active content for the message (original or alternative)
   */
  private getActiveMessageContent(message: ConversationMessage): string {
    const activeIndex = message.activeAlternativeIndex || 0;
    
    // Index 0 is the original message
    if (activeIndex === 0) {
      return message.content;
    }
    
    // Alternative messages start at index 1
    if (message.alternatives && message.alternatives.length > 0) {
      const alternativeIndex = activeIndex - 1;
      if (alternativeIndex >= 0 && alternativeIndex < message.alternatives.length) {
        return message.alternatives[alternativeIndex].content;
      }
    }
    
    // Fallback to original content
    return message.content;
  }

  /**
   * Escape HTML for safe display
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Handle tool events from MessageManager
   * Creates individual accordions per tool during streaming
   */
  handleToolEvent(event: 'detected' | 'updated' | 'started' | 'completed', data: any): void {
    const info = this.getToolEventInfo(data);
    const toolId = info.toolId;
    if (!toolId) {
      console.warn('[MessageBubble] Tool event missing ID:', data);
      return;
    }

    // Get or create accordion for THIS SPECIFIC TOOL
    let accordion = this.progressiveToolAccordions.get(toolId);

    if (!accordion && (event === 'detected' || event === 'started')) {
      // Create new accordion for this tool
      accordion = new ProgressiveToolAccordion();
      const accordionElement = accordion.createElement();

      // Ensure tool bubble exists
      if (!this.toolBubbleElement) {
        this.createToolBubbleOnDemand();
      }

      // Insert accordion into tool bubble content
      const toolContent = this.toolBubbleElement?.querySelector('.tool-bubble-content');
      if (toolContent) {
        toolContent.appendChild(accordionElement);
      }

      this.progressiveToolAccordions.set(toolId, accordion);
    }

    if (!accordion) {
      console.warn('[MessageBubble] No accordion found for tool:', toolId);
      return;
    }

    // Handle different event types
    switch (event) {
      case 'detected':
        // Tool call detected - may have incomplete parameters
        accordion.detectTool({
          id: toolId,
          name: info.displayName,
          technicalName: info.technicalName,
          parameters: info.parameters,
          isComplete: info.isComplete
        });
        break;

      case 'updated':
        // Parameters updated (now complete)
        accordion.updateToolParameters(toolId, info.parameters, info.isComplete);
        break;

      case 'started':
        // Tool execution started
        accordion.startTool({
          id: toolId,
          name: info.displayName,
          technicalName: info.technicalName,
          parameters: info.parameters
        });
        break;

      case 'completed':
        // Tool execution completed
        accordion.completeTool(
          toolId,
          data.result,
          data.success,
          data.error
        );
        break;
    }
  }

  private getToolEventInfo(data: any): {
    toolId: string | null;
    displayName: string;
    technicalName?: string;
    parameters?: any;
    isComplete: boolean;
  } {
    const toolCall = data?.toolCall;
    const toolId = data?.id ?? data?.toolId ?? toolCall?.id ?? null;
    const rawName =
      data?.rawName ??
      data?.technicalName ??
      data?.name ??
      toolCall?.function?.name ??
      toolCall?.name;

    const displayName =
      typeof data?.displayName === 'string' && data.displayName.trim().length > 0
        ? data.displayName
        : formatToolDisplayName(rawName);

    const technicalNameCandidate =
      typeof data?.technicalName === 'string' && data.technicalName.trim().length > 0
        ? data.technicalName
        : rawName;

    const technicalName = technicalNameCandidate
      ? normalizeToolName(technicalNameCandidate) ?? technicalNameCandidate
      : undefined;

    const parameters = this.extractToolParametersFromEvent(data);
    const isComplete =
      data?.isComplete !== undefined
        ? Boolean(data.isComplete)
        : Boolean(toolCall?.parametersComplete);

    return {
      toolId,
      displayName,
      technicalName,
      parameters,
      isComplete
    };
  }

  private extractToolParametersFromEvent(data: any): any {
    if (!data) {
      return undefined;
    }

    if (data.parameters !== undefined) {
      return this.parseParameterValue(data.parameters);
    }

    const toolCall = data.toolCall;
    if (!toolCall) {
      return undefined;
    }

    if (toolCall.parameters !== undefined) {
      return this.parseParameterValue(toolCall.parameters);
    }

    const rawArguments = this.getToolCallArguments(toolCall);
    return this.parseParameterValue(rawArguments);
  }

  private parseParameterValue(value: any): any {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    return value;
  }

  private getToolCallArguments(toolCall: any): any {
    if (!toolCall) {
      return undefined;
    }

    if (toolCall.function && typeof toolCall.function === 'object' && 'arguments' in toolCall.function) {
      return toolCall.function.arguments;
    }

    return (toolCall as any)?.arguments;
  }

  /**
   * Create tool bubble on-demand during streaming (when first tool is detected)
   */
  private createToolBubbleOnDemand(): void {
    if (this.toolBubbleElement) return; // Already exists

    const toolContainer = document.createElement('div');
    toolContainer.addClass('message-container');
    toolContainer.addClass('message-tool');
    toolContainer.setAttribute('data-message-id', `${this.message.id}_tools`);

    const bubble = toolContainer.createDiv('message-bubble tool-bubble');

    // Header with wrench icon
    const header = bubble.createDiv('message-header');
    const roleIcon = header.createDiv('message-role-icon');
    setIcon(roleIcon, 'wrench');

    // Content area for tool accordions
    bubble.createDiv('tool-bubble-content');

    this.toolBubbleElement = toolContainer;

    // Insert before the main message bubble (or at the beginning if no main bubble yet)
    if (this.element) {
      this.element.insertBefore(toolContainer, this.element.firstChild);
    }
  }


  /**
   * Get progressive tool accordions for external updates
   */
  getProgressiveToolAccordions(): Map<string, ProgressiveToolAccordion> {
    return this.progressiveToolAccordions;
  }

  /**
   * Show visual feedback when copy button is clicked
   */
  private showCopyFeedback(button: HTMLElement): void {
    const originalIcon = button.innerHTML;
    const originalTitle = button.getAttribute('title') || '';
    
    // Change to checkmark icon and update tooltip
    setIcon(button, 'check');
    button.setAttribute('title', 'Copied!');
    button.classList.add('copy-success');
    
    // Revert after 1.5 seconds
    setTimeout(() => {
      button.innerHTML = originalIcon;
      button.setAttribute('title', originalTitle);
      button.classList.remove('copy-success');
    }, 1500);
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopLoadingAnimation();

    // Use centralized cleanup method
    this.cleanupProgressiveAccordions();

    // Cleanup branch navigator
    if (this.messageBranchNavigator) {
      this.messageBranchNavigator.destroy();
      this.messageBranchNavigator = null;
    }

    this.element = null;
  }
}
