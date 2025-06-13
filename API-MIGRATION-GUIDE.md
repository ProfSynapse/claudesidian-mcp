# 🚨 VaultLibrarian API Migration Guide

## What Changed?

The VaultLibrarian search system has been **completely redesigned** from separate search modes to a **Universal Search** system.

### OLD API (No longer works)
```json
{
  "mode": "search",
  "type": "content",  // ❌ This parameter no longer exists
  "query": "machine learning"
}
```

### NEW API (Current)
```json
{
  "query": "machine learning"  // ✅ Just the query - searches everything automatically
}
```

## 🎯 Key Changes

### ✅ Universal Search
- **ONE search mode** replaces all previous modes
- **Searches everything automatically**: file names, folder names, file content, workspaces, sessions, etc.
- **No type parameter needed** - the system intelligently searches all categories

### 🔍 What Gets Searched Automatically

| Category | What it searches | Method |
|----------|------------------|---------|
| `files` | File names | Fuzzy matching |
| `folders` | Folder names | Fuzzy matching |
| `content` | File content | Semantic + text search |
| `workspaces` | Workspace data | Semantic + text search |
| `sessions` | Session data | Semantic + text search |
| `snapshots` | Snapshot data | Semantic + text search |
| `memory_traces` | Memory traces | Semantic + text search |
| `tags` | File tags | Exact + fuzzy matching |
| `properties` | Frontmatter properties | Exact + fuzzy matching |

## 🛠 Migration Examples

### Example 1: Find files by name
**OLD:**
```json
{
  "mode": "search",
  "type": "content",
  "query": "README"
}
```

**NEW:**
```json
{
  "query": "README"
}
```
*Will automatically search file names, folder names, AND content for "README"*

### Example 2: Search specific categories only
**NEW:**
```json
{
  "query": "machine learning",
  "prioritizeCategories": ["files", "content"],
  "excludeCategories": ["sessions", "snapshots"]
}
```

### Example 3: Batch searches
**NEW:**
```json
{
  "searches": [
    {"query": "project planning"},
    {"query": "typescript config"},
    {"query": "meeting notes"}
  ]
}
```

## 📋 Available Tools

1. **`search`** - Universal search across all content types
2. **`batch`** - Multiple universal searches concurrently

## 🎯 Required vs Optional Parameters

### Required
- `query` (string) - The search query

### Optional (all optional)
- `limit` (number) - Results per category (default: 5)
- `excludeCategories` (array) - Categories to skip
- `prioritizeCategories` (array) - Categories to emphasize
- `paths` (array) - Restrict to specific folders
- `includeContent` (boolean) - Include full content in results
- `forceSemanticSearch` (boolean) - Force semantic search
- `semanticThreshold` (number) - Similarity threshold for semantic search
- Graph boost options: `useGraphBoost`, `graphBoostFactor`, etc.

## 🚨 Breaking Changes

1. **No more `type` parameter** - Was required in old API, now completely removed
2. **No more `tag` or `key` parameters** - Tags and properties are searched automatically
3. **Mode parameter** - Always use `"search"` or `"batch"`
4. **Results structure** - Now organized by categories with unified format

## ✅ Why This is Better

1. **Simpler usage** - Just provide a query, get comprehensive results
2. **More intelligent** - Automatically determines best search method per category
3. **Comprehensive** - Never miss results because you picked the wrong search type
4. **Faster** - Searches all categories concurrently
5. **Flexible** - Fine-tune with optional parameters when needed

## 🎯 Pro Tips for Claude Desktop

1. **Start simple** - Just use `{"query": "your search term"}`
2. **Use natural language** - The system handles different content types intelligently
3. **Prioritize categories** - If you know what you're looking for, use `prioritizeCategories`
4. **Exclude noise** - Use `excludeCategories` to remove irrelevant categories
5. **Batch searches** - Use the batch mode for complex multi-query operations

The new system is designed to work perfectly with LLMs like Claude - just ask for what you want!