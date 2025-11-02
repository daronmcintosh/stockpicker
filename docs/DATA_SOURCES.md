# Data Source Integration Guide

This document describes how to integrate external data sources into the n8n workflows for stock analysis.

## Available Data Sources

### 1. Alpha Vantage (Technical Data)

**Endpoint:** `https://www.alphavantage.co/query`

**Authentication:** API key required (set via `ALPHA_VANTAGE_API_KEY` environment variable)

**Rate Limits:**
- Free tier: 25 API calls per day, 5 calls per minute
- Paid tiers: Higher limits available

**Available Functions:**
- `GLOBAL_QUOTE` - Get real-time stock quote
- `TOP_GAINERS_LOSERS` - Get top gainers and losers
- `TIME_SERIES_DAILY` - Daily price data
- `RSI` - Relative Strength Index
- `MACD` - Moving Average Convergence Divergence
- `SMA` / `EMA` - Simple/Exponential Moving Averages

**Usage in n8n:**
```json
{
  "url": "https://www.alphavantage.co/query",
  "method": "GET",
  "queryParameters": {
    "function": "GLOBAL_QUOTE",
    "symbol": "AAPL",
    "apikey": "={{ $env.ALPHA_VANTAGE_API_KEY }}"
  }
}
```

**Caching Strategy:**
- Cache API responses aggressively (at least 1 minute for real-time data)
- Use batch requests when possible
- Consider using pre-calculated indicators to reduce API calls

### 2. Reddit API (Sentiment Analysis)

**Endpoint:** `https://oauth.reddit.com/api/`

**Authentication:** OAuth 2.0 required
- Client ID: Set via `REDDIT_CLIENT_ID`
- Client Secret: Set via `REDDIT_CLIENT_SECRET`
- User Agent: Set via `REDDIT_USER_AGENT`

**Rate Limits:**
- 60 requests per minute (free)

**Target Subreddits:**
- `/r/wallstreetbets` - High-volume trading discussions
- `/r/stocks` - General stock market discussions
- `/r/investing` - Investment-focused discussions

**Workflow:**
1. Authenticate via OAuth 2.0
2. Fetch top posts from last 24 hours
3. Extract stock tickers using pattern matching (`$SYMBOL` or `SYMBOL`)
4. Count mentions per symbol
5. Apply VADER sentiment analysis to comments
6. Calculate sentiment score (-1 to +1, then scale to 1-10)

**Usage in n8n:**
Use the Reddit OAuth 2.0 node or HTTP Request with OAuth 2.0 authentication.

**Implementation Notes:**
- Use regex pattern: `/\$?([A-Z]{1,5})\b/g` to extract tickers
- VADER sentiment analysis available via n8n Code node or external service
- Aggregate sentiment across all mentions per stock

### 3. Seeking Alpha (Analyst Ratings)

**Endpoint:** RSS Feeds (no API key needed)

**Available Feeds:**
- Analyst ratings RSS feeds
- Article headlines
- Price targets

**Workflow:**
1. Parse RSS feed XML
2. Extract analyst ratings (Buy/Hold/Sell)
3. Match ratings to stock symbols
4. Calculate rating score (Buy=3, Hold=2, Sell=1)
5. Aggregate per stock

**Usage in n8n:**
Use RSS Feed node or HTTP Request to fetch RSS, then parse XML.

**Example RSS URLs:**
- General market feed
- Symbol-specific feeds (if available)

### 4. Additional Data Sources (Future)

**Yahoo Finance (Alternative):**
- Free alternative to Alpha Vantage
- Web scraping required (no official API)
- Consider using `yfinance` Python library via n8n Code node

**News APIs:**
- NewsAPI.org - Financial news aggregation
- Alpha Vantage News & Sentiment API - News sentiment analysis

**Social Media:**
- Twitter/X API - Real-time mentions and sentiment
- StockTwits API - Trading-focused social network

## Integration Steps

### Step 1: Add Environment Variables

Update `.env` or `docker-compose.yml`:

```env
ALPHA_VANTAGE_API_KEY=your_key_here
REDDIT_CLIENT_ID=your_id_here
REDDIT_CLIENT_SECRET=your_secret_here
REDDIT_USER_AGENT=StockPicker/1.0
```

### Step 2: Update Analysis Agent Subflow

1. Add HTTP Request nodes for each data source
2. Parse responses appropriately
3. Aggregate data into a unified format
4. Apply filters based on risk level and custom prompts
5. Calculate composite scores

### Step 3: Implement Caching

Use n8n's built-in caching or external cache (Redis):
- Cache Alpha Vantage responses for at least 1 minute
- Cache Reddit sentiment for 15 minutes
- Cache RSS feeds for 30 minutes

### Step 4: Error Handling

- Handle API rate limits gracefully
- Implement retry logic with exponential backoff
- Fallback to cached data if APIs are unavailable
- Log errors for monitoring

## Composite Score Calculation

```
Composite Score = 
  (Technical Score × 0.4) +
  (Sentiment Score × 0.3) +
  (Analyst Score × 0.2) +
  (Momentum Score × 0.1)
```

**Adjustments:**
- Risk level filters (apply volatility threshold)
- Time horizon (select relevant indicators)
- Custom prompt preferences (boost/discount certain sectors)

## Rate Limit Management

1. **Queue System:** Use n8n's queue or external queue (Bull/BullMQ)
2. **Request Throttling:** Limit concurrent requests
3. **Batching:** Group requests where possible
4. **Priority:** Prioritize real-time data for active predictions

## Testing Data Sources

Create test workflows to verify:
- Authentication works
- Data format matches expectations
- Rate limits are respected
- Error handling works correctly
- Caching prevents unnecessary calls

## Monitoring

Track:
- API call counts per day
- Rate limit errors
- Response times
- Cache hit rates
- Data quality metrics

