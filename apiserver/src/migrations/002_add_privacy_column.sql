-- Migration 002: Add privacy column to predictions table
-- NOTE: This column is now included in 001_initial_schema.sql
-- This migration is kept for historical tracking but is no longer needed
-- The privacy column for predictions was added to the initial schema
-- If you see this migration trying to run, it means your database was created
-- with an older version of the schema. For new databases, this is a no-op.

-- Check if privacy column exists using a workaround (SQLite doesn't support IF NOT EXISTS for ALTER TABLE)
-- We'll try to add it and ignore the error if it already exists
-- However, since this is handled at the schema level now, this should not execute for new databases

-- The privacy column is already in 001_initial_schema.sql, so this is a no-op for new databases
-- Only create indexes (which are idempotent)
CREATE INDEX IF NOT EXISTS idx_predictions_privacy ON predictions(privacy);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions(created_at DESC);
