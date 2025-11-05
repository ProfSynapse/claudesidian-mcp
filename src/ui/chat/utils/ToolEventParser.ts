/**
 * ToolEventParser - Parses and enriches tool event data
 * Location: /src/ui/chat/utils/ToolEventParser.ts
 *
 * This class is responsible for:
 * - Extracting tool information from event data
 * - Parsing tool parameters from various formats
 * - Normalizing tool names and metadata
 *
 * Used by MessageBubble to process tool events from the MessageManager,
 * ensuring consistent data structure for ProgressiveToolAccordion.
 */

import { formatToolDisplayName, normalizeToolName } from '../../../utils/toolNameUtils';

export interface ToolEventInfo {
  toolId: string | null;
  displayName: string;
  technicalName?: string;
  parameters?: any;
  isComplete: boolean;
}

export class ToolEventParser {
  /**
   * Extract tool event information from raw event data
   */
  static getToolEventInfo(data: any): ToolEventInfo {
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

  /**
   * Extract tool parameters from event data
   */
  static extractToolParametersFromEvent(data: any): any {
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

  /**
   * Parse parameter value from string or object
   */
  static parseParameterValue(value: any): any {
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

  /**
   * Get tool call arguments from various formats
   */
  static getToolCallArguments(toolCall: any): any {
    if (!toolCall) {
      return undefined;
    }

    if (toolCall.function && typeof toolCall.function === 'object' && 'arguments' in toolCall.function) {
      return toolCall.function.arguments;
    }

    return (toolCall as any)?.arguments;
  }
}
