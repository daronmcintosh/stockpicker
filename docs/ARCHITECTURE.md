# Architecture

## System Overview

```
┌─────────────┐
│  UI (React) │
└──────┬──────┘
       │
       │ HTTP API
       ▼
┌──────────────────────────────────────────┐
│      Express API Server                   │
│  ┌────────────────────────────────────┐  │
│  │ Strategy Management (CRUD)          │  │
│  │ - Create/Update/Delete strategies   │  │
│  │ - Start/Pause/Stop                  │  │
│  │ - Calculate allocations             │  │
│  └──────────┬──────────────────────────┘  │
│             │                              │
│                                              │
│  ┌──────────▼──────────────────────────┐  │
│  │ Data Management                     │  │
│  │ - Store/read from SQLite            │  │
│  │ - Handle predictions, budget        │  │
│  └──────────┬──────────────────────────┘  │
└─────────────┼──────────────────────────────┘
              │
              ▼
      ┌─────────────┐
      │   SQLite    │
      │  database   │
      └─────────────┘
```

## Docker Compose Architecture

```yaml
services:
  server:
    - Express API server
    - Exposed on :3000/api
    - Connects to SQLite

  ui:
    - React frontend
    - Exposed on :3000
    - Calls server API

  # All share ./data volume for SQLite
```

## Database Schema

### strategies
```sql
-- Note: Calculated fields (not stored):
--   - current_month_spent: SUM(allocated_amount) from predictions WHERE action='entered' AND in current month
--   - predictions_per_month: COUNT(*) from predictions WHERE action='entered' AND in current month
--   - per_prediction_budget: monthly_budget / predictions_per_month (or use frequency-based estimate if no predictions yet)
--   - per_stock_allocation: per_trade_budget / 3
--   - unique_stocks_count: COUNT(DISTINCT symbol) from predictions WHERE action='entered' AND status='active'
--   - last_trade_executed: MAX(created_at) from predictions WHERE action='entered'
CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  custom_prompt TEXT,
  status TEXT CHECK(status IN ('active', 'paused', 'stopped')),
  monthly_budget DECIMAL(10,2) NOT NULL,
  time_horizon TEXT DEFAULT '3 months',  -- "1 week", "3 months", etc.
  target_return_pct DECIMAL(5,2) DEFAULT 10.0,
  frequency TEXT DEFAULT 'twice_weekly',  -- "daily", "twice_weekly", "weekly", etc.
  risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high')) DEFAULT 'medium',
  max_unique_stocks INTEGER DEFAULT 20
);
```

### predictions
```sql
CREATE TABLE predictions (
  id TEXT PRIMARY KEY,
  strategy_id TEXT REFERENCES strategies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
  status TEXT CHECK(status IN ('active', 'hit_target', 'hit_stop', 'expired')) DEFAULT 'active',
  current_price DECIMAL(10,2),
  current_return_pct DECIMAL(5,2),
  closed_at TIMESTAMP,
  closed_reason TEXT
);
```

**Action Field:**
- `pending`: Newly created prediction (default), user hasn't acted yet
- `entered`: User executed/purchased this prediction (counts toward budget/spent)
- `dismissed`: User dismissed this prediction (doesn't count toward budget/spent)

**Note:** Budget spent and unique stocks count are calculated only from predictions where `action='entered'`.

## Strategy Management (Server-Side)

**Handled by:** Express API Server

**Responsibilities:**
- Create/Read/Update/Delete strategies (REST API)
- Store strategy configuration in SQLite
- Calculate derived values on-demand (budget spent, allocations, etc.)
- Manage strategy status (active/paused/stopped)
// Background jobs are managed internally by the server (no external orchestrator)

**When Strategy is Created:**
1. Server validates inputs
2. Server saves strategy config to SQLite (only user-provided fields)
3. Server schedules internal background jobs for the strategy based on frequency
4. Jobs execute analysis and create predictions as needed

**Calculated Fields (Computed On-Demand):**
- `current_month_spent`: `SUM(allocated_amount)` from predictions WHERE `action='entered'` AND in current month
- `predictions_per_month`: `COUNT(*)` from predictions WHERE `action='entered'` AND in current month (actual count, not estimated)
- `per_prediction_budget`: `monthly_budget / predictions_per_month` (if no predictions yet, use frequency-based estimate: daily=20, twice_weekly=8, weekly=4, monthly=1)
- `per_stock_allocation`: `per_trade_budget / 3`
- `unique_stocks_count`: `COUNT(DISTINCT symbol)` from predictions WHERE `action='entered'` AND `status='active'`
- `last_trade_executed`: `MAX(created_at)` from predictions WHERE `action='entered'`

**When Strategy is Paused/Stopped:**
- Server disables internal background jobs for the strategy
- Jobs can be re-enabled when the strategy resumes

## Background Jobs

The server includes an internal scheduler that runs jobs for:
- Scheduled prediction generation per strategy (based on frequency)
- Daily performance tracking
- Monthly performance summaries

## API Integrations

### Alpha Vantage (Technical Data)
- **Endpoint:** https://www.alphavantage.co/query
- **Rate Limit:** 25 calls/day, 5 calls/minute (free tier)
- **Data:**
  - Daily prices (EOD)
  - Technical indicators (RSI, MACD, SMA, EMA)
  - Volume data
- **Strategy:** Cache aggressively, batch requests, use pre-calculated indicators

### Reddit API (Sentiment)
- **Endpoint:** https://oauth.reddit.com/api/
- **Rate Limit:** 60 requests/minute (free)
- **Subreddits:** r/wallstreetbets, r/stocks, r/investing
- **Process:**
  1. Fetch top posts from last 24h
  2. Extract stock tickers ($SYMBOL or SYMBOL pattern)
  3. Count mentions
  4. Apply VADER sentiment to comments
  5. Calculate sentiment score (-1 to +1)

### Seeking Alpha (Analyst Ratings)
- **Endpoint:** RSS feeds (no API key needed)
- **Data:** Article headlines, ratings, price targets
- **Process:** Parse RSS, extract ratings, match to stocks

## Key Concepts

### Always-On Operation
- System runs indefinitely until user stops it
- Time horizon = analysis parameter, NOT duration
- Monthly performance summaries generated automatically
- New stock picks every trade (not same stocks repeatedly)

### Monthly Budget Calculation
```
Monthly Budget: $1,000
Frequency: Twice Weekly (8 predictions/month)

Per-Prediction Budget: $1,000 ÷ 8 = $125
Per-Stock Allocation: $125 ÷ 3 = $41.67
```

### Custom Prompts
- Applied during stock screening
- Filters candidate list
- Influences ranking/scoring
- Examples:
  - "Focus on AI and semiconductor stocks"
  - "Avoid recent IPOs and penny stocks"
  - "Prioritize dividend-paying blue chips"

### Scoring Algorithm
```
Composite Score = (Technical × 0.4) +
                  (Sentiment × 0.3) +
                  (Analyst × 0.2) +
                  (Momentum × 0.1)

Adjusted by:
- Risk level filters (volatility threshold)
- Time horizon (indicator selection)
- Custom prompt preferences
```

## Data Flow

### Strategy Creation
```
UI Form → Express API
  → Validate inputs
  → Create strategy record in SQLite (store config only)
  → Schedule internal background jobs for the strategy
  → Return strategy ID
```

### Trade Execution (Scheduled)
```
Cron Trigger → Internal Job (per strategy)
  → Query strategy via API (`GET /api/strategies/:id`)
  → Check strategy status (skip if paused/stopped)
  → Check monthly budget remaining (calculated from predictions WHERE `action='entered'` in current month)
  → Call Analysis Agent subflow
    → Fetch data (Alpha Vantage, Reddit, Seeking Alpha)
    → Filter & Score stocks
    → Return top 10
  → Select top 3 (first 3 from top 10)
  → Create 3 prediction records (via API: `POST /api/predictions`)
    → Created with `action='pending'` by default
    → User marks as `'entered'` or `'dismissed'` via UI
  → Budget and unique stocks automatically updated (calculated from predictions WHERE `action='entered'`)
  → Notify UI via webhook (optional)
```

### Performance Tracking (Daily)
```
Cron (4:30 PM EST) → Internal Job
  → Query active predictions WHERE `action='entered'`
  → Fetch current prices (Alpha Vantage)
  → Calculate returns
  → Check stop loss/target
  → Update prediction status
  → Store snapshot (only for entered predictions)
```

## Technology Decisions

### Why SQLite?
- No database server required
- Single file backup
- Sufficient for MVP and moderate scale
- Easy to sync/replicate

### Background Job Scheduler
- Simple, code-first scheduling
- No external workflow engine dependency
- Easier to deploy and maintain

### Why Express + React?
- Simple server API
- Familiar stack
- Easy deployment
- Can be replaced with Next.js later

## File Structure

```
stockpicker/
├── docker-compose.yml
├── .env
├── apiserver/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── strategies.js    # Strategy CRUD
│   │   │   └── predictions.js  # Prediction CRUD
│   │   ├── models/
│   │   │   └── database.js     # SQLite operations
│   │   └── app.js
│   └── Dockerfile
├── webapp/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.js
│   └── Dockerfile
├── db/
│   ├── schema.sql
│   └── stockpicker.db (gitignored)
└── docs/
    ├── ARCHITECTURE.md
    └── IMPLEMENTATION_ROADMAP.md
```
