# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Setup
make install          # Install deps (pnpm workspace)
make generate         # Generate TypeScript from .proto files (Buf)

# Development
make dev              # Start all services (Docker Compose)
make dev-local        # Start local dev without Docker
make up               # Start background services
make down             # Stop services
make logs             # Follow all logs
make logs-api         # API server logs only
make logs-web         # Webapp logs only
make logs-n8n         # n8n logs only

# Database
make init-db          # Initialize SQLite DB
make reset-db         # Drop all data (requires confirmation)

# Code Quality
make lint             # Biome linting check
make typecheck        # TypeScript compilation check
make format           # Format code only
make fix              # Auto-fix safe issues
make fix-unsafe       # Auto-fix all issues (safe + unsafe)

# Individual packages
cd apiserver && pnpm dev        # Run API server with tsx watch
cd webapp && pnpm dev           # Run webapp with vite
cd apiserver && pnpm generate   # Generate protos for API only
cd webapp && pnpm generate      # Generate protos for webapp only
```

## Architecture

**Type-Safe gRPC-Web Stack:**
- Proto definitions in `proto/stockpicker/v1/strategy.proto` define entire API contract
- `make generate` uses Buf to generate TypeScript clients/servers for both apiserver and webapp
- Generated code: `apiserver/src/gen/` and `webapp/src/gen/` (gitignored)
- API server uses Connect RPC (Node.js adapter) to implement services
- Webapp uses Connect RPC (web adapter) to call services

**Three-Service Architecture:**
1. **n8n** (`:5678`) - Workflow orchestration engine
   - Per-strategy workflows created/managed dynamically via n8n API
   - Global workflows: daily performance tracking, monthly summaries
   - Workflows call back to apiserver via gRPC-web endpoints

2. **apiserver** (`:3001`) - Connect RPC API server
   - Implements `StrategyService` and `PredictionService` from protos
   - SQLite database operations via `db.ts`
   - n8n API client in `services/n8nClient.ts` creates/updates/activates workflows
   - When strategy starts: creates n8n workflow, then activates it

3. **webapp** (`:3000`) - TanStack Start SSR React app
   - File-based routing in `app/routes/`
   - Connect RPC client auto-generated from protos
   - Calls apiserver via gRPC-web

**Critical Flow - Dynamic Workflow Creation:**
- User creates strategy via webapp ’ apiserver creates DB record ’ apiserver calls `n8nClient.createStrategyWorkflow()` ’ n8n API creates workflow with hardcoded strategyId in nodes
- User starts strategy ’ apiserver updates status ’ calls `n8nClient.activateWorkflow()` ’ n8n starts cron schedule
- Each strategy gets its own n8n workflow (1:1 mapping) stored in `strategies.n8n_workflow_id`

**Database (SQLite):**
- Schema: `apiserver/src/migrations/001_initial_schema.sql`
- Two tables: `strategies` (main config), `predictions` (stock picks with targets/stop-loss)
- Calculated fields (NOT stored): `current_month_spent`, `trades_per_month`, `per_trade_budget`, `per_stock_allocation`, `unique_stocks_count`
- Location: `./db/stockpicker.db` (shared volume in Docker)

**Proto Pattern:**
- All RPC methods follow pattern: `{Verb}{Resource}Request/Response`
- Enums use `{RESOURCE}_{FIELD}_UNSPECIFIED` for zero value
- Services separated: `StrategyService` (CRUD + Start/Pause/Stop), `PredictionService` (predictions CRUD)
- Update messages use `optional` fields for partial updates

## Key Implementation Details

**n8n Workflow Structure** (`apiserver/src/services/n8nClient.ts:147-602`):
- Dual triggers: Schedule (cron) + Manual
- Workflow nodes hardcode strategyId in HTTP request bodies
- Uses OpenAI API directly (not LangChain) for stock analysis
- Checks: strategy active ’ budget available ’ fetch stocks ’ AI analysis ’ create predictions
- Top 100 stocks analyzed, top 10 recommended by AI, top 3 converted to predictions

**Config Management** (`apiserver/src/config.ts`):
- Reads from env vars: `N8N_API_KEY`, `N8N_API_URL`, `DB_PATH`
- Local dev defaults: n8n at `http://localhost:5678`, API at `http://localhost:3001`
- Docker defaults: internal URLs (`http://n8n:5678`, `http://apiserver:3000`)

**Environment Setup:**
- `.env.example` ’ `.env` with keys: `N8N_API_KEY`, `N8N_PASSWORD`, `ALPHA_VANTAGE_API_KEY`, `OPENAI_API_KEY`
- Get n8n API key: http://localhost:5678 ’ Settings ’ n8n API ’ Create API key
- apiserver expects `N8N_API_KEY` env var or throws on startup

## Troubleshooting

**Proto changes:**
1. Edit `proto/stockpicker/v1/strategy.proto`
2. Run `make generate` (regenerates for both apiserver and webapp)
3. Update service implementations in `apiserver/src/services/`
4. Restart dev servers

**n8n workflow issues:**
- Check n8n logs: `make logs-n8n`
- Workflows created inactive by default, activated explicitly via API
- Workflow activation uses dedicated endpoints: `POST /workflows/{id}/activate` and `/deactivate`
- n8n API auth: `X-N8N-API-KEY` header (see `n8nClient.ts:16`)

**Database changes:**
- Create migration in `apiserver/src/migrations/`
- No migration runner yet - manually run SQL or reset DB
- Reset: `make reset-db && make init-db`

**Monorepo deps:**
- Root `package.json` has shared Biome config
- Individual packages have own deps in `apiserver/package.json` and `webapp/package.json`
- pnpm workspace: `pnpm -r {command}` runs in all packages
