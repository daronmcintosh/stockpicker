-- Migration 007: Add source configuration to strategies table
-- Stores JSON configuration for which data sources to use

ALTER TABLE strategies ADD COLUMN source_config TEXT;

-- Default source config enables all common sources
-- JSON structure: { "enabled": { "alpha_vantage": true, "reddit": {...}, ... }, "reddit": { "subreddits": [...] }, ... }

