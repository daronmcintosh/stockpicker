-- Migration 015: Add ai_models column to predictions table
-- Stores JSON array of AI model names that suggested this prediction (e.g., ["gpt-4o", "gpt-4o-mini"])
-- Used for tracing which models recommended each stock

ALTER TABLE predictions ADD COLUMN ai_models TEXT;

