import { createServer } from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { appConfig } from "./config.js";
import { PredictionService, StrategyService } from "./gen/stockpicker/v1/strategy_connect.js";
import { predictionServiceImpl } from "./services/predictionService.js";
import { strategyServiceImpl } from "./services/strategyService.js";

const PORT = appConfig.server.port;
const HOST = appConfig.server.host;

// Create the Connect routes
const routes = (router: ConnectRouter) => {
  router.service(StrategyService, strategyServiceImpl);
  router.service(PredictionService, predictionServiceImpl);
};

// Create HTTP server with Connect adapter and CORS
const server = createServer((req, res) => {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Log incoming requests
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  // Pass to Connect adapter
  try {
    const adapter = connectNodeAdapter({ routes });
    adapter(req, res);
  } catch (error) {
    console.error("❌ Error handling request:", error);
    res.writeHead(500);
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(Number(PORT), HOST, async () => {
  console.log(`🚀 API Server running on http://${HOST}:${PORT}`);
  console.log(`📡 Connect RPC endpoint ready`);
  
  // Sync n8n workflows after server starts (non-blocking)
  // This ensures workflows from JSON files are synced without creating duplicates
  syncWorkflowsOnStartup().catch((error) => {
    console.error("❌ Failed to sync workflows on startup:", error);
    // Don't exit - server should continue running even if workflow sync fails
  });
});

/**
 * Sync workflows from JSON files on startup
 * This runs in the background and won't block server startup
 */
async function syncWorkflowsOnStartup(): Promise<void> {
  // Only sync if N8N_API_KEY is configured (means n8n integration is enabled)
  if (!appConfig.n8n.apiKey) {
    console.log("ℹ️  N8N_API_KEY not configured, skipping workflow sync");
    return;
  }

  // Wait a bit for n8n to be fully ready
  await new Promise((resolve) => setTimeout(resolve, 5000));

  try {
    console.log("🔄 Syncing n8n workflows from JSON files...");
    const { syncWorkflows } = await import("./scripts/sync-workflows.js");
    // Sync workflows from the n8n workflows directory (mounted at /tmp/workflows in n8n container)
    // In Docker, we need to use the path where workflows are copied in the n8n container
    // For the API server, we'll look for workflows relative to the repo root
    // Use environment variable or default to /app/workflows (mounted in Docker)
    // In local development, this should point to n8n/workflows directory
    const workflowsDir = process.env.N8N_WORKFLOWS_DIR || "./n8n/workflows";
    await syncWorkflows(workflowsDir);
    console.log("✅ Workflow sync completed");
  } catch (error) {
    console.error("❌ Could not sync workflows:", 
      error instanceof Error ? error.message : String(error));
    console.error("   Stack:", error instanceof Error ? error.stack : "N/A");
    // Don't fail the server if workflow sync fails, but log it clearly
    console.error("   ⚠️  Workflow sync failed - duplicates may appear. Run sync manually.");
  }
}

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
