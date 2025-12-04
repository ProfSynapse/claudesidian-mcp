/**
 * SQLite Schema for Hybrid Storage System
 * Location: src/database/schema/schema.ts
 * Purpose: Complete database schema with indexes and FTS
 * Version: 1.0.0
 */

export const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- ==================== WORKSPACES ====================

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  root_folder TEXT NOT NULL,
  created INTEGER NOT NULL,
  last_accessed INTEGER NOT NULL,
  is_active INTEGER DEFAULT 0,
  context_json TEXT,
  dedicated_agent_id TEXT,
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_name ON workspaces(name);
CREATE INDEX IF NOT EXISTS idx_workspaces_folder ON workspaces(root_folder);
CREATE INDEX IF NOT EXISTS idx_workspaces_active ON workspaces(is_active);
CREATE INDEX IF NOT EXISTS idx_workspaces_accessed ON workspaces(last_accessed);

-- ==================== SESSIONS ====================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  start_time INTEGER,
  end_time INTEGER,
  is_active INTEGER DEFAULT 0,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions(start_time);

-- ==================== STATES ====================

CREATE TABLE IF NOT EXISTS states (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created INTEGER NOT NULL,
  state_json TEXT,
  tags_json TEXT,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_states_session ON states(session_id);
CREATE INDEX IF NOT EXISTS idx_states_workspace ON states(workspace_id);
CREATE INDEX IF NOT EXISTS idx_states_created ON states(created);

-- ==================== MEMORY TRACES ====================

CREATE TABLE IF NOT EXISTS memory_traces (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  trace_type TEXT,
  content TEXT,
  metadata_json TEXT,
  FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_traces_session ON memory_traces(session_id);
CREATE INDEX IF NOT EXISTS idx_traces_workspace ON memory_traces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON memory_traces(timestamp);
CREATE INDEX IF NOT EXISTS idx_traces_type ON memory_traces(trace_type);

-- ==================== CONVERSATIONS ====================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  vault_name TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversations_vault ON conversations(vault_name);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created);

-- ==================== MESSAGES ====================

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  timestamp INTEGER NOT NULL,
  state TEXT,
  tool_calls_json TEXT,
  tool_call_id TEXT,
  reasoning_content TEXT,
  sequence_number INTEGER NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_sequence ON messages(conversation_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);

-- ==================== FULL-TEXT SEARCH (FTS4) ====================
-- Note: Using FTS4 instead of FTS5 for compatibility with default sql.js build

CREATE VIRTUAL TABLE IF NOT EXISTS workspace_fts USING fts4(
  id,
  name,
  description,
  content='workspaces',
  tokenize=porter
);

CREATE TRIGGER IF NOT EXISTS workspace_fts_insert AFTER INSERT ON workspaces BEGIN
  INSERT INTO workspace_fts(docid, id, name, description)
  VALUES (new.rowid, new.id, new.name, new.description);
END;

CREATE TRIGGER IF NOT EXISTS workspace_fts_delete AFTER DELETE ON workspaces BEGIN
  DELETE FROM workspace_fts WHERE docid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS workspace_fts_update AFTER UPDATE ON workspaces BEGIN
  DELETE FROM workspace_fts WHERE docid = old.rowid;
  INSERT INTO workspace_fts(docid, id, name, description)
  VALUES (new.rowid, new.id, new.name, new.description);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS conversation_fts USING fts4(
  id,
  title,
  content='conversations',
  tokenize=porter
);

CREATE TRIGGER IF NOT EXISTS conversation_fts_insert AFTER INSERT ON conversations BEGIN
  INSERT INTO conversation_fts(docid, id, title)
  VALUES (new.rowid, new.id, new.title);
END;

CREATE TRIGGER IF NOT EXISTS conversation_fts_delete AFTER DELETE ON conversations BEGIN
  DELETE FROM conversation_fts WHERE docid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS conversation_fts_update AFTER UPDATE ON conversations BEGIN
  DELETE FROM conversation_fts WHERE docid = old.rowid;
  INSERT INTO conversation_fts(docid, id, title)
  VALUES (new.rowid, new.id, new.title);
END;

CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts4(
  id,
  conversation_id,
  content,
  reasoning_content,
  content='messages',
  tokenize=porter
);

CREATE TRIGGER IF NOT EXISTS message_fts_insert AFTER INSERT ON messages BEGIN
  INSERT INTO message_fts(docid, id, conversation_id, content, reasoning_content)
  VALUES (new.rowid, new.id, new.conversation_id, new.content, new.reasoning_content);
END;

CREATE TRIGGER IF NOT EXISTS message_fts_delete AFTER DELETE ON messages BEGIN
  DELETE FROM message_fts WHERE docid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS message_fts_update AFTER UPDATE ON messages BEGIN
  DELETE FROM message_fts WHERE docid = old.rowid;
  INSERT INTO message_fts(docid, id, conversation_id, content, reasoning_content)
  VALUES (new.rowid, new.id, new.conversation_id, new.content, new.reasoning_content);
END;

-- ==================== SYNC STATE ====================

CREATE TABLE IF NOT EXISTS sync_state (
  device_id TEXT PRIMARY KEY,
  last_event_timestamp INTEGER NOT NULL,
  synced_files_json TEXT
);

CREATE TABLE IF NOT EXISTS applied_events (
  event_id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_applied_events_time ON applied_events(applied_at);

-- ==================== INITIALIZATION ====================

INSERT OR IGNORE INTO schema_version VALUES (1, strftime('%s', 'now') * 1000);
`;
