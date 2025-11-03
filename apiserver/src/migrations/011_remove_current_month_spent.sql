-- Migration 011: Remove current_month_spent column from strategies table
-- This column is no longer needed as current_month_spent is calculated
-- dynamically from active predictions (where action = 'entered')

-- SQLite doesn't support DROP COLUMN, so we need to recreate the table
-- Create new table without current_month_spent
CREATE TABLE IF NOT EXISTS strategies_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  custom_prompt TEXT,
  status TEXT CHECK(status IN ('STRATEGY_STATUS_ACTIVE', 'STRATEGY_STATUS_PAUSED', 'STRATEGY_STATUS_STOPPED')) DEFAULT 'STRATEGY_STATUS_ACTIVE',
  monthly_budget DECIMAL(10,2) NOT NULL,
  current_month_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_horizon TEXT DEFAULT '3 months',
  target_return_pct DECIMAL(5,2) DEFAULT 10.0,
  frequency TEXT DEFAULT 'FREQUENCY_TWICE_WEEKLY',
  trades_per_month INTEGER,
  per_trade_budget DECIMAL(10,2),
  per_stock_allocation DECIMAL(10,2),
  risk_level TEXT CHECK(risk_level IN ('RISK_LEVEL_LOW', 'RISK_LEVEL_MEDIUM', 'RISK_LEVEL_HIGH')) DEFAULT 'RISK_LEVEL_MEDIUM',
  unique_stocks_count INTEGER DEFAULT 0,
  max_unique_stocks INTEGER DEFAULT 20,
  n8n_workflow_id TEXT,
  next_trade_scheduled TIMESTAMP,
  last_trade_executed TIMESTAMP,
  privacy TEXT CHECK(privacy IN ('STRATEGY_PRIVACY_PRIVATE', 'STRATEGY_PRIVACY_PUBLIC')) DEFAULT 'STRATEGY_PRIVACY_PRIVATE',
  user_id TEXT REFERENCES users(id),
  source_config TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from old table to new table (excluding current_month_spent)
INSERT INTO strategies_new (
  id, name, description, custom_prompt, status, monthly_budget,
  current_month_start, time_horizon, target_return_pct, frequency,
  trades_per_month, per_trade_budget, per_stock_allocation, risk_level,
  unique_stocks_count, max_unique_stocks, n8n_workflow_id, next_trade_scheduled,
  last_trade_executed, privacy, user_id, source_config, created_at, updated_at
)
SELECT 
  id, name, description, custom_prompt, status, monthly_budget,
  current_month_start, time_horizon, target_return_pct, frequency,
  trades_per_month, per_trade_budget, per_stock_allocation, risk_level,
  unique_stocks_count, max_unique_stocks, n8n_workflow_id, next_trade_scheduled,
  last_trade_executed, privacy, user_id, source_config, created_at, updated_at
FROM strategies;

-- Drop old table
DROP TABLE strategies;

-- Rename new table
ALTER TABLE strategies_new RENAME TO strategies;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_strategies_privacy ON strategies(privacy);

