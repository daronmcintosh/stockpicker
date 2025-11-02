#!/bin/sh
set -e

# Import workflows on startup (if they exist)
if [ -d "/tmp/workflows" ] && [ "$(ls -A /tmp/workflows/*.json 2>/dev/null)" ]; then
  echo "Importing workflows from /tmp/workflows..."
  n8n import:workflow --separate --input=/tmp/workflows || echo "Workflow import failed or workflows already exist"
else
  echo "No workflows found in /tmp/workflows to import"
fi

# Start n8n
exec n8n start

