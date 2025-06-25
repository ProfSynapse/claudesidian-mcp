import { CommonParameters, CommonResult, CustomPrompt } from '../../types';

// List Prompts Mode
export interface ListPromptsParams extends CommonParameters {
  enabledOnly?: boolean;
}

export interface ListPromptsResult extends CommonResult {
  data: {
    prompts: Array<Pick<CustomPrompt, 'id' | 'name' | 'description' | 'isEnabled'>>;
    totalCount: number;
    enabledCount: number;
  };
}

// Get Prompt Mode
export interface GetPromptParams extends CommonParameters {
  id?: string;
  name?: string;
}

export interface GetPromptResult extends CommonResult {
  data: CustomPrompt | null;
}

// Create Prompt Mode
export interface CreatePromptParams extends CommonParameters {
  name: string;
  description: string;
  prompt: string;
  isEnabled?: boolean;
}

export interface CreatePromptResult extends CommonResult {
  data: CustomPrompt;
}

// Update Prompt Mode
export interface UpdatePromptParams extends CommonParameters {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
  isEnabled?: boolean;
}

export interface UpdatePromptResult extends CommonResult {
  data: CustomPrompt;
}

// Delete Prompt Mode
export interface DeletePromptParams extends CommonParameters {
  id: string;
}

export interface DeletePromptResult extends CommonResult {
  data: {
    deleted: boolean;
    id: string;
  };
}

// Toggle Prompt Mode
export interface TogglePromptParams extends CommonParameters {
  id: string;
}

export interface TogglePromptResult extends CommonResult {
  data: CustomPrompt;
}