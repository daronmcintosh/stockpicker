# n8n Environment Variables Setup

## Overview

Your n8n workflows use environment variables to connect to services. The main variable you need is `API_URL` to point to your API server.

**All workflows (both code-generated and JSON templates) use `={{ $env.API_URL }}` in their HTTP Request nodes**, which means you only need to set this once in n8n settings.

## Setting Environment Variables in n8n

### Option 1: Via n8n UI (Recommended for Local Development)

1. Open n8n in your browser: http://localhost:5678
2. Login with your credentials
3. Go to **Settings** → **Environment variables** (or **Variables**)
4. Click **Add Variable**
5. Set:
   - **Key**: `API_URL`
   - **Value**: `http://localhost:3001` (when running locally)
   - **Value**: `http://apiserver:3000` (when running in Docker - internal network)
6. Save

### Option 2: Via Docker Compose Environment Variables

The `docker-compose.yml` file now includes `API_URL` for Docker setups:

```yaml
environment:
  - API_URL=http://apiserver:3000
```

When running locally (not in Docker), you should set this in the n8n UI instead.

### Option 3: Via n8n Configuration File

You can also set environment variables in n8n's configuration. If running n8n directly (not Docker):

```bash
export API_URL=http://localhost:3001
```

Or create a `.env` file in your n8n directory.

## Required Environment Variables

### API_URL

The base URL of your API server.

**Local Development** (both services running locally):
```
API_URL=http://localhost:3001
```

**Docker Compose** (services in same Docker network):
```
API_URL=http://apiserver:3000
```

**External/Remote** (if API server is elsewhere):
```
API_URL=https://your-api-domain.com
```

### Other Environment Variables

Your workflows may also use:
- `ALPHA_VANTAGE_API_KEY` - For stock data from Alpha Vantage
- `OPENAI_API_KEY` - For AI stock analysis
- `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` - Optional, for sentiment analysis

## Verifying Your Setup

1. Open a workflow in n8n
2. Click on an HTTP Request node (e.g., "Get All Strategies")
3. Check the URL field - it should show `={{ $env.API_URL }}/stockpicker.v1.StrategyService/...`
4. When you test the workflow, n8n will substitute `$env.API_URL` with your configured value

## Troubleshooting

### Connection Errors

If workflows can't connect to your API server:

1. **Check API_URL value:**
   - Docker: Use `http://apiserver:3000` (service name, not localhost)
   - Local: Use `http://localhost:3001` (or the port your API server runs on)

2. **Verify API server is running:**
   ```bash
   curl http://localhost:3001/health
   # or
   curl http://apiserver:3000/health
   ```

3. **Check network connectivity:**
   - Docker: Services must be in the same network (docker-compose handles this)
   - Local: Ensure firewall allows connections

4. **Test from n8n:**
   - Use the "Manual Trigger" node in your workflow
   - Execute the workflow and check the HTTP Request node output
   - Look for connection errors in the execution logs

### Port Reference

- **Webapp**: `localhost:3000` (external)
- **API Server**: `localhost:3001` (external) or `apiserver:3000` (Docker internal)
- **n8n**: `localhost:5678` (external)

