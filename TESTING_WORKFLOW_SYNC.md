# Testing Workflow Sync in Docker Compose

This guide explains how to test the workflow sync functionality to ensure no duplicate workflows are created.

## Prerequisites

1. Make sure you have `.env` file with `N8N_API_KEY` set
2. Workflow JSON files exist in `n8n/workflows/` directory

## Method 1: Test Automatic Sync on Startup

This tests that workflows are automatically synced when the API server starts.

### Steps:

1. **Start fresh (clean state):**
   ```bash
   # Stop all containers
   docker-compose down
   
   # Remove n8n data (to start with no workflows)
   rm -rf n8n/.n8n/workflows.json
   # OR delete all workflows manually in n8n UI after starting
   ```

2. **Start the services:**
   ```bash
   docker-compose up -d
   ```

3. **Check API server logs for sync messages:**
   ```bash
   docker-compose logs apiserver | grep -i "sync\|workflow"
   ```
   
   You should see:
   - `🔄 Syncing n8n workflows from JSON files...`
   - `✅ Workflow sync completed`

4. **Verify workflows in n8n:**
   - Open http://localhost:5678
   - Login with your credentials
   - Go to Workflows page
   - You should see exactly:
     - `Performance Summary (Monthly)` (1 copy)
     - `Performance Tracking (Daily)` (1 copy)

5. **Test duplicate prevention - restart containers:**
   ```bash
   # Restart services (should NOT create duplicates)
   docker-compose restart apiserver
   
   # Wait a few seconds, then check logs
   docker-compose logs apiserver | grep -i "sync\|workflow"
   ```

6. **Verify no duplicates:**
   - Refresh n8n UI
   - You should still see only 1 copy of each workflow (not 2 or 3)

## Method 2: Manual Sync Script Test

Test the sync script directly by running it inside the container.

### Steps:

1. **Start services:**
   ```bash
   docker-compose up -d
   ```

2. **Run sync script manually inside apiserver container:**
   ```bash
   docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
   ```

3. **Check output:**
   - Should show workflows being synced
   - If workflows exist: `🔄 Updating existing workflow`
   - If workflows don't exist: `➕ Creating new workflow`
   - Should end with: `✅ Workflow sync completed!`

4. **Verify in n8n UI:**
   - Check that workflows match the JSON files
   - No duplicates exist

## Method 3: Test Duplicate Prevention

Explicitly test that duplicates are not created on multiple syncs.

### Steps:

1. **Start services:**
   ```bash
   docker-compose up -d
   ```

2. **First sync (should create workflows):**
   ```bash
   docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
   ```
   
   Expected: Creates 2 new workflows

3. **Second sync (should update, not duplicate):**
   ```bash
   docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
   ```
   
   Expected: Updates existing 2 workflows (no new ones created)

4. **Verify count:**
   ```bash
   # Count workflows in n8n via API (if you have curl)
   curl -X GET "http://localhost:5678/api/v1/workflows" \
     -H "X-N8N-API-KEY: ${N8N_API_KEY}" | jq '.data | length'
   ```
   
   Should return: 2 (or 2 + any strategy workflows you've created)

## Method 4: Test Workflow Updates

Verify that changes to JSON files are reflected when syncing.

### Steps:

1. **Edit a workflow JSON file:**
   ```bash
   # Edit the monthly summary workflow
   code n8n/workflows/monthly-performance-summary.json
   # Change the cron expression or add a note
   ```

2. **Sync workflows:**
   ```bash
   docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
   ```

3. **Verify update in n8n UI:**
   - Open the workflow in n8n
   - Your changes should be reflected

## Checking Logs

### API Server Logs:
```bash
# Follow all logs
docker-compose logs -f apiserver

# Filter for sync-related messages
docker-compose logs apiserver | grep -i "sync\|workflow\|n8n"
```

### n8n Logs:
```bash
docker-compose logs -f n8n
```

## Troubleshooting

### Sync fails with "n8n API not ready"
- Wait longer (n8n takes time to start)
- Check n8n logs: `docker-compose logs n8n`
- Verify `N8N_API_KEY` is set correctly

### Workflows directory not found
- Verify volume mount: `docker-compose exec apiserver ls -la /app/workflows`
- Check that JSON files exist in `n8n/workflows/` directory

### Duplicates still appearing
- Check workflow names match exactly (case-sensitive)
- Verify sync script ran successfully (check logs)
- Manually delete duplicates in n8n UI, then run sync again

### Workflows not activating after sync
- Check if they were active before sync
- The sync script preserves active status
- You may need to manually activate in n8n UI

## Quick Test Command

One-liner to test everything:
```bash
docker-compose up -d && \
sleep 10 && \
docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows && \
echo "✅ Check n8n UI at http://localhost:5678 to verify workflows"
```

