-- Migration 006: Add workflow_runs table to store n8n workflow execution results

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  execution_id TEXT, -- n8n execution ID
  input_data TEXT, -- JSON string of input data sent to workflow (sources, strategy, etc.)
  ai_analysis TEXT, -- JSON string of AI analysis output (raw AI response)
  json_output TEXT NOT NULL, -- JSON string of structured output
  markdown_output TEXT NOT NULL, -- Markdown string for UI rendering
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for querying workflow runs by strategy
CREATE INDEX IF NOT EXISTS idx_workflow_runs_strategy_id ON workflow_runs(strategy_id);

-- Index for querying by execution_id
CREATE INDEX IF NOT EXISTS idx_workflow_runs_execution_id ON workflow_runs(execution_id);

