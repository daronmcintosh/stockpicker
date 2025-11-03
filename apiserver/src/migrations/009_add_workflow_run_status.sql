-- Migration 009: Add status and error_message columns to workflow_runs table
-- This allows tracking workflow execution state and failures

ALTER TABLE workflow_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE workflow_runs ADD COLUMN error_message TEXT;

-- Create index for querying workflow runs by status
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);

-- Update existing workflow_runs to have 'completed' status (they were created after successful completion)
UPDATE workflow_runs SET status = 'completed' WHERE status = 'pending';

