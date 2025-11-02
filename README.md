# Stock Picker - Always-On Stock Strategy Engine

An intelligent, always-on stock trading system built with n8n workflows that continuously analyzes markets and makes periodic trades based on your strategy. Combines technical analysis, sentiment scoring, and analyst ratings.

## Quick Start with Docker Compose

```bash
# Clone repository
git clone <repo-url>
cd stockpicker

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Install dependencies (pnpm workspace) and generate proto code
make install
make generate

# Start all services
make up

# Initialize database
make init-db

# Access services
# - Webapp: http://localhost:3000
# - API Server: http://localhost:3001
# - n8n: http://localhost:5678
```

### First Time Setup

1. **Set Environment Variables:**
   When running apiserver locally (not in Docker), you need to set:
   ```bash
   # Get your n8n API key (required for API access)
   export N8N_API_KEY=your_api_key_here
   
   # Or create a .env file in the repo root:
   # N8N_API_KEY=your_api_key_here
   ```
   
   The apiserver will automatically use `http://localhost:5678` when running locally.
   
   **To get your n8n API key** (see [n8n API docs](https://docs.n8n.io/api/authentication/)):
   1. Open http://localhost:5678
   2. Login with Basic Auth (admin / your password from docker-compose)
   3. Go to **Settings** → **n8n API**
   4. Click **Create an API key**
   5. Choose a Label and copy the API key
   6. Set it as `N8N_API_KEY` environment variable

2. **Get API Keys:**
   - Alpha Vantage: https://www.alphavantage.co/support/#api-key
   - Reddit: https://www.reddit.com/prefs/apps (OAuth app)
   - OpenAI: https://platform.openai.com/api-keys
   - Add keys to `.env` file or environment variables

3. **Configure n8n:**
   - Access http://localhost:5678
   - Import workflows from `n8n/workflows/` (auto-imported on startup)
   - Configure credentials (Alpha Vantage API, OpenAI API Key via env)

4. **Initialize Database:**
   ```bash
   make init-db
   ```

5. **Start Strategy:**
   - Open UI at http://localhost:3000
   - Create your first strategy with budget, frequency, and risk level
   - Click "Start Strategy"

## What It Does

### Always-On Strategy Engine
The system runs **indefinitely** until you stop it. Unlike traditional trading bots that run for a fixed duration, this system:
- Runs continuously with monthly budget resets
- Picks new stocks each trade (not the same stocks repeatedly)
- Allows multiple strategies to run simultaneously
- Gives you full control: Start, Pause, Stop anytime

### Key Concepts

**Time Horizon = Analysis Parameter (NOT Duration)**
- Time horizon controls **how** the system analyzes stocks, not how long it runs
- Example: "3 months" means analyze for 3-month trends, but system continues indefinitely
- Short-term (1 week): Uses momentum indicators
- Long-term (1 year): Uses fundamental analysis
- You can change the time horizon anytime

**Monthly Budget System**
- Set a monthly budget (e.g., $1,000/month)
- Budget resets on the 1st of each month (no rollover)
- System calculates per-trade allocation automatically
- Example: $1,000/month, twice weekly (8 trades/month) = $125 per trade, $41.67 per stock

**Named Strategies with Custom Prompts**
- Give each strategy a name: "Tech Growth Q4 2024"
- Add custom instructions: "Focus on AI stocks, avoid recent IPOs"
- Custom prompts guide stock selection and ranking
- Run multiple strategies simultaneously with different approaches

### How It Works

1. **Create Strategy:** Set name, budget, frequency, risk level, custom prompt
2. **System Runs Automatically:** Executes trades per your frequency (e.g., Mon/Thu at 10am)
3. **Analysis Per Trade:**
   - Screens top 100 stocks by volume and Reddit mentions
   - Applies your custom prompt filters
   - Fetches technical data (RSI, MACD, moving averages)
   - Analyzes Reddit sentiment
   - Scores and ranks stocks
   - Selects top 3 picks
4. **Creates Predictions:** Each pick gets a prediction record with entry price, target, stop loss
5. **Tracks Performance:** Daily price updates evaluate predictions against targets

## Technology Stack

- **Connect RPC:** Type-safe gRPC-web API with Protocol Buffers
- **TanStack Start:** React meta-framework with SSR
- **n8n:** Workflow automation and orchestration
- **SQLite:** File-based database (no server required)
- **TypeScript:** Type-safe development across stack
- **pnpm Workspaces:** Monorepo management with shared dependencies
- **Biome:** Fast linting and formatting
- **Docker Compose:** Container orchestration

### Data Sources
- **Alpha Vantage:** Technical data and indicators (25 calls/day free tier)
- **Reddit API:** Sentiment analysis from r/wallstreetbets, r/stocks
- **Seeking Alpha RSS:** Analyst ratings and news

## Project Structure

```
stockpicker/
├── Makefile                # Common development commands
├── docker-compose.yml      # Main orchestration
├── .env.example            # Environment template
├── proto/                  # Protocol Buffer definitions
│   ├── stockpicker/v1/
│   │   └── strategy.proto  # API contract (Strategy + Prediction services)
│   ├── buf.yaml            # Buf CLI config
│   └── buf.gen.yaml        # Code generation config
├── apiserver/              # Connect RPC API server
│   ├── src/
│   │   ├── gen/            # Generated proto code (gitignored)
│   │   ├── services/       # RPC service implementations
│   │   ├── db.ts           # Database connection & queries
│   │   └── index.ts        # Server entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
├── webapp/                 # TanStack Start frontend
│   ├── app/
│   │   ├── routes/         # File-based routing
│   │   ├── router.tsx      # Router config
│   │   ├── client.tsx      # Client entry
│   │   └── ssr.tsx         # Server entry
│   ├── src/gen/            # Generated proto code (gitignored)
│   ├── package.json
│   ├── tsconfig.json
│   ├── app.config.ts       # TanStack Start config
│   └── Dockerfile
├── n8n/
│   ├── workflows/          # n8n workflow JSON
│   └── credentials/        # n8n credentials (gitignored)
├── db/                     # Database files
│   ├── schema.sql          # Database schema
│   └── stockpicker.db      # SQLite database (gitignored)
└── docs/
    ├── ARCHITECTURE.md      # Technical design
    └── IMPLEMENTATION_ROADMAP.md  # Build instructions
```

## Key Features

- ✅ **Named Strategies:** Create multiple strategies with custom names
- ✅ **Custom Analysis Prompts:** Guide stock selection with your own instructions
- ✅ **Multiple Simultaneous Strategies:** Run different strategies at once
- ✅ **Monthly Budget Tracking:** Automatic monthly resets
- ✅ **Flexible Frequency:** Daily, twice weekly, weekly, monthly
- ✅ **Performance Tracking:** Daily evaluation of predictions
- ✅ **Stop Loss Management:** Automatic calculation based on risk level

## Documentation

- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System design, database schema, workflows
- **[docs/IMPLEMENTATION_ROADMAP.md](./docs/IMPLEMENTATION_ROADMAP.md)** - Step-by-step build guide

## Development

```bash
# See all available commands
make help

# Start development environment with Docker
make dev

# Or run locally without Docker
make dev-local

# Or start Docker services in background
make up

# View logs
make logs           # All services
make logs-api       # API server only
make logs-web       # Webapp only
make logs-n8n       # n8n only

# Generate TypeScript from protos
make generate

# Code quality
make lint           # Check for linting errors (Biome)
make typecheck      # Check for TypeScript errors (tsc)
make format         # Format code only
make fix            # Auto-fix safe issues (lint + format)
make fix-unsafe     # Auto-fix all issues (including unsafe)

# Stop services
make down

# Reset database (WARNING: deletes all data)
make reset-db
make init-db
```

## Disclaimers

⚠️ **This system is for educational and research purposes only.**
- Not financial advice
- Past performance does not guarantee future results
- Trading stocks involves risk of loss
- Use at your own risk
