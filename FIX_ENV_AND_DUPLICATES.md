# Fix Environment Variable and Duplicate Issues

## Issue 1: Environment Variable `$env.API_URL` is `[undefined]`

### Root Cause
n8n blocks access to environment variables by default via `N8N_BLOCK_ENV_ACCESS_IN_NODE`. We need to explicitly allow it.

### Fix Applied
Added to `docker-compose.yml`:
```yaml
- N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

### Steps to Apply:

1. **Restart n8n to pick up the new environment variable:**
   ```bash
   docker-compose restart n8n
   ```

2. **Verify the environment variable is accessible:**
   - Open n8n: http://localhost:5678
   - Open any workflow with an HTTP Request node
   - Check that `={{ $env.API_URL }}` now resolves correctly
   - It should show: `http://apiserver:3000` (not `[undefined]`)

3. **Test in a workflow:**
   - Create a simple test workflow
   - Add a Code node with: `return $env.API_URL;`
   - Execute - should return `http://apiserver:3000`

## Issue 2: Duplicate Workflows

### Steps to Fix:

1. **First, clean up existing duplicates:**
   ```bash
   docker-compose exec apiserver npx tsx /app/src/scripts/cleanup-duplicates.ts
   ```

2. **Then sync workflows from JSON files:**
   ```bash
   docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
   ```

3. **Check if sync is running automatically on startup:**
   ```bash
   # Check API server logs for sync messages
   docker-compose logs apiserver | grep -i "sync\|workflow" | tail -30
   ```

   Look for:
   - `🚀 Starting workflow sync...`
   - `🔄 Found X workflow(s) named "..."`
   - `✅ Workflow sync completed`

4. **If sync is NOT running automatically:**
   
   Check for errors:
   ```bash
   docker-compose logs apiserver | grep -i "error\|failed" | tail -20
   ```
   
   Common issues:
   - `N8N_API_KEY not configured` - Make sure `.env` has `N8N_API_KEY`
   - `Workflows directory not found` - Check volume mount
   - `n8n API not ready` - n8n might need more time to start

5. **Verify in n8n UI:**
   - Open http://localhost:5678
   - Go to Workflows
   - You should see exactly:
     - 1x "Performance Summary (Monthly)"
     - 1x "Performance Tracking (Daily)"
     - Plus your strategy workflows

## Complete Fix Workflow

Run these commands in order:

```bash
# 1. Add the environment variable fix (already done in docker-compose.yml)
# 2. Restart n8n to pick up N8N_BLOCK_ENV_ACCESS_IN_NODE=false
docker-compose restart n8n

# 3. Wait for n8n to be ready (about 10 seconds)
sleep 10

# 4. Clean up duplicates
docker-compose exec apiserver npx tsx /app/src/scripts/cleanup-duplicates.ts

# 5. Sync workflows
docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows

# 6. Verify environment variable works
# Open n8n UI and check a workflow - $env.API_URL should resolve
```

## Verify Everything Works

1. **Test environment variable:**
   - In n8n, open any workflow
   - Look at HTTP Request node URL
   - Should show: `http://apiserver:3000/...` (not `[undefined]/...`)

2. **Test no duplicates:**
   - Count workflows in n8n UI
   - Restart containers: `docker-compose restart`
   - Wait 30 seconds
   - Count again - should be the same (no new duplicates)

3. **Check sync logs:**
   ```bash
   docker-compose logs apiserver | grep -E "sync|workflow|🔄|✅" | tail -20
   ```

## Troubleshooting

### Environment variable still undefined

1. **Check n8n has the variable:**
   ```bash
   docker-compose exec n8n printenv | grep API_URL
   ```
   Should show: `API_URL=http://apiserver:3000`

2. **Check N8N_BLOCK_ENV_ACCESS_IN_NODE:**
   ```bash
   docker-compose exec n8n printenv | grep BLOCK_ENV
   ```
   Should show: `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`

3. **Restart n8n completely:**
   ```bash
   docker-compose stop n8n
   docker-compose up -d n8n
   ```

### Duplicates still appearing

1. **Check sync is running:**
   ```bash
   docker-compose logs apiserver | grep "Starting workflow sync"
   ```
   If missing, check for errors preventing sync

2. **Run sync manually and watch output:**
   ```bash
   docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
   ```
   Look for errors or warnings

3. **Check workflow files exist:**
   ```bash
   docker-compose exec apiserver ls -la /app/workflows
   ```
   Should show JSON files

