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
    private readNoteContent: (notePath: string) => Promise<string>,
    private loadWorkspace?: (workspaceId: string) => Promise<any>
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

    // 5. Workspace references from #suggester
    const workspaceReferencesSection = await this.buildWorkspaceReferencesSection(options.messageEnhancement);
    if (workspaceReferencesSection) {
      sections.push(workspaceReferencesSection);
    }

    // 6. Agent prompt (if agent selected)
    const agentSection = this.buildAgentSection(options.agentPrompt);
    if (agentSection) {
      sections.push(agentSection);
    }

    // 7. Workspace context (legacy single workspace support)
    const workspaceSection = this.buildWorkspaceSection(options.workspaceContext);
    if (workspaceSection) {
      sections.push(workspaceSection);
    }

    return sections.length > 0 ? sections.join('\n') : null;
  }

  /**
   * Build session context section for tool calls
   * Always includes workspace context with default fallback
   */
  private buildSessionContext(sessionId?: string, workspaceId?: string): string | null {
    // Always provide session context even if values are undefined
    // This ensures the LLM knows about the default workspace
    const hasSession = !!sessionId;
    const hasWorkspace = !!workspaceId;

    let prompt = '<session_context>\n';
    prompt += 'IMPORTANT: When using tools, you must include these values in your tool call parameters:\n\n';

    if (hasSession) {
      prompt += `- sessionId: "${sessionId}"\n`;
    } else {
      prompt += '- sessionId: Generate a unique session ID in the format "session_[timestamp]_[random]" if not provided\n';
    }

    if (hasWorkspace) {
      prompt += `- workspaceId: "${workspaceId}" (current workspace)\n`;
    } else {
      prompt += '- workspaceId: "default" (use this when no specific workspace is selected)\n';
    }

    prompt += '\nInclude these in the "context" parameter of your tool calls, like this:\n';
    prompt += '{\n';
    prompt += '  "context": {\n';
    if (hasSession) {
      prompt += `    "sessionId": "${sessionId}",\n`;
    } else {
      prompt += '    "sessionId": "session_[timestamp]_[random]",\n';
    }
    if (hasWorkspace) {
      prompt += `    "workspaceId": "${workspaceId}",\n`;
    } else {
      prompt += '    "workspaceId": "default",\n';
    }
    prompt += '    "sessionDescription": "Brief description of what we\'re working on",\n';
    prompt += '    "sessionMemory": "Summary of conversation context and progress"\n';
    prompt += '  },\n';
    prompt += '  ... other parameters ...\n';
    prompt += '}\n';
    prompt += '\nNOTE: If workspaceId is not specified above, ALWAYS use "default" as the workspaceId in your tool calls.\n';
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

    let prompt = '<tool_hints>\n';
    prompt += 'The user has requested to use the following tools:\n\n';

    for (const tool of messageEnhancement.tools) {
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

    let prompt = '<custom_agents>\n';
    prompt += 'The user has mentioned the following custom agents. Apply their personalities and instructions:\n\n';

    for (const agent of messageEnhancement.agents) {
      prompt += `<agent name="${this.escapeXmlAttribute(agent.name)}">\n`;
      prompt += this.escapeXmlContent(agent.prompt);
      prompt += `\n</agent>\n\n`;
    }

    prompt += '</custom_agents>';

    return prompt;
  }

  /**
   * Build workspace references section from #suggester
   * This provides comprehensive workspace data similar to the loadWorkspace tool
   */
  private async buildWorkspaceReferencesSection(messageEnhancement?: MessageEnhancement | null): Promise<string | null> {
    if (!messageEnhancement || messageEnhancement.workspaces.length === 0) {
      return null;
    }

    if (!this.loadWorkspace) {
      // If workspace loader not provided, just include basic info
      let prompt = '<workspaces>\n';
      prompt += 'The user has referenced the following workspaces:\n\n';

      for (const workspace of messageEnhancement.workspaces) {
        prompt += `Workspace: ${workspace.name}\n`;
        if (workspace.description) {
          prompt += `Description: ${workspace.description}\n`;
        }
        prompt += `Root Folder: ${workspace.rootFolder}\n\n`;
      }

      prompt += '</workspaces>';
      return prompt;
    }

    // Load full workspace data for each reference
    let prompt = '<workspaces>\n';
    prompt += 'The user has referenced the following workspaces. Use their context for your responses:\n\n';

    for (const workspaceRef of messageEnhancement.workspaces) {
      try {
        const workspaceData = await this.loadWorkspace(workspaceRef.id);
        if (workspaceData) {
          // Check if this is comprehensive data from LoadWorkspaceMode or basic workspace object
          const isComprehensive = workspaceData.context && typeof workspaceData.context === 'object' && 'name' in workspaceData.context;

          if (isComprehensive) {
            // Comprehensive workspace data from LoadWorkspaceMode
            const workspaceName = workspaceData.context?.name || workspaceRef.name;
            prompt += `<workspace name="${this.escapeXmlAttribute(workspaceName)}" id="${this.escapeXmlAttribute(workspaceRef.id)}">\n`;

            // Format the comprehensive workspace data
            prompt += this.escapeXmlContent(JSON.stringify({
              context: workspaceData.context,
              workflows: workspaceData.workflows || [],
              workspaceStructure: workspaceData.workspaceStructure || [],
              recentFiles: workspaceData.recentFiles || [],
              keyFiles: workspaceData.keyFiles || {},
              preferences: workspaceData.preferences || '',
              sessions: workspaceData.sessions || [],
              states: workspaceData.states || []
            }, null, 2));

            prompt += `\n</workspace>\n\n`;
          } else {
            // Basic workspace object (fallback)
            prompt += `<workspace name="${this.escapeXmlAttribute(workspaceData.name || workspaceRef.name)}" id="${this.escapeXmlAttribute(workspaceRef.id)}">\n`;

            prompt += this.escapeXmlContent(JSON.stringify({
              name: workspaceData.name,
              description: workspaceData.description,
              rootFolder: workspaceData.rootFolder,
              context: workspaceData.context
            }, null, 2));

            prompt += `\n</workspace>\n\n`;
          }
        }
      } catch (error) {
        console.error(`Failed to load workspace ${workspaceRef.id}:`, error);
        // Continue with other workspaces
      }
    }

    prompt += '</workspaces>';
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
