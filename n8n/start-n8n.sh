#!/bin/sh
set -e

# Start n8n in the background so we can sync workflows after it's ready
# Note: Workflows are now synced via the API to prevent duplicates
# See: apiserver/src/scripts/sync-workflows.ts
echo "Starting n8n..."
exec n8n start

