# WebLLM Model Setup Guide

This guide covers how to prepare your fine-tuned LoRA model (`professorsynapse/nexus-tools_sft17`) for use with WebLLM in Nexus.

## Overview

WebLLM requires models to be compiled to MLC format. Since WebLLM doesn't support runtime LoRA loading, you must:

1. **Merge** your LoRA adapter with the base model (Mistral 7B Instruct v0.3)
2. **Compile** the merged model for WebGPU using MLC LLM
3. **Upload** to HuggingFace
4. **Update** `WebLLMModels.ts` with your model URL

---

## Prerequisites

### System Requirements
- macOS with Apple Silicon (M1/M2/M3/M4) - tested on M4 24GB
- Python 3.11 (installed via Homebrew)
- ~24GB unified memory recommended for merging
- ~50GB disk space for model files

### Local Environment (Already Set Up)

A Python virtual environment is already configured in this repo:

```bash
# Activate the existing venv
source mlc-venv/bin/activate

# Verify installation
python -m mlc_llm --help
```

**Installed packages:**
- `torch`, `transformers`, `accelerate`, `peft` - for LoRA merging
- `mlc-llm-nightly-cpu`, `mlc-ai-nightly-cpu` - for WebGPU compilation
- `huggingface_hub`, `safetensors` - for model handling

### If Setting Up Fresh (or on another machine)

```bash
# Install Python 3.11 via Homebrew (if not installed)
brew install python@3.11

# Create venv
/opt/homebrew/bin/python3.11 -m venv mlc-venv
source mlc-venv/bin/activate

# Install dependencies
pip install torch transformers accelerate peft huggingface_hub safetensors
pip install --pre -U -f https://mlc.ai/wheels mlc-llm-nightly-cpu mlc-ai-nightly-cpu

# Login to HuggingFace (for uploading)
huggingface-cli login
```

---

## Method 1: Using Transformers + PEFT

Use this method if your LoRA was trained with standard PEFT/transformers.

### Step 1: Merge LoRA with Base Model

Create a file `merge_lora.py`:

```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel
import os

# Configuration
BASE_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
LORA_PATH = "professorsynapse/nexus-tools_sft17"  # Or local path
OUTPUT_DIR = "./nexus-tools-merged"

print(f"Loading base model: {BASE_MODEL}")
base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    torch_dtype=torch.float16,
    device_map="auto",  # Automatically handle GPU/CPU
    trust_remote_code=True
)

print(f"Loading LoRA adapter: {LORA_PATH}")
model = PeftModel.from_pretrained(
    base_model,
    LORA_PATH,
    torch_dtype=torch.float16
)

print("Merging LoRA weights into base model...")
merged_model = model.merge_and_unload()

print(f"Saving merged model to: {OUTPUT_DIR}")
os.makedirs(OUTPUT_DIR, exist_ok=True)
merged_model.save_pretrained(OUTPUT_DIR, safe_serialization=True)

# Save tokenizer
print("Saving tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
tokenizer.save_pretrained(OUTPUT_DIR)

print("Done! Merged model saved to:", OUTPUT_DIR)
```

Run the merge:

```bash
source mlc-venv/bin/activate
python merge_lora.py
```

### Step 2: Verify the Merged Model (Optional)

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline

model = AutoModelForCausalLM.from_pretrained("./nexus-tools-merged", torch_dtype=torch.float16, device_map="auto")
tokenizer = AutoTokenizer.from_pretrained("./nexus-tools-merged")

pipe = pipeline("text-generation", model=model, tokenizer=tokenizer)
result = pipe("Hello, how can I help you today?", max_new_tokens=50)
print(result[0]['generated_text'])
```

---

## Method 2: Using LLaMA Factory

Use this method if your model was trained with LLaMA Factory.

### Step 1: Install LLaMA Factory

```bash
git clone https://github.com/hiyouga/LLaMA-Factory.git
cd LLaMA-Factory
pip install -e .
```

### Step 2: Create Export Config

Create `merge_config.yaml`:

```yaml
### Model
model_name_or_path: mistralai/Mistral-7B-Instruct-v0.3
adapter_name_or_path: professorsynapse/nexus-tools_sft17

### Export
export_dir: ./nexus-tools-merged
export_size: 2  # Split into 2GB shards
export_device: auto
export_legacy_format: false  # Use safetensors
```

### Step 3: Run Export

```bash
llamafactory-cli export merge_config.yaml
```

---

## Compile for WebGPU (Both Methods)

After merging, compile the model for WebLLM:

### Step 1: Create MLC Config

Create `mlc_config.json` in your merged model directory:

```json
{
  "model_type": "mistral",
  "quantization": "q4f16_1",
  "context_window_size": 32768,
  "prefill_chunk_size": 1024,
  "tensor_parallel_shards": 1
}
```

### Step 2: Compile for Each Quantization

```bash
# Make sure venv is activated
source mlc-venv/bin/activate

# Q4F16 - Smallest, fastest (~5GB VRAM)
python -m mlc_llm compile ./nexus-tools-merged \
  --quantization q4f16_1 \
  --target webgpu \
  --output ./nexus-tools-q4f16-mlc

# Q4F32 - No shader-f16 requirement (~6GB VRAM)
python -m mlc_llm compile ./nexus-tools-merged \
  --quantization q4f32_1 \
  --target webgpu \
  --output ./nexus-tools-q4f32-mlc

# Q8F16 - Higher quality (~8GB VRAM) [Optional]
python -m mlc_llm compile ./nexus-tools-merged \
  --quantization q8f16_1 \
  --target webgpu \
  --output ./nexus-tools-q8f16-mlc
```

### Compilation Output

Each compilation creates:
- `params/` - Quantized model weights
- `*.wasm` - WebAssembly module
- `mlc-chat-config.json` - Model configuration
- `tokenizer.json` - Tokenizer files

---

## Upload to HuggingFace

### Step 1: Create Repository

```bash
huggingface-cli repo create nexus-tools-webllm --type model
```

### Step 2: Upload Compiled Models

```bash
# Upload Q4F16 variant
cd nexus-tools-q4f16-mlc
huggingface-cli upload professorsynapse/nexus-tools-webllm . \
  --repo-type model \
  --commit-message "Add Q4F16 WebLLM variant"

# Repeat for other quantizations if needed
```

### Repository Structure

Your HuggingFace repo should look like:

```
nexus-tools-webllm/
├── q4f16/
│   ├── params/
│   ├── tokenizer.json
│   ├── mlc-chat-config.json
│   └── *.wasm
├── q4f32/
│   └── ...
└── README.md
```

---

## Update Nexus

### Step 1: Update WebLLMModels.ts

Edit `src/services/llm/adapters/webllm/WebLLMModels.ts`:

```typescript
export const WEBLLM_MODELS: WebLLMModelSpec[] = [
  {
    id: 'nexus-tools-q4f16',
    name: 'Nexus Tools (Q4F16)',
    apiName: 'professorsynapse/nexus-tools-webllm-q4f16',  // Your HF repo
    quantization: 'q4f16',
    contextWindow: 32768,
    maxTokens: 4096,
    vramRequired: 5,
    capabilities: {
      supportsJSON: true,
      supportsImages: false,
      supportsFunctions: true,  // [TOOL_CALLS] format
      supportsStreaming: true,
      supportsThinking: false,
    },
    hfRepo: 'professorsynapse/nexus-tools-webllm',
    hfPath: 'q4f16',
  },
  // Add Q4F32, Q8F16 variants as needed
];
```

### Step 2: Rebuild Plugin

```bash
npm run build
```

---

## Troubleshooting

### Memory Issues During Merge

If you run out of memory:

```python
# Use CPU offloading
base_model = AutoModelForCausalLM.from_pretrained(
    BASE_MODEL,
    torch_dtype=torch.float16,
    device_map="cpu",  # Force CPU
    low_cpu_mem_usage=True
)
```

### MLC Compilation Errors

1. **"Model type not supported"**: Ensure `model_type` in config matches (mistral, llama, etc.)
2. **"Out of memory"**: Try smaller `prefill_chunk_size` (512 or 256)
3. **"WebGPU target not found"**: Update MLC LLM: `pip install -U mlc-llm`

### WebLLM Loading Issues

1. **CORS errors**: Models must be served from HTTPS or localhost
2. **"shader-f16 not supported"**: Use q4f32 variant instead of q4f16
3. **"Model too large"**: GPU doesn't have enough VRAM for chosen quantization

---

## Quick Reference

| Quantization | VRAM Required | Quality | Speed | WebGPU Feature |
|--------------|---------------|---------|-------|----------------|
| q4f16_1 | ~5GB | Good | Fastest | shader-f16 |
| q4f32_1 | ~6GB | Good | Fast | None |
| q8f16_1 | ~8GB | Better | Slower | shader-f16 |

---

## Resources

- [MLC LLM Documentation](https://llm.mlc.ai/docs/)
- [WebLLM GitHub](https://github.com/mlc-ai/web-llm)
- [PEFT Documentation](https://huggingface.co/docs/peft)
- [LLaMA Factory](https://github.com/hiyouga/LLaMA-Factory)
- [HuggingFace Hub CLI](https://huggingface.co/docs/huggingface_hub/guides/cli)
