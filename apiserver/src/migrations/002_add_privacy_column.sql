-- Add privacy column to predictions table
ALTER TABLE predictions ADD COLUMN privacy TEXT CHECK(privacy IN ('PREDICTION_PRIVACY_PRIVATE', 'PREDICTION_PRIVACY_PUBLIC')) DEFAULT 'PREDICTION_PRIVACY_PRIVATE';

-- Create indexes for privacy and created_at
CREATE INDEX IF NOT EXISTS idx_predictions_privacy ON predictions(privacy);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions(created_at DESC);
