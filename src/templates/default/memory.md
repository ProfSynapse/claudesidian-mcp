---
title: {{1-3 word title for memory}}
description: {{one sentence description of memory}}
type: memory
subtype: {{autobiographical, core, episodic, semantic, procedural}}
tags: {{insert-tags}}
---

# Context
{{Insert any relevant context to the conversation or memory}}

# Connections
- [[{{Insert connected note name}}]] - {{insert one sentence description following a pattern of predicate object, with this memory as the subject}}

# Conversation
```json
Output a JSON object *representing* the conversation. 

Structure as a fenced in JSON codeblock with: 
"role": "human | assistant | tool",
"content": "Cleaned up and summarized dialogue or description of how the tool was used."
```

## Example JSON
```json
[
  {
    "role": "human",
    "content": "Request to create a map of contents for the Locations notes in the vault."
  },
  {
    "role": "assistant",
    "content": "Explored the vault structure and read through the Map of Contents template to understand the format."
  },
  {
    "role": "tool",
    "content": "Used the vault explorer and reader functions to view all 25 location notes."
  },
  {
    "role": "assistant",
    "content": "Created a comprehensive Map of Contents for Locations, organizing them into categories like Celestial Bodies, Moons and Stations, Gates, Sectors, Cities and Establishments, and Buildings and Facilities."
  },
  {
    "role": "human",
    "content": "Request to save the conversation as a memory."
  },
  {
    "role": "assistant",
    "content": "Created a memory of the process and saved it using the Memory Template."
  }
]
```

**Save in claudesidian/memories**