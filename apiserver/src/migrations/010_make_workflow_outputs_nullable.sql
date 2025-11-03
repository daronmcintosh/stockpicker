-- Migration 010: Make json_output and markdown_output nullable in workflow_runs
-- These fields are only populated when the workflow completes successfully
-- They should be NULL when the workflow is pending/running/failed

-- First, update existing records that might have empty strings or invalid data
UPDATE workflow_runs 
SET json_output = NULL 
WHERE json_output IS NULL OR json_output = '' OR json_output = '{}';

UPDATE workflow_runs 
SET markdown_output = NULL 
WHERE markdown_output IS NULL OR markdown_output = '';

-- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
-- Create new table with nullable columns
CREATE TABLE IF NOT EXISTS workflow_runs_new (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  execution_id TEXT,
  input_data TEXT,
  ai_analysis TEXT,
  json_output TEXT, -- Made nullable - only populated when workflow completes
  markdown_output TEXT, -- Made nullable - only populated when workflow completes
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copy data from old table to new table
INSERT INTO workflow_runs_new 
SELECT 
  id, strategy_id, execution_id, input_data, ai_analysis,
  CASE WHEN json_output IS NULL OR json_output = '' OR json_output = '{}' THEN NULL ELSE json_output END,
  CASE WHEN markdown_output IS NULL OR markdown_output = '' THEN NULL ELSE markdown_output END,
  COALESCE(status, 'completed'),
  error_message,
  created_at,
  updated_at
FROM workflow_runs;

-- Drop old table
DROP TABLE workflow_runs;

-- Rename new table
ALTER TABLE workflow_runs_new RENAME TO workflow_runs;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_workflow_runs_strategy_id ON workflow_runs(strategy_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_execution_id ON workflow_runs(execution_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);

