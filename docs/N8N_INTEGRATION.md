# n8n Integration Guide

This document describes the n8n workflows and how they integrate with the StockPicker API.

## Overview

The system uses n8n for workflow orchestration. Workflows are created dynamically when strategies are created, and managed by the API server through the n8n client.

## Workflow Types

### 1. Strategy Workflows (Dynamic - One Per Strategy)

**Created by:** API server automatically when a strategy is created
**Relationship:** Each strategy has exactly one workflow (1:1 relationship)
**Triggers:** 
- Schedule Trigger (cron based on strategy frequency)
- Manual Trigger (for testing/manual execution)

**Purpose:** Complete end-to-end workflow that fetches stocks, analyzes them, and creates predictions

**Flow:**
1. **Schedule Trigger** - Executes on cron schedule based on strategy frequency
   OR
   **Manual Trigger** - Allows manual execution for testing
2. **Get Strategy** - Fetch full strategy configuration from API
3. **Check Strategy Active** - Verify strategy status is ACTIVE (skip if not)
4. **Get Active Predictions** - Check current month's active predictions for budget calculation
5. **Check Budget** - Verify remaining budget (skip if budget exceeded)
6. **Get Top Stocks (Alpha Vantage)** - Fetch top gainers from Alpha Vantage API
7. **Extract Top Stocks** - Parse and extract stock data from API response
8. **AI Stock Analysis** - Generate top 10 stock recommendations using:
   - Strategy parameters (time horizon, target return, risk level)
   - Custom prompt instructions
   - Stock data from Alpha Vantage
   - Per-stock budget allocation
9. **Sort by Score** - Rank all 10 recommendations by overall_score (descending)
10. **Take Top 3** - Select the best 3 stocks for prediction creation
11. **Prepare Prediction** - Format prediction data for each of the top 3 stocks
12. **Create Prediction** - Create predictions via API (top 3 only, but analysis returns all 10)

**Output:**
- Analysis results: Top 10 stock recommendations (all scores and analysis)
- Predictions created: Top 3 stocks as predictions in the database

**Configuration:**
- Cron schedule automatically set based on strategy frequency
- Strategy ID embedded in workflow (hardcoded for 1:1 relationship)
- Strategy parameters (time horizon, risk level, custom prompt) fetched from API each execution
- API URL configured via environment variable
- Workflow updated when strategy name or frequency changes

**Key Features:**
- Unified workflow combines stock fetching, analysis, and prediction creation
- Supports both scheduled and manual execution
- Each workflow is dedicated to a single strategy
- Workflow automatically uses latest strategy parameters from API

### 3. Performance Tracking Workflow (Global)

**Trigger:** Daily at 4:30 PM EST (trading days only)
**Purpose:** Track performance of active predictions

**Flow:**
1. Schedule Trigger (daily)
2. Get Active Predictions - Fetch all active predictions
3. Filter Entered Predictions - Only track entered predictions
4. Split Into Items - Process each prediction
5. Get Current Price - Fetch from Alpha Vantage
6. Calculate Metrics - Compute returns and check targets
7. Update Prediction - Update prediction status

**Note:** Currently uses a workaround as `UpdatePrediction` RPC doesn't exist yet. Consider adding this RPC to update price/status fields.

### 4. Performance Summary (Monthly) Workflow (Global)

**Trigger:** 1st of each month at midnight
**Purpose:** Generate comprehensive monthly performance reports

**Flow:**
1. Schedule Trigger (monthly)
2. Get All Strategies
3. Split Strategies - Process each strategy
4. Prepare Month Filter - Calculate previous month
5. Get Predictions - Fetch predictions for previous month
6. Calculate Performance - Compute metrics
7. Format Report - Structure report data
8. Aggregate Reports - Combine all strategy reports
9. Generate Summary - Create final summary

## API Integration

### Connect RPC Protocol

All workflows use Connect RPC over HTTP POST. Requests include:
- Header: `Content-Type: application/json`
- Header: `Connect-Protocol-Version: 1`
- Body: JSON-encoded protobuf messages

### Example Request

```json
{
  "url": "http://apiserver:3000/stockpicker.v1.StrategyService/ListStrategies",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1"
  },
  "body": {
    "status": "STRATEGY_STATUS_ACTIVE"
  }
}
```

## Environment Variables

Required environment variables in n8n:

```env
API_URL=http://apiserver:3000
ALPHA_VANTAGE_API_KEY=your_key_here
REDDIT_CLIENT_ID=your_id_here (optional)
REDDIT_CLIENT_SECRET=your_secret_here (optional)
```

## Workflow Management

### Creating Workflows

Workflows are created automatically by the API server when:
- A strategy is created
- The n8n client is called from `strategyService.createStrategy()`

### Activating/Deactivating Workflows

Workflows are activated/deactivated when:
- Strategy is started → Workflow activated
- Strategy is paused → Workflow deactivated
- Strategy is stopped → Workflow deactivated

### Deleting Workflows

Workflows are deleted when:
- Strategy is deleted (and strategy is stopped)

## Error Handling

- Workflow creation failures are logged but don't block strategy creation
- Workflow activation/deactivation failures are logged but don't block status changes
- Individual node failures should be handled within workflows

## Testing Workflows

### Manual Testing

1. Import workflow JSON into n8n
2. Set environment variables
3. Test individual nodes
4. Run full workflow manually
5. Verify API calls succeed

### Automated Testing

- Test workflow creation via API
- Test workflow activation/deactivation
- Mock API responses for testing
- Verify cron schedules are correct

## Monitoring

Track:
- Workflow execution success/failure rates
- API call success/failure rates
- Execution times
- Error messages

## Troubleshooting

### Workflow Not Running

1. Check workflow is active in n8n UI
2. Verify cron expression is correct
3. Check n8n execution logs
4. Verify API server is reachable
5. Check environment variables are set

### API Calls Failing

1. Verify API server is running
2. Check API URL is correct (use Docker service name)
3. Verify Connect RPC headers are included
4. Check request body format matches proto definitions
5. Review API server logs

### Workflow Creation Fails

1. Verify n8n API is accessible from API server
2. Check n8n authentication credentials
3. Verify n8n API version compatibility
4. Check n8n logs for errors

