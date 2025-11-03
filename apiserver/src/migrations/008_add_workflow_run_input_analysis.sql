-- Migration 008: Add input_data and ai_analysis columns to workflow_runs table

ALTER TABLE workflow_runs ADD COLUMN input_data TEXT;
ALTER TABLE workflow_runs ADD COLUMN ai_analysis TEXT;

