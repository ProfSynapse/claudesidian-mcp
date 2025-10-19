/**
 * SystemPromptBuilder - Constructs system prompts for chat conversations
 *
 * Responsibilities:
 * - Build multi-section XML system prompts
 * - Inject session/workspace context for tool calls
 * - Add enhancement data from suggesters (tools, agents, notes)
 * - Include agent prompts and workspace context
 * - Delegate file content reading to FileContentService
 *
 * Follows Single Responsibility Principle - only handles prompt composition.
 */

import { WorkspaceContext } from '../../../database/types/workspace/WorkspaceTypes';
import { MessageEnhancement } from '../components/suggesters/base/SuggesterInterfaces';

export interface SystemPromptOptions {
  sessionId?: string;
  workspaceId?: string;
  contextNotes?: string[];
  messageEnhancement?: MessageEnhancement | null;
  agentPrompt?: string | null;
  workspaceContext?: WorkspaceContext | null;
}

export class SystemPromptBuilder {
  constructor(
    private readNoteContent: (notePath: string) => Promise<string>
  ) {}

  /**
   * Build complete system prompt with all sections
   */
  async build(options: SystemPromptOptions): Promise<string | null> {
    const sections: string[] = [];

    // 1. Session context (CRITICAL - must be first!)
    const sessionSection = this.buildSessionContext(options.sessionId, options.workspaceId);
    if (sessionSection) {
      sections.push(sessionSection);
    }

    // 2. Context files section
    const filesSection = await this.buildFilesSection(
      options.contextNotes || [],
      options.messageEnhancement
    );
    if (filesSection) {
      sections.push(filesSection);
    }

    // 3. Tool hints from /suggester
    const toolHintsSection = this.buildToolHintsSection(options.messageEnhancement);
    if (toolHintsSection) {
      sections.push(toolHintsSection);
    }

    // 4. Custom agents from @suggester
    const customAgentsSection = this.buildCustomAgentsSection(options.messageEnhancement);
    if (customAgentsSection) {
      sections.push(customAgentsSection);
    }

    // 5. Agent prompt (if agent selected)
    const agentSection = this.buildAgentSection(options.agentPrompt);
    if (agentSection) {
      sections.push(agentSection);
    }

    // 6. Workspace context
    const workspaceSection = this.buildWorkspaceSection(options.workspaceContext);
    if (workspaceSection) {
      sections.push(workspaceSection);
    }

    return sections.length > 0 ? sections.join('\n') : null;
  }

  /**
   * Build session context section for tool calls
   */
  private buildSessionContext(sessionId?: string, workspaceId?: string): string | null {
    if (!sessionId && !workspaceId) {
      return null;
    }

    let prompt = '<session_context>\n';
    prompt += 'IMPORTANT: When using tools, you must include these values in your tool call parameters:\n\n';

    if (sessionId) {
      prompt += `- sessionId: "${sessionId}"\n`;
    }

    if (workspaceId) {
      prompt += `- workspaceId: "${workspaceId}"\n`;
    }

    prompt += '\nInclude these in the "context" parameter of your tool calls, like this:\n';
    prompt += '{\n';
    prompt += '  "context": {\n';
    if (sessionId) {
      prompt += `    "sessionId": "${sessionId}",\n`;
    }
    if (workspaceId) {
      prompt += `    "workspaceId": "${workspaceId}"\n`;
    }
    prompt += '  },\n';
    prompt += '  ... other parameters ...\n';
    prompt += '}\n';
    prompt += '</session_context>';

    return prompt;
  }

  /**
   * Build files section with context notes and enhancement notes
   */
  private async buildFilesSection(
    contextNotes: string[],
    messageEnhancement?: MessageEnhancement | null
  ): Promise<string | null> {
    const hasContextNotes = contextNotes.length > 0;
    const hasEnhancementNotes = messageEnhancement && messageEnhancement.notes.length > 0;

    if (!hasContextNotes && !hasEnhancementNotes) {
      return null;
    }

    let prompt = '<files>\n';

    // Add context notes
    for (const notePath of contextNotes) {
      const xmlTag = this.normalizePathToXmlTag(notePath);
      const content = await this.readNoteContent(notePath);

      prompt += `<${xmlTag}>\n`;
      prompt += `${notePath}\n\n`;
      prompt += content || '[File content unavailable]';
      prompt += `\n</${xmlTag}>\n`;
    }

    // Add enhancement notes from [[suggester]]
    if (hasEnhancementNotes) {
      console.log('[SystemPromptBuilder] Injecting notes from [[suggester]]:', messageEnhancement!.notes.length);

      for (const note of messageEnhancement!.notes) {
        const xmlTag = this.normalizePathToXmlTag(note.path);
        prompt += `<${xmlTag}>\n`;
        prompt += `${note.path}\n\n`;
        prompt += this.escapeXmlContent(note.content);
        prompt += `\n</${xmlTag}>\n`;
      }
    }

    prompt += '</files>';

    return prompt;
  }

  /**
   * Build tool hints section from /suggester
   */
  private buildToolHintsSection(messageEnhancement?: MessageEnhancement | null): string | null {
    if (!messageEnhancement || messageEnhancement.tools.length === 0) {
      return null;
    }

    console.log('[SystemPromptBuilder] Injecting tool hints from /suggester:', messageEnhancement.tools.length);

    let prompt = '<tool_hints>\n';
    prompt += 'The user has requested to use the following tools:\n\n';

    for (const tool of messageEnhancement.tools) {
      console.log('[SystemPromptBuilder] - Tool hint:', tool.name);
      prompt += `Tool: ${tool.name}\n`;
      prompt += `Description: ${tool.schema.description}\n`;
      prompt += 'Please prioritize using this tool when applicable.\n\n';
    }

    prompt += '</tool_hints>';

    return prompt;
  }

  /**
   * Build custom agents section from @suggester
   */
  private buildCustomAgentsSection(messageEnhancement?: MessageEnhancement | null): string | null {
    if (!messageEnhancement || messageEnhancement.agents.length === 0) {
      return null;
    }

    console.log('[SystemPromptBuilder] Injecting custom agents from @suggester:', messageEnhancement.agents.length);

    let prompt = '<custom_agents>\n';
    prompt += 'The user has mentioned the following custom agents. Apply their personalities and instructions:\n\n';

    for (const agent of messageEnhancement.agents) {
      console.log('[SystemPromptBuilder] - Agent:', agent.name);
      prompt += `<agent name="${this.escapeXmlAttribute(agent.name)}">\n`;
      prompt += this.escapeXmlContent(agent.prompt);
      prompt += `\n</agent>\n\n`;
    }

    prompt += '</custom_agents>';

    return prompt;
  }

  /**
   * Build agent section (if agent selected)
   */
  private buildAgentSection(agentPrompt?: string | null): string | null {
    if (!agentPrompt) {
      return null;
    }

    return `<agent>\n${agentPrompt}\n</agent>`;
  }

  /**
   * Build workspace section
   */
  private buildWorkspaceSection(workspaceContext?: WorkspaceContext | null): string | null {
    if (!workspaceContext) {
      return null;
    }

    return `<workspace>\n${JSON.stringify(workspaceContext, null, 2)}\n</workspace>`;
  }

  /**
   * Normalize file path to valid XML tag name
   * Example: "Notes/Style Guide.md" -> "Notes_Style_Guide"
   */
  private normalizePathToXmlTag(path: string): string {
    return path
      .replace(/\.md$/i, '')  // Remove .md extension
      .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace non-alphanumeric with underscore
      .replace(/^_+|_+$/g, '')  // Remove leading/trailing underscores
      .replace(/_+/g, '_');  // Collapse multiple underscores
  }

  /**
   * Escape XML content (text nodes)
   */
  private escapeXmlContent(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Escape XML attribute values
   */
  private escapeXmlAttribute(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
