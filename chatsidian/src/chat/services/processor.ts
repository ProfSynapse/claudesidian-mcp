import { TypedEventEmitter } from "../../core/types";
import { AppEventTypes } from "../../core/plugin"; // Use combined types
import { ConversationManager } from "./conversation";
import { MCPClient } from "../../mcp/client/index"; // Import MCPClient
import { ChatMessage } from "../types";
import { v4 as uuidv4 } from 'uuid'; // Assuming uuid is installed

/**
 * Handles the processing of user messages, typically by sending them
 * to an AI model via the MCP client and managing the response stream.
 * It interacts with the ConversationManager to update conversation state
 * and emits events for UI updates during streaming.
 */
export class MessageProcessor {
  private events: TypedEventEmitter<AppEventTypes>;
  private conversationManager: ConversationManager;
  private mcpClient: MCPClient; // Added MCPClient instance

  /**
   * Creates an instance of MessageProcessor.
   * @param events The application's TypedEventEmitter instance.
   * @param conversationManager The application's ConversationManager instance.
   * @param mcpClient The application's MCPClient instance.
   */
  constructor(
    events: TypedEventEmitter<AppEventTypes>,
    conversationManager: ConversationManager,
    mcpClient: MCPClient // Added mcpClient parameter
  ) {
    this.events = events;
    this.conversationManager = conversationManager;
    this.mcpClient = mcpClient; // Assign MCPClient
    this.registerEventHandlers();
  }

  /**
   * Registers event handlers for relevant events.
   * @private
   */
  private registerEventHandlers(): void {
    // Listen for requests to process a user message
    this.events.on('chat:message.process', this.handleProcessMessage.bind(this));
  }

  /**
   * Handles the 'chat:message.process' event.
   * Orchestrates sending the message context to the AI model (via MCP)
   * and processing the response stream.
   * @param data Event payload containing conversation ID, message ID, content, etc.
   * @private
   */
  private async handleProcessMessage(data: {
    conversationId: string;
    messageId: string; // ID of the user message being processed
    content: string;
    context?: any;
  }): Promise<void> {
    const { conversationId, messageId, content, context } = data;
    console.log(`Processing message ${messageId} for conversation ${conversationId}`);

    const conversation = await this.conversationManager.loadConversation(conversationId);
    if (!conversation) {
      console.error(`Cannot process message, conversation not found: ${conversationId}`);
      this.events.emit('chat:message.error', { conversationId, messageId, error: new Error("Conversation not found") });
      return;
    }

    // Create a placeholder for the assistant's response
    const assistantMessageId = uuidv4();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: "", // Start empty, will be filled by streaming
      timestamp: Date.now(),
      metadata: { relatedToUserMessageId: messageId } // Link response to request
    };

    // Add placeholder to conversation state immediately for UI responsiveness
    await this.conversationManager.addMessage(conversationId, assistantMessage);

    // --- Phase 3: Integration with MCP Client ---
    try {
      // Replace placeholder logic with actual MCP call
      console.log(`Calling MCPClient.executeStreaming for message ${messageId}`);
      const stream = await this.mcpClient.executeStreaming(
          // TODO: Determine the correct BCP/tool name for language model generation
          // e.g., 'LanguageModel.generate' or similar, depending on BCP structure
          'LanguageModel.generate', // Updated placeholder for intended tool name
          {
            conversationId,
            prompt: content, // Or construct prompt from conversation history
           // Pass relevant message history (excluding the placeholder itself)
           history: conversation.messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
           context, // Pass any additional context
           modelId: conversation.metadata?.defaultModel || 'default-model',
           // ... other parameters
         }
       );

       let finalContent = "";
       for await (const token of stream) {
         finalContent += token;
         // Emit streaming event for UI updates
         this.events.emit('chat:message.streaming', {
           conversationId,
           messageId: assistantMessageId,
           token,
         });
         // Optional: Save conversation state periodically during streaming
         // Consider debouncing or saving based on token patterns (e.g., newlines)
         // to avoid excessive writes.
         // Example: if (token.includes('\n')) {
         //   assistantMessage.content = finalContent; // Update content before saving
         //   await this.conversationManager.saveConversation(conversation);
         // }
       }

       // Update final message content and save once streaming is complete
       assistantMessage.content = finalContent;
       await this.conversationManager.saveConversation(conversation);
       this.events.emit('chat:message.received', { conversationId, message: assistantMessage });

    } catch (error) {
      console.error(`Error processing message ${messageId}:`, error);
      // Update the placeholder message with error info
      assistantMessage.content = `Error processing message: ${error instanceof Error ? error.message : String(error)}`;
      assistantMessage.error = error;
      await this.conversationManager.saveConversation(conversation);
      // Emit error event
      this.events.emit('chat:message.error', { conversationId, messageId: assistantMessageId, error });
    }
  }
}
