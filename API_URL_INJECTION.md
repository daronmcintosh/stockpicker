# API URL Injection Solution

Since n8n environment variables aren't reliable, we now **inject the API URL directly** into workflows when they're created or synced.

## How It Works

Instead of relying on `$env.API_URL` which n8n may not pick up, the system now:

1. **Reads API URL from config**: Uses `appConfig.n8n.apiServerUrl` (from `N8N_API_SERVER_URL` env var or default)
2. **Injects URL directly**: Replaces all `={{ $env.API_URL }}` expressions with the actual URL
3. **Hardcodes in workflow**: The URL is now part of the workflow JSON, so it always works

## Configuration

The API URL comes from `docker-compose.yml`:
```yaml
apiserver:
  environment:
    - N8N_API_SERVER_URL=http://apiserver:3000
```

Or from `.env` file:
```
N8N_API_SERVER_URL=http://apiserver:3000
```

Default value (if not set): `http://apiserver:3000`

## What Gets Replaced

All workflow JSON files still use `={{ $env.API_URL }}` in the source, but when workflows are created/updated, the system automatically replaces:

- `={{ $env.API_URL }}` → `http://apiserver:3000`
- `{{ $env.API_URL }}` → `http://apiserver:3000`

## When It Happens

The injection occurs in two places:

1. **Strategy workflows** (created dynamically): When `createStrategyWorkflow()` is called
2. **Template workflows** (from JSON files): When `sync-workflows.ts` runs and calls `createWorkflow()`

## Benefits

✅ **No dependency on n8n env vars** - Works regardless of n8n configuration  
✅ **Configurable** - Still controlled via `N8N_API_SERVER_URL` environment variable  
✅ **Reliable** - URL is hardcoded in workflow, so it always works  
✅ **No manual setup** - No need to configure anything in n8n UI  

## Changing the API URL

To change the API URL:

1. Update `docker-compose.yml` or `.env`:
   ```yaml
   environment:
     - N8N_API_SERVER_URL=http://your-new-url:port
   ```

2. Recreate/sync workflows:
   ```bash
   # For template workflows
   docker-compose exec apiserver npx tsx /app/src/scripts/sync-workflows.ts /app/workflows
   
   # For strategy workflows - recreate the strategy or update it
   ```

## Verification

After syncing workflows, verify the URL is injected:

1. Open n8n: http://localhost:5678
2. Open any workflow
3. Check HTTP Request node URL field
4. Should show: `http://apiserver:3000/...` (not `={{ $env.API_URL }}/...`)

## Technical Details

The `injectApiUrl()` function:
- Deep clones the workflow to avoid mutations
- Recursively searches all string values
- Replaces n8n expression syntax with actual URL
- Preserves all other workflow structure

This happens automatically when workflows are created or synced - no manual intervention needed!

