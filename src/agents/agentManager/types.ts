import { CommonParams, CommonResult, CustomPrompt } from '../../types';

// List Agents Mode
export interface ListAgentsParams extends CommonParams {
  enabledOnly?: boolean;
}

export interface ListAgentsResult extends CommonResult {
  data: {
    prompts: Array<Pick<CustomPrompt, 'id' | 'name' | 'description' | 'isEnabled'>>;
    totalCount: number;
    enabledCount: number;
    message: string;
  };
}

// Get Agent Mode
export interface GetAgentParams extends CommonParams {
  id?: string;
  name?: string;
}

export interface GetAgentResult extends CommonResult {
  data: (CustomPrompt & { message: string }) | null;
}

// Create Agent Mode
export interface CreateAgentParams extends CommonParams {
  name: string;
  description: string;
  prompt: string;
  isEnabled?: boolean;
}

export interface CreateAgentResult extends CommonResult {
  data: CustomPrompt;
}

// Update Agent Mode
export interface UpdateAgentParams extends CommonParams {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
  isEnabled?: boolean;
}

export interface UpdateAgentResult extends CommonResult {
  data: CustomPrompt;
}

// Delete Agent Mode
export interface DeleteAgentParams extends CommonParams {
  id: string;
}

export interface DeleteAgentResult extends CommonResult {
  data: {
    deleted: boolean;
    id: string;
  };
}

// Toggle Agent Mode
export interface ToggleAgentParams extends CommonParams {
  id: string;
}

export interface ToggleAgentResult extends CommonResult {
  data: CustomPrompt;
}