/**
 * MessageEnhancer - Builds enhancement metadata from suggester selections
 * Collects tool hints, agent references, and note content for system prompt injection
 */

import {
  MessageEnhancement,
  ToolHint,
  AgentReference,
  NoteReference,
  EnhancementType,
  EnhancementData
} from '../components/suggesters/base/SuggesterInterfaces';
import { TokenCalculator } from '../utils/TokenCalculator';

/**
 * Service for building message enhancements from suggester selections
 */
export class MessageEnhancer {

  private tools: ToolHint[] = [];
  private agents: AgentReference[] = [];
  private notes: NoteReference[] = [];

  constructor() {
    // No initialization needed - TokenCalculator is static
  }

  // ==========================================================================
  // Add Enhancement Data
  // ==========================================================================

  /**
   * Add a tool hint from tool suggester
   * @param tool - Tool hint data
   */
  addTool(tool: ToolHint): void {
    // Avoid duplicates
    if (!this.tools.find(t => t.name === tool.name)) {
      this.tools.push(tool);
    }
  }

  /**
   * Add an agent reference from agent suggester
   * @param agent - Agent reference data
   */
  addAgent(agent: AgentReference): void {
    // Avoid duplicates
    if (!this.agents.find(a => a.id === agent.id)) {
      this.agents.push(agent);
    }
  }

  /**
   * Add a note reference from note suggester
   * @param note - Note reference data
   */
  addNote(note: NoteReference): void {
    // Avoid duplicates by path
    if (!this.notes.find(n => n.path === note.path)) {
      this.notes.push(note);
    }
  }

  /**
   * Add enhancement data based on type
   * @param enhancement - Enhancement data with type discriminator
   */
  addEnhancement(enhancement: EnhancementData): void {
    switch (enhancement.type) {
      case EnhancementType.TOOL:
        this.addTool(enhancement.data as ToolHint);
        break;
      case EnhancementType.AGENT:
        this.addAgent(enhancement.data as AgentReference);
        break;
      case EnhancementType.NOTE:
        this.addNote(enhancement.data as NoteReference);
        break;
    }
  }

  // ==========================================================================
  // Build Enhancement
  // ==========================================================================

  /**
   * Build final message enhancement object
   * @param originalMessage - Original user message with trigger characters
   * @returns Complete message enhancement
   */
  buildEnhancement(originalMessage: string): MessageEnhancement {
    const cleanedMessage = this.cleanMessage(originalMessage);
    const totalTokens = this.calculateTotalTokens();

    return {
      originalMessage,
      cleanedMessage,
      tools: [...this.tools],
      agents: [...this.agents],
      notes: [...this.notes],
      totalTokens
    };
  }

  /**
   * Clean message for optional downstream usage.
   * Currently just trims whitespace so the LLM sees the message exactly as typed.
   * @param message - Original message
   * @returns Cleaned message
   */
  private cleanMessage(message: string): string {
    return message.trim();
  }

  /**
   * Calculate total estimated tokens from all enhancements
   * @returns Total token count
   */
  private calculateTotalTokens(): number {
    let total = 0;

    // Tool schemas (estimated)
    total += this.tools.length * 150; // ~150 tokens per tool schema

    // Agent prompts
    total += this.agents.reduce((sum, agent) => sum + agent.tokens, 0);

    // Note content
    total += this.notes.reduce((sum, note) => sum + note.tokens, 0);

    return total;
  }

  // ==========================================================================
  // Query Enhancement State
  // ==========================================================================

  /**
   * Get all current tool hints
   * @returns Array of tool hints
   */
  getTools(): ToolHint[] {
    return [...this.tools];
  }

  /**
   * Get all current agent references
   * @returns Array of agent references
   */
  getAgents(): AgentReference[] {
    return [...this.agents];
  }

  /**
   * Get all current note references
   * @returns Array of note references
   */
  getNotes(): NoteReference[] {
    return [...this.notes];
  }

  /**
   * Get current total token count
   * @returns Estimated token count
   */
  getTotalTokens(): number {
    return this.calculateTotalTokens();
  }

  /**
   * Check if any enhancements have been added
   * @returns True if enhancements exist
   */
  hasEnhancements(): boolean {
    return this.tools.length > 0 || this.agents.length > 0 || this.notes.length > 0;
  }

  // ==========================================================================
  // Clear State
  // ==========================================================================

  /**
   * Clear all enhancements
   */
  clearEnhancements(): void {
    this.tools = [];
    this.agents = [];
    this.notes = [];
  }

  /**
   * Remove a specific tool hint
   * @param toolName - Name of tool to remove
   */
  removeTool(toolName: string): void {
    this.tools = this.tools.filter(t => t.name !== toolName);
  }

  /**
   * Remove a specific agent reference
   * @param agentId - ID of agent to remove
   */
  removeAgent(agentId: string): void {
    this.agents = this.agents.filter(a => a.id !== agentId);
  }

  /**
   * Remove a specific note reference
   * @param notePath - Path of note to remove
   */
  removeNote(notePath: string): void {
    this.notes = this.notes.filter(n => n.path !== notePath);
  }
}
