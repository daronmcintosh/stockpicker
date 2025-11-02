-- Migration 003: Add privacy column to strategies table
-- NOTE: This column is now included in 001_initial_schema.sql
-- This migration is kept for historical tracking but is no longer needed
-- The privacy column for strategies was added to the initial schema
-- If you see this migration trying to run, it means your database was created
-- with an older version of the schema. For new databases, this is a no-op.

-- The privacy column is already in 001_initial_schema.sql, so this is a no-op for new databases
-- Only create index (which is idempotent)
CREATE INDEX IF NOT EXISTS idx_strategies_privacy ON strategies(privacy);

