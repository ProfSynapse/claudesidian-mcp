"""
Test the source Nexus model with transformers before MLC conversion.
Verifies the model can generate text properly.
"""
from transformers import AutoModelForCausalLM, AutoTokenizer
import torch

MODEL_PATH = "./nexus-tools-merged"

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)

print("Loading model (this may take a while)...")
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    torch_dtype=torch.float16,
    device_map="auto"
)

print("Generating test response...")
messages = [
    {"role": "user", "content": "Hello! What can you help me with?"}
]

prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
print(f"Prompt: {prompt[:200]}...")

inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
print(f"Input tokens: {inputs['input_ids'].shape[1]}")

outputs = model.generate(
    **inputs,
    max_new_tokens=100,
    temperature=0.7,
    do_sample=True,
    pad_token_id=tokenizer.pad_token_id
)

response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(f"\nFull response:\n{response}")
print(f"\nGenerated {outputs.shape[1] - inputs['input_ids'].shape[1]} tokens")
