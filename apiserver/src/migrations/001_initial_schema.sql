-- strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  custom_prompt TEXT,
  status TEXT CHECK(status IN ('STRATEGY_STATUS_ACTIVE', 'STRATEGY_STATUS_PAUSED', 'STRATEGY_STATUS_STOPPED')) DEFAULT 'STRATEGY_STATUS_ACTIVE',
  monthly_budget DECIMAL(10,2) NOT NULL,
  current_month_spent DECIMAL(10,2) DEFAULT 0,
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for strategy privacy
CREATE INDEX IF NOT EXISTS idx_strategies_privacy ON strategies(privacy);

-- predictions table
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  strategy_id TEXT REFERENCES strategies(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  entry_price DECIMAL(10,2) NOT NULL,
  allocated_amount DECIMAL(10,2) NOT NULL,
  time_horizon_days INTEGER,
  evaluation_date DATE,
  target_return_pct DECIMAL(5,2),
  target_price DECIMAL(10,2),
  stop_loss_pct DECIMAL(5,2),
  stop_loss_price DECIMAL(10,2),
  stop_loss_dollar_impact DECIMAL(10,2),
  risk_level TEXT,
  technical_analysis TEXT,  -- JSON stored as TEXT in SQLite
  sentiment_score DECIMAL(5,2),
  overall_score DECIMAL(5,2),
  action TEXT CHECK(action IN ('pending', 'entered', 'dismissed')) DEFAULT 'pending',
  status TEXT CHECK(status IN ('PREDICTION_STATUS_ACTIVE', 'PREDICTION_STATUS_HIT_TARGET', 'PREDICTION_STATUS_HIT_STOP', 'PREDICTION_STATUS_EXPIRED')) DEFAULT 'PREDICTION_STATUS_ACTIVE',
  current_price DECIMAL(10,2),
  current_return_pct DECIMAL(5,2),
  closed_at TIMESTAMP,
  closed_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  privacy TEXT CHECK(privacy IN ('PREDICTION_PRIVACY_PRIVATE', 'PREDICTION_PRIVACY_PUBLIC')) DEFAULT 'PREDICTION_PRIVACY_PRIVATE'
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_predictions_strategy ON predictions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON predictions(symbol);
CREATE INDEX IF NOT EXISTS idx_predictions_action ON predictions(action);
CREATE INDEX IF NOT EXISTS idx_predictions_privacy ON predictions(privacy);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions(created_at DESC);

