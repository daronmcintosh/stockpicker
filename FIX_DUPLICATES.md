# Fix Duplicate Workflows

You have duplicate workflows. Here's how to fix them:

## Step 1: Clean Up Existing Duplicates

Run the cleanup script to remove all duplicates (keeps the most recent/active one):

```bash
docker-compose exec apiserver npx tsx /app/src/scripts/cleanup-duplicates.ts
```

This will:
- Find all workflows with duplicate names
- Keep the most recently updated one (preferring active ones)
- Delete all other duplicates

## Step 2: Sync Workflows from JSON Files

After cleanup, sync to ensure workflows match your JSON files:

```bash
docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
```

## Step 3: Verify No More Duplicates

Check the n8n UI:
1. Open http://localhost:5678
2. Go to Workflows
3. You should see only ONE copy of each workflow:
   - "Performance Summary (Monthly)" - 1 copy
   - "Performance Tracking (Daily)" - 1 copy

## Step 4: Check Why Sync Isn't Running Automatically

If duplicates keep appearing, check if the automatic sync is running:

```bash
# Check API server logs for sync messages
docker-compose logs apiserver | grep -i "sync\|workflow"

# Look for:
# - "🔄 Syncing n8n workflows from JSON files..."
# - "✅ Workflow sync completed"
```

If you DON'T see these messages, the sync might be:
1. **Failing silently** - Check for errors:
   ```bash
   docker-compose logs apiserver | grep -i "error\|failed"
   ```

2. **Not finding workflow files** - Check if files exist:
   ```bash
   docker-compose exec apiserver ls -la /app/workflows
   ```

3. **N8N_API_KEY not set** - Check environment:
   ```bash
   docker-compose exec apiserver printenv | grep N8N_API_KEY
   ```

## What Changed

The sync script now:
- ✅ Finds **ALL** workflows with the same name (not just the first one)
- ✅ Deletes **ALL** duplicates before creating a new one
- ✅ Preserves active status (if any duplicate was active, the new one will be active)

## Quick One-Liner to Fix Everything

```bash
docker-compose exec apiserver sh -c "npx tsx /app/src/scripts/cleanup-duplicates.ts && npx tsx /app/src/scripts/sync-workflows.ts /app/workflows"
```

