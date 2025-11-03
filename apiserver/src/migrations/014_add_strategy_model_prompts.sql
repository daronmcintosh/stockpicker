-- Migration 014: Add strategy_model_prompts table
-- Stores base prompts generated for each AI model per strategy
-- These prompts are generated at strategy creation from template + strategy inputs + custom_prompt

CREATE TABLE IF NOT EXISTS strategy_model_prompts (
  id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(strategy_id, model_name)
);

-- Index for fast lookups by strategy_id
CREATE INDEX IF NOT EXISTS idx_strategy_model_prompts_strategy_id ON strategy_model_prompts(strategy_id);

