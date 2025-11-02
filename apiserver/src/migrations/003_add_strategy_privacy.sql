-- Add privacy column to strategies table
ALTER TABLE strategies ADD COLUMN privacy TEXT CHECK(privacy IN ('STRATEGY_PRIVACY_PRIVATE', 'STRATEGY_PRIVACY_PUBLIC')) DEFAULT 'STRATEGY_PRIVACY_PRIVATE';

-- Create index for privacy
CREATE INDEX IF NOT EXISTS idx_strategies_privacy ON strategies(privacy);

