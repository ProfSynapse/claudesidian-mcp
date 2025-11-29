"""
Download the full model for MLC compilation.
professorsynapse/nexus-tools_sft17 is already a merged model (not a LoRA adapter).
"""
from huggingface_hub import snapshot_download
import os

MODEL_ID = "professorsynapse/nexus-tools_sft17"
OUTPUT_DIR = "./nexus-tools-merged"

print(f"Downloading model: {MODEL_ID}")
print("This will download ~15GB on first run...")

# Download the full model
snapshot_download(
    repo_id=MODEL_ID,
    local_dir=OUTPUT_DIR,
    local_dir_use_symlinks=False,
    resume_download=True
)

print(f"Done! Model downloaded to: {OUTPUT_DIR}")
