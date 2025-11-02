# Using API_URL Environment Variable in n8n Workflows

## How It Works

All workflows use the n8n expression syntax to reference the `API_URL` environment variable:

```
={{ $env.API_URL }}/stockpicker.v1.StrategyService/GetStrategy
```

This expression is evaluated at runtime, so you configure `API_URL` once in n8n settings and all workflows automatically use it.

## Where It's Used

### In Workflow Code (`apiserver/src/services/n8nClient.ts`)

All HTTP Request nodes in strategy workflows use:

```typescript
url: "={{ $env.API_URL }}/stockpicker.v1.StrategyService/GetStrategy"
```

### In JSON Templates (`n8n/workflows/*.json`)

All workflow templates use the same pattern:

```json
{
  "parameters": {
    "url": "={{ $env.API_URL }}/stockpicker.v1.PredictionService/ListPredictions"
  }
}
```

## Setting API_URL

### Option 1: n8n UI (Recommended)

1. Open n8n: http://localhost:5678
2. Go to **Settings** → **Environment variables** (or **Variables**)
3. Add:
   - **Key**: `API_URL`
   - **Value**: `http://localhost:3001` (local) or `http://apiserver:3000` (Docker)

### Option 2: Docker Compose

Already configured in `docker-compose.yml`:

```yaml
environment:
  - API_URL=http://apiserver:3000
```

## Benefits

1. **Single Configuration**: Set once, used everywhere
2. **Environment Flexibility**: Different values for local vs Docker vs production
3. **No Code Changes**: Change URL without regenerating workflows
4. **Consistency**: All workflows use the same pattern

## Testing

After setting `API_URL`, test a workflow:

1. Open any workflow in n8n
2. Check an HTTP Request node
3. The URL should show `={{ $env.API_URL }}/...`
4. When executed, n8n will substitute the actual value
5. Check execution logs to see the resolved URL

## Troubleshooting

### Workflow fails with connection error

1. Verify `API_URL` is set in n8n settings
2. Check the value matches your setup:
   - Local: `http://localhost:3001`
   - Docker: `http://apiserver:3000`
3. Ensure API server is running and accessible
4. Check network connectivity (firewall, Docker network)

### URL shows literal `$env.API_URL`

This means the expression isn't being evaluated. Check:
1. The URL field uses `={{ }}` syntax (not just `$env.API_URL`)
2. Environment variable name is exactly `API_URL` (case-sensitive)
3. n8n instance has environment variables enabled

