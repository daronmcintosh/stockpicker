# Checking n8n Environment Variables

## Method 1: Via n8n UI

1. Open http://localhost:5678
2. Login
3. Go to **Settings** → **Environment variables** (or **Variables**)
4. You'll see all environment variables that workflows can access via `$env.VARIABLE_NAME`

## Method 2: Via Docker Container

Check what environment variables are available to n8n:

```bash
# Check all environment variables in n8n container
docker-compose exec n8n env | grep -E "API_URL|ALPHA_VANTAGE|OPENAI"

# Or see all environment variables
docker-compose exec n8n env | sort
```

## Method 3: Test in a Workflow

You can test if an environment variable is accessible:

1. Create a test workflow or edit existing one
2. Add a **Code** node
3. Use this expression to check a variable:
   ```javascript
   return {
     api_url: $env.API_URL,
     has_alpha_vantage: !!$env.ALPHA_VANTAGE_API_KEY,
     // etc.
   };
   ```
4. Execute the node to see the values

## Method 4: Check Workflow Execution Logs

When a workflow runs, you can see resolved expressions:
1. Open a workflow execution
2. Click on any HTTP Request node that uses `={{ $env.API_URL }}`
3. Check the "Parameters" tab to see the resolved URL

## Current Setup (Docker Compose)

Based on your `docker-compose.yml`, these are passed to n8n:

```bash
# Check docker-compose environment variables
docker-compose config | grep -A 20 "n8n:" | grep "environment"
```

Or view the n8n service environment:
```bash
docker-compose exec n8n printenv | grep -E "API_URL|ALPHA_VANTAGE|OPENAI"
```

## Common Environment Variables for Your Workflows

From your setup, workflows may use:
- `API_URL` - Set to `http://apiserver:3000` in docker-compose.yml
- `ALPHA_VANTAGE_API_KEY` - For stock data (set in n8n UI)
- `OPENAI_API_KEY` - For AI analysis (set in n8n UI)

## Setting New Environment Variables

### Option 1: Docker Compose (Persistent)

Add to `docker-compose.yml`:
```yaml
n8n:
  environment:
    - API_URL=http://apiserver:3000
    - NEW_VARIABLE=value
```

Then restart:
```bash
docker-compose up -d
```

### Option 2: n8n UI (Only if running locally)

1. Settings → Environment variables
2. Add Variable
3. Set Key and Value
4. Save

**Note:** Variables set in n8n UI are stored in n8n's database, while Docker environment variables are passed at container startup.

## Verify Environment Variable Access

Test if a variable is accessible in workflows:

1. Open any workflow
2. Add a **Set** node
3. Add a field with expression: `={{ $env.VARIABLE_NAME }}`
4. Execute - if variable is set, you'll see the value; if not, you'll get an error

