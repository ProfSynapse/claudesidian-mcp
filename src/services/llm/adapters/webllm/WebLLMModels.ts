/**
 * WebLLM Model Specifications
 *
 * Data-driven model definitions following DRY principle.
 * Adding new quantizations or models requires only adding to this array.
 *
 * Architecture Note:
 * Nexus Tools is based on Mistral 7B Instruct v0.3, so we can use WebLLM's
 * pre-built Mistral WASM library with our custom fine-tuned weights.
 * This avoids needing Emscripten SDK for WASM compilation.
 */

import { WebLLMModelSpec } from './types';

/**
 * HuggingFace repository for MLC-compiled Nexus Tools weights
 * Contains quantized weights from professorsynapse/nexus-tools_sft17
 */
export const HF_MODEL_REPO = 'professorsynapse/nexus-tools-webllm';

/**
 * Base URL for HuggingFace model downloads
 */
export const HF_BASE_URL = 'https://huggingface.co';

/**
 * Pre-built WebLLM model library for Mistral 7B architecture
 * Since Nexus Tools is fine-tuned from Mistral 7B Instruct v0.3,
 * we can reuse WebLLM's pre-built Mistral WASM library.
 *
 * WASM libraries are hosted on GitHub at mlc-ai/binary-mlc-llm-libs
 * IMPORTANT: Version must match the WebLLM CDN version (currently v0_2_80)
 */
export const MISTRAL_MODEL_LIB_URL =
  'https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/v0_2_80/Mistral-7B-Instruct-v0.3-q4f16_1-ctx4k_cs1k-webgpu.wasm';

/**
 * Available WebLLM models
 *
 * Based on professorsynapse/nexus-tools_sft17 (Mistral 7B fine-tuned for tool calling)
 * Uses [TOOL_CALLS] content format for function calling
 */
export const WEBLLM_MODELS: WebLLMModelSpec[] = [
  {
    id: 'nexus-tools-q4f16',
    name: 'Nexus 7B',
    provider: 'webllm',
    apiName: 'nexus-tools-q4f16',
    contextWindow: 32768,
    maxTokens: 4096,
    vramRequired: 5.0,
    quantization: 'q4f16',
    huggingFaceRepo: HF_MODEL_REPO,
    // Use pre-built Mistral library since Nexus Tools shares the same architecture
    modelLibUrl: MISTRAL_MODEL_LIB_URL,
    // Files are uploaded to repo root, not in quantization subdirectory
    flatStructure: true,
    capabilities: {
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: true, // Via [TOOL_CALLS] format
      supportsStreaming: true,
      supportsThinking: false,
    },
  },
];

/**
 * Get model by ID
 */
export function getWebLLMModel(modelId: string): WebLLMModelSpec | undefined {
  return WEBLLM_MODELS.find(m => m.id === modelId || m.apiName === modelId);
}

/**
 * Get models that fit within VRAM limit
 */
export function getModelsForVRAM(availableVRAM: number): WebLLMModelSpec[] {
  // Reserve 1.5GB for OS and other applications
  const effectiveVRAM = availableVRAM - 1.5;

  return WEBLLM_MODELS
    .filter(m => m.vramRequired <= effectiveVRAM)
    .sort((a, b) => b.vramRequired - a.vramRequired); // Prefer higher quality
}

/**
 * Get the best model for available VRAM
 */
export function getBestModelForVRAM(availableVRAM: number): WebLLMModelSpec | undefined {
  const models = getModelsForVRAM(availableVRAM);
  return models[0]; // Returns highest quality that fits
}

/**
 * Get download URL for a model file
 */
export function getModelFileUrl(modelSpec: WebLLMModelSpec, fileName: string): string {
  // URL pattern: https://huggingface.co/{repo}/resolve/main/{quantization}/{file}
  return `${HF_BASE_URL}/${modelSpec.huggingFaceRepo}/resolve/main/${modelSpec.quantization}/${fileName}`;
}

/**
 * Get model manifest URL (contains list of files to download)
 */
export function getModelManifestUrl(modelSpec: WebLLMModelSpec): string {
  return getModelFileUrl(modelSpec, 'mlc-chat-config.json');
}

/**
 * Format VRAM requirement for display
 */
export function formatVRAMRequirement(vramGB: number): string {
  return `~${vramGB.toFixed(1)}GB VRAM`;
}

/**
 * Get model display info for UI
 */
export function getModelDisplayInfo(modelSpec: WebLLMModelSpec): {
  name: string;
  description: string;
  vramRequirement: string;
  recommended: boolean;
} {
  const quantName = modelSpec.quantization.toUpperCase();

  // Q4F16 is currently the only available quantization
  // It provides a good balance of speed and quality for tool-calling tasks
  const qualityNote = 'Optimized for tool-calling, uses pre-built Mistral library';

  return {
    name: modelSpec.name,
    description: `${quantName} quantization. ${qualityNote}`,
    vramRequirement: formatVRAMRequirement(modelSpec.vramRequired),
    recommended: true, // Only model available
  };
}
