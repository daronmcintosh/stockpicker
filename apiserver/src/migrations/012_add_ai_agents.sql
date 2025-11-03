-- Migration 012: Add ai_agents column to strategies table
-- Stores JSON array of AI model names to use for the strategy (e.g., ["gpt-4o-mini", "gpt-4o", "gpt-4o-mini"])

ALTER TABLE strategies ADD COLUMN ai_agents TEXT DEFAULT '["gpt-4o-mini", "gpt-4o", "gpt-4o-mini"]';

