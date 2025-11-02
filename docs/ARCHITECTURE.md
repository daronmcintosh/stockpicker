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
│  ┌──────────▼──────────────────────────┐  │
│  │ n8n API Client                      │  │
│  │ - Create/activate/deactivate        │  │
│  │   workflows dynamically             │  │
│  └──────────┬──────────────────────────┘  │
│             │                              │
│  ┌──────────▼──────────────────────────┐  │
│  │ Data Management                     │  │
│  │ - Store/read from SQLite            │  │
│  │ - Handle predictions, budget        │  │
│  └──────────┬──────────────────────────┘  │
└─────────────┼──────────────────────────────┘
              │
              │ n8n API (workflow creation)
              ▼
┌──────────────────────────────────────────┐
│         n8n Workflows                     │
│                                          │
│  Per-Strategy Workflow:                  │
│  ┌────────────────────────────────────┐  │
│  │ 1. Cron Trigger                    │  │
│  │    → 2. HTTP GET /api/strategies/:id │
│  │    → 3. Analysis Agent Subflow      │
│  │    → 4. HTTP POST /api/predictions  │
│  │    → 5. HTTP PATCH /api/strategies  │
│  └────────────────────────────────────┘  │
│                                          │
│  Global Workflows:                       │
│  - Performance Tracking (daily)         │
│  - Performance Summary (Monthly) (monthly) │
└─────────────┬────────────────────────────┘
              │
              │ HTTP API (read/write)
              ▼
┌──────────────────────────────────────────┐
│      Express API Server                   │
│  (receives data from workflows)           │
└─────────────┬────────────────────────────┘
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
  n8n:
    - Workflow orchestration
    - Exposed on :5678

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
--   - trades_per_month: COUNT(*) from predictions WHERE action='entered' AND in current month
--   - per_trade_budget: monthly_budget / trades_per_month (or use frequency-based estimate if no trades yet)
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
  max_unique_stocks INTEGER DEFAULT 20,
  n8n_workflow_id TEXT  -- ID of the n8n workflow for this strategy
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

**Handled by:** Express API Server (NOT n8n)

**Responsibilities:**
- Create/Read/Update/Delete strategies (REST API)
- Store strategy configuration in SQLite
- Calculate derived values on-demand (budget spent, allocations, etc.)
- Manage strategy status (active/paused/stopped)
- Use n8n API to create/update/delete workflows dynamically

**When Strategy is Created:**
1. Server validates inputs
2. Server saves strategy config to SQLite (only user-provided fields)
3. Server calls n8n API to create new workflow
4. Server configures workflow with:
   - Cron schedule (based on frequency)
   - Strategy ID parameter
   - Analysis config (time horizon, risk, custom prompt)
5. Server activates workflow if status is "active"

**Calculated Fields (Computed On-Demand):**
- `current_month_spent`: `SUM(allocated_amount)` from predictions WHERE `action='entered'` AND in current month
- `trades_per_month`: `COUNT(*)` from predictions WHERE `action='entered'` AND in current month (actual count, not estimated)
- `per_trade_budget`: `monthly_budget / trades_per_month` (if no trades yet, use frequency-based estimate: daily=20, twice_weekly=8, weekly=4, monthly=1)
- `per_stock_allocation`: `per_trade_budget / 3`
- `unique_stocks_count`: `COUNT(DISTINCT symbol)` from predictions WHERE `action='entered'` AND `status='active'`
- `last_trade_executed`: `MAX(created_at)` from predictions WHERE `action='entered'`

**When Strategy is Paused/Stopped:**
- Server deactivates n8n workflow (doesn't delete it)
- Workflow can be reactivated when strategy resumes

## n8n Workflows

### 1. Scheduled Trade Workflow (Dynamic - One Per Strategy)
**Created by:** Server via n8n API (when strategy is created)
**Trigger:** Cron (per strategy frequency) OR Manual
**Parameters:** Strategy ID (passed from server)
**Flow:**
1. Query strategy via API (`GET /api/strategies/:id`)
2. Check strategy status (skip if paused/stopped)
3. Check monthly budget remaining (calculated on-demand from predictions WHERE `action='entered'` in current month)
4. Call Analysis Agent subflow with strategy config
5. Select top 3 picks (first 3 from top 10)
6. Create 3 prediction records (via API: `POST /api/predictions`)
   - Predictions created with `action='pending'` by default
   - User can mark as `'entered'` or `'dismissed'` via UI
7. Budget and unique stocks count automatically updated (calculated from predictions WHERE `action='entered'`)
8. Notify UI via webhook (optional)

### 2. Analysis Agent (Subflow)
**Note:** This is a reusable subflow called by Scheduled Trade Workflows
**Inputs:** Strategy config (time horizon, risk level, custom prompt)
**Flow:**
1. **Data Collection:**
   - Alpha Vantage: Top 100 stocks by volume, technical indicators
   - Reddit: Scrape mentions, calculate sentiment
   - Seeking Alpha: RSS feeds for analyst ratings
2. **Filtering:**
   - Volume threshold
   - Risk level filters (volatility)
   - Apply custom prompt filters
3. **Scoring:**
   - Technical: 40% (RSI, MACD, MA crossovers)
   - Sentiment: 30% (Reddit sentiment)
   - Analyst: 20% (Seeking Alpha ratings)
   - Momentum: 10%
4. **Ranking:**
   - Rank by composite score
   - Apply custom prompt ranking preferences
   - Return top 10 with full details

**Output:** JSON with top 10 ranked stocks

### 3. Performance Tracking Workflow
**Trigger:** Cron (daily at 4:30 PM EST)
**Note:** Single global workflow (not per-strategy)
**Actions:**
1. Get active predictions via API (`GET /api/predictions?status=active`)
2. For each prediction:
   - Fetch current price (Alpha Vantage)
   - Calculate return %
   - Check stop loss/target conditions
   - Update prediction status via API (`PATCH /api/predictions/:id`)
3. Generate performance metrics

### 4. Performance Summary (Monthly) Workflow
**Trigger:** Cron (1st of each month at midnight)
**Note:** Single global workflow (not per-strategy)
**Purpose:** Generate comprehensive monthly performance report

**Actions:**
1. Get all strategies via API (`GET /api/strategies`)
2. For each strategy:
   - Get all predictions from previous month via API (`GET /api/predictions?strategy_id=:id&month=YYYY-MM`)
   - Analyze entered predictions:
     - Count hits (hit_target), misses (hit_stop/expired), pending
     - Calculate average return %, best/worst performers
     - Total budget spent vs allocated
   - Analyze dismissed predictions:
     - Count how many were dismissed
     - Track performance if they had been entered (missed opportunities)
   - Analyze top 10 rankings:
     - Compare entered vs dismissed predictions
     - Identify which top 10 picks were dismissed but performed well
     - Calculate performance of entered vs dismissed predictions
   - Generate summary metrics:
     - Win rate (hits / total entered)
     - Average return %
     - Total gains/losses
     - Best performing stocks
     - Worst performing stocks
     - Dismissed predictions that would have been profitable
   - Store summary or send notification (optional)
3. Aggregate cross-strategy insights

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
Frequency: Twice Weekly (8 trades/month)

Per-Trade Budget: $1,000 ÷ 8 = $125
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
  → Call n8n API to create workflow
    → Create new workflow with cron trigger
    → Configure with strategy parameters
    → Activate workflow if status = "active"
  → Return strategy ID
```

### Trade Execution (Scheduled)
```
Cron Trigger → n8n Workflow (per strategy)
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
Cron (4:30 PM EST) → n8n Workflow
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

### Why n8n?
- Visual workflow builder
- Built-in scheduling (cron)
- API integrations out of the box
- Reusable subflows
- Easy to iterate

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
├── n8n/
│   ├── workflows/
│   │   ├── scheduled-trade.json (template, created dynamically per strategy)
│   │   ├── analysis-agent.json (subflow - reusable)
│   │   ├── daily-performance-tracking.json (global workflow)
│   │   └── monthly-performance-summary.json (global workflow)
│   └── credentials/ (gitignored)
├── apiserver/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── strategies.js    # Strategy CRUD
│   │   │   └── predictions.js  # Prediction CRUD
│   │   ├── services/
│   │   │   └── n8n-client.js   # n8n API client
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
