# Nexus Model Naming Specification

**Version:** 1.0
**Date:** December 5, 2025
**Context:** Standardization for fine-tuned model release artifacts.

## 1\. The Core Schema

All fine-tuned model filenames must adhere to the following structure:

```text
Nexus - [SizeClass] - [EngineID].[BuildID]
```

### Breakdown

  * **Nexus**: The product/project identifier.
  * **SizeClass**: The physics-based designation of the model's weight.
  * **EngineID**: The provider code and base model version (e.g., `L3.1`).
  * **BuildID**: Our internal iteration number on that specific base.

-----

## 2\. The Size Hierarchy (Physics)

We use a "Building Blocks of Matter" naming convention to denote parameter size and capability. This provides an intuitive mental model for the team regarding speed vs. intelligence.

| Class Name | Parameter Range | Role | The Vibe / Use Case |
| :--- | :--- | :--- | :--- |
| **Quark** | **1B – 4B** | **Edge / Router** | *Fundamental Unit.* Fast, low-latency, mobile-ready. Used for classification, routing, and simple JSON validation. |
| **Electron** | **7B – 9B** | **Active Agent** | *Active Connector.* The "Standard" daily driver. Perfect for tool-use, API integration, and general chat. |
| **Proton** | **12B – 19B** | **Logic Core** | *Heavy Mass.* Stronger reasoning capabilities. Used for coding, complex logic chains, and data synthesis. |
| **Atom** | **20B – 32B+** | **System** | *Complete Structure.* The orchestrator. Used for creative writing, nuance, and full-context analysis. |

-----

## 3\. The Engine ID & Versioning

The version string is **Base-Dependent**. This ensures we instantly know "how old" the underlying technology is.

**Format:** `[ProviderCode][BaseVer].[InternalBuild]`

### Provider Codes

  * **L** = **Llama** (Meta)
  * **Q** = **Qwen** (Alibaba)
  * **M** = **Mistral** (Mistral AI)
  * **G** = **Gemma** (Google)
  * **P** = **Phi** (Microsoft)

### Versioning Logic

The version number is a concatenation of the **Base Model Version** and **Our Build Number**.

  * `L3.1.1` $\rightarrow$ Llama 3.1, Build 1.
  * `Q2.5.3` $\rightarrow$ Qwen 2.5, Build 3.
  * `G2.0.1` $\rightarrow$ Gemma 2, Build 1. *(Note: If base has no minor version, default to .0)*

-----

## 4\. Applied Examples

### The "Electron" (Standard Tool User)

*Scenario: We fine-tune Llama 3.1 8B for tool use.*

> **Filename:** `Nexus-Electron-L3.1.1.gguf`
> **Readable:** Nexus Electron (Standard), based on Llama 3.1, Build 1.

### The "Quark" (Fast Router)

*Scenario: We fine-tune Qwen 2.5 1.5B for fast routing.*

> **Filename:** `Nexus-Quark-Q2.5.1.gguf`
> **Readable:** Nexus Quark (Small), based on Qwen 2.5, Build 1.

### The "Atom" (The Big Brain)

*Scenario: We fine-tune Gemma 2 27B for creative writing.*

> **Filename:** `Nexus-Atom-G2.0.2.gguf`
> **Readable:** Nexus Atom (Large), based on Gemma 2, Build 2.

-----

## 5\. Model Card Template (Metadata)

While the filename is compact, the accompanying YAML/Markdown should contain the specifics.

```yaml
model_id: Nexus-Electron-L3.1.1
family: Nexus
class: Electron (8B)
base_model: meta-llama/Meta-Llama-3.1-8B
build_date: 2025-12-05
training_data: 
  - toolset_v2_clean.jsonl
  - synthetic_reasoning_d4.jsonl
quantization: q4_k_m / q8_0
description: "The primary tool-use agent. Optimized for internal API calling."
```