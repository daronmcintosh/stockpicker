-- Add source column to predictions table
ALTER TABLE predictions ADD COLUMN source TEXT CHECK(source IN ('PREDICTION_SOURCE_UNSPECIFIED', 'PREDICTION_SOURCE_AI', 'PREDICTION_SOURCE_MANUAL')) DEFAULT 'PREDICTION_SOURCE_UNSPECIFIED';

-- Create index for source
CREATE INDEX IF NOT EXISTS idx_predictions_source ON predictions(source);

