-- Migration 013: Remove n8n_workflow_id column (n8n migration completed)

-- Drop the n8n_workflow_id column from strategies table
ALTER TABLE strategies DROP COLUMN n8n_workflow_id;

