-- Migration 018: Add updated_at column to predictions table

ALTER TABLE predictions ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

