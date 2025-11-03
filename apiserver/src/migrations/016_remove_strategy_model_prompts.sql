-- Migration 016: Remove strategy_model_prompts table
-- We no longer store model-specific prompts to ensure consistency across all AI models

DROP TABLE IF EXISTS strategy_model_prompts;

