-- Migration 017: Add analysis column to predictions table
-- Stores text analysis/reasoning from AI models

ALTER TABLE predictions ADD COLUMN analysis TEXT;

