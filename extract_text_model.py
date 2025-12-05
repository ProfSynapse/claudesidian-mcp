#!/usr/bin/env python3
"""
Extract text-only model from Qwen3-VL checkpoint.

This script extracts the language model weights from a Qwen3-VL (Vision-Language)
model, discarding the vision components to create a text-only model compatible
with MLC-LLM/WebLLM.
"""

import json
import os
import shutil
from pathlib import Path
from safetensors import safe_open
from safetensors.torch import save_file
from collections import OrderedDict

# Paths - all models stored in local-models/ directory
LOCAL_MODELS_DIR = Path("local-models")
VL_MODEL_DIR = LOCAL_MODELS_DIR / "nexus-8b-v1"
TEXT_MODEL_DIR = LOCAL_MODELS_DIR / "nexus-8b-v1-text"

def create_text_config():
    """Create a text-only config based on Qwen3-8B architecture."""

    # Read the VL config to get text_config values
    vl_config_path = VL_MODEL_DIR / "config.json"
    with open(vl_config_path, 'r') as f:
        vl_config = json.load(f)

    text_cfg = vl_config.get("text_config", {})

    # Create Qwen3-8B compatible config (text-only)
    text_config = {
        "architectures": ["Qwen3ForCausalLM"],
        "attention_bias": text_cfg.get("attention_bias", False),
        "attention_dropout": text_cfg.get("attention_dropout", 0.0),
        "bos_token_id": text_cfg.get("bos_token_id", 151643),
        "eos_token_id": text_cfg.get("eos_token_id", 151645),
        "head_dim": text_cfg.get("head_dim", 128),
        "hidden_act": text_cfg.get("hidden_act", "silu"),
        "hidden_size": text_cfg.get("hidden_size", 4096),
        "initializer_range": text_cfg.get("initializer_range", 0.02),
        "intermediate_size": text_cfg.get("intermediate_size", 12288),
        "max_position_embeddings": text_cfg.get("max_position_embeddings", 40960),
        "model_type": "qwen3",
        "num_attention_heads": text_cfg.get("num_attention_heads", 32),
        "num_hidden_layers": text_cfg.get("num_hidden_layers", 36),
        "num_key_value_heads": text_cfg.get("num_key_value_heads", 8),
        "rms_norm_eps": text_cfg.get("rms_norm_eps", 1e-06),
        "rope_scaling": text_cfg.get("rope_scaling"),
        "rope_theta": text_cfg.get("rope_theta", 1000000),
        "tie_word_embeddings": False,
        "torch_dtype": "bfloat16",
        "transformers_version": "4.51.0",
        "use_cache": True,
        "vocab_size": text_cfg.get("vocab_size", 151936),
        "use_sliding_window": False,
    }

    return text_config


def extract_text_weights():
    """Extract language model weights from VL checkpoint."""

    print("Scanning VL model shards...")

    # Find all safetensors files
    shard_files = sorted(VL_MODEL_DIR.glob("model-*.safetensors"))
    print(f"Found {len(shard_files)} shard files")

    # Read index to understand weight distribution
    index_path = VL_MODEL_DIR / "model.safetensors.index.json"
    with open(index_path, 'r') as f:
        index = json.load(f)

    weight_map = index.get("weight_map", {})

    # Identify text-only weights
    text_weights = {}
    text_weight_names = []

    for weight_name, shard_file in weight_map.items():
        # Keep language model weights, skip visual weights
        if weight_name.startswith("model.language_model.") or weight_name == "lm_head.weight":
            text_weight_names.append(weight_name)

    print(f"Found {len(text_weight_names)} text model weights")

    # Group weights by source shard
    weights_by_shard = {}
    for weight_name in text_weight_names:
        shard = weight_map[weight_name]
        if shard not in weights_by_shard:
            weights_by_shard[shard] = []
        weights_by_shard[shard].append(weight_name)

    # Extract weights from each shard
    all_text_weights = OrderedDict()

    for shard_name, weight_names in weights_by_shard.items():
        shard_path = VL_MODEL_DIR / shard_name
        print(f"Processing {shard_name} ({len(weight_names)} weights)...")

        with safe_open(shard_path, framework="pt", device="cpu") as f:
            for weight_name in weight_names:
                tensor = f.get_tensor(weight_name)

                # Rename: remove "model.language_model." prefix to match Qwen3 naming
                new_name = weight_name
                if weight_name.startswith("model.language_model."):
                    new_name = "model." + weight_name[len("model.language_model."):]

                all_text_weights[new_name] = tensor

    return all_text_weights


def save_text_model(weights, config):
    """Save extracted text model."""

    # Create output directory
    TEXT_MODEL_DIR.mkdir(exist_ok=True)

    # Save config
    config_path = TEXT_MODEL_DIR / "config.json"
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    print(f"Saved config to {config_path}")

    # Save weights as single file (or sharded if too large)
    weights_path = TEXT_MODEL_DIR / "model.safetensors"
    print(f"Saving weights to {weights_path}...")
    save_file(weights, str(weights_path))

    # Copy tokenizer files
    tokenizer_files = [
        "tokenizer.json",
        "tokenizer_config.json",
        "vocab.json",
        "merges.txt",
        "special_tokens_map.json",
        "added_tokens.json",
    ]

    for tf in tokenizer_files:
        src = VL_MODEL_DIR / tf
        if src.exists():
            dst = TEXT_MODEL_DIR / tf
            shutil.copy(src, dst)
            print(f"Copied {tf}")

    # Create generation config
    gen_config = {
        "bos_token_id": config["bos_token_id"],
        "eos_token_id": config["eos_token_id"],
        "do_sample": True,
        "temperature": 0.7,
        "top_p": 0.8,
        "top_k": 20,
        "repetition_penalty": 1.05,
    }

    gen_config_path = TEXT_MODEL_DIR / "generation_config.json"
    with open(gen_config_path, 'w') as f:
        json.dump(gen_config, f, indent=2)
    print(f"Saved generation config")

    print(f"\nText model saved to {TEXT_MODEL_DIR}")


def main():
    print("=" * 60)
    print("Qwen3-VL to Text-Only Model Extractor")
    print("=" * 60)

    # Check input exists
    if not VL_MODEL_DIR.exists():
        print(f"Error: VL model directory not found: {VL_MODEL_DIR}")
        return 1

    if not (VL_MODEL_DIR / "config.json").exists():
        print("Error: config.json not found in VL model directory")
        return 1

    # Create text config
    print("\n[1/3] Creating text-only config...")
    config = create_text_config()

    # Extract weights
    print("\n[2/3] Extracting text model weights...")
    weights = extract_text_weights()

    # Save
    print("\n[3/3] Saving text model...")
    save_text_model(weights, config)

    print("\n" + "=" * 60)
    print("Extraction complete!")
    print(f"Text model saved to: {TEXT_MODEL_DIR}")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    exit(main())
