import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
import { registerServerReflectionFromFile } from "@lambdalisue/connectrpc-grpcreflect";
import { appConfig } from "./config.js";
import { PredictionService, StrategyService } from "./gen/stockpicker/v1/strategy_pb.js";
import { predictionServiceImpl } from "./services/prediction/index.js";
import {
  createPredictionsFromWorkflow,
  createStrategy,
  deleteStrategy,
  getStrategy,
  getWorkflowRun,
  listStrategies,
  listWorkflowRuns,
  pauseStrategy,
  prepareDataForWorkflow,
  startStrategy,
  stopStrategy,
  triggerPredictions,
  updateStrategy,
  updateStrategyPrivacy,
  updateWorkflowRunStatus,
} from "./services/strategy/index.js";
import { strategyServiceImpl as remainingStrategyService } from "./services/strategyService.js";

// Combine migrated functions with remaining ones from original file
const strategyServiceImpl = {
  // Migrated CRUD operations
  createStrategy,
  listStrategies,
  getStrategy,
  updateStrategy,
  deleteStrategy,

  // Migrated lifecycle operations
  startStrategy,
  pauseStrategy,
  stopStrategy,
  triggerPredictions,

  // Migrated privacy operations
  updateStrategyPrivacy,

  // Workflow handlers (internal - called by workflow executor)
  prepareDataForWorkflow,
  createPredictionsFromWorkflow,

  // Workflow runs
  listWorkflowRuns,
  getWorkflowRun,
  updateWorkflowRunStatus,

  // Remaining RPCs from original file (to be migrated)
  sendOTP: remainingStrategyService.sendOTP,
  verifyOTP: remainingStrategyService.verifyOTP,
  getCurrentUser: remainingStrategyService.getCurrentUser,
  updateUser: remainingStrategyService.updateUser,
  followUser: remainingStrategyService.followUser,
  unfollowUser: remainingStrategyService.unfollowUser,
  listFollowing: remainingStrategyService.listFollowing,
  listFollowers: remainingStrategyService.listFollowers,
  listCloseFriends: remainingStrategyService.listCloseFriends,
  getUserProfile: remainingStrategyService.getUserProfile,
  getUserPerformance: remainingStrategyService.getUserPerformance,
  getLeaderboard: remainingStrategyService.getLeaderboard,
  copyStrategy: remainingStrategyService.copyStrategy,
};

const PORT = appConfig.server.port;
const HOST = appConfig.server.host;

// Create the Connect routes
const routes = (router: ConnectRouter) => {
  console.log("🔧 Setting up Connect routes...");
  // Register Connect RPC services
  router.service(StrategyService, strategyServiceImpl);
  console.log("✅ StrategyService registered");
  router.service(PredictionService, predictionServiceImpl);
  console.log("✅ PredictionService registered");

  // Enable gRPC reflection in dev environment only
  if (appConfig.nodeEnv !== "production") {
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const projectRoot = resolve(__dirname, "../..");
      const fdsetPath = resolve(projectRoot, "proto/stockpicker.fdset");

      if (existsSync(fdsetPath)) {
        // Type assertion needed due to Connect RPC version differences
        registerServerReflectionFromFile(router, fdsetPath);
        console.log("✅ gRPC Reflection enabled (dev mode)");
      } else {
        console.warn(
          "⚠️  gRPC Reflection file not found:",
          fdsetPath,
          "\n   Generate it with: buf build -o proto/stockpicker.fdset"
        );
      }
    } catch (error) {
      console.warn("⚠️  Failed to enable gRPC Reflection:", error);
      // Don't fail server startup if reflection setup fails
    }
  }
};

// Create Connect adapter once (not per request)
const adapter = connectNodeAdapter({ routes });

// Create HTTP server with Connect adapter and CORS
const server = createServer((req, res) => {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Authorization"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Log incoming requests
  console.log(`[API SERVER] ${new Date().toISOString()} ${req.method} ${req.url}`);

  // Pass all requests to Connect adapter (all routes are now ConnectRPC)
  try {
    adapter(req, res);
  } catch (err) {
    console.error(`[API SERVER] ❌ Synchronous adapter error:`, err);
    console.error(`[API SERVER] Error details:`, {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      code: typeof err === "object" && err !== null && "code" in err ? String(err.code) : undefined,
    });
    if (!res.headersSent) {
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: "Internal server error",
          details: err instanceof Error ? err.message : String(err),
        })
      );
    }
  }
});

// Helper function to list all available endpoints
function listAvailableEndpoints(): void {
  const baseUrl = `http://${HOST}:${PORT}`;
  console.log(`📡 Available endpoints:`);

  // StrategyService endpoints
  const strategyMethods = Object.entries(StrategyService.methods).map(([key, method]) => ({
    key,
    name: method.name,
  }));

  console.log(`\n   StrategyService (${strategyMethods.length} endpoints):`);
  for (const method of strategyMethods) {
    console.log(`   - POST ${baseUrl}/stockpicker.v1.StrategyService/${method.name}`);
  }

  // PredictionService endpoints
  const predictionMethods = Object.entries(PredictionService.methods).map(([key, method]) => ({
    key,
    name: method.name,
  }));

  console.log(`\n   PredictionService (${predictionMethods.length} endpoints):`);
  for (const method of predictionMethods) {
    console.log(`   - POST ${baseUrl}/stockpicker.v1.PredictionService/${method.name}`);
  }
  console.log(); // Empty line for readability
}

// CRITICAL: Server must start successfully - exit on failure
server.listen(Number(PORT), HOST, async () => {
  console.log(`🚀 API Server running on http://${HOST}:${PORT}`);
  console.log(`📡 Connect RPC endpoint ready`);
  await listAvailableEndpoints();

  // Initialize scheduler with active strategies after server starts (non-blocking, non-critical)
  initializeSchedulerOnStartup().catch((error) => {
    console.error("⚠️  Failed to initialize scheduler on startup (non-critical):", error);
    console.error("   Server will continue running - workflows will be scheduled on-demand");
  });

  // Start stale workflow run cleanup task
  // This marks workflow runs that have been running for too long as failed
  // Handles cases where workflows fail silently or timeout
  const { startStaleWorkflowRunCleanup } = await import(
    "./services/workflowRuns/staleRunCleanup.js"
  );
  startStaleWorkflowRunCleanup();
});

// CRITICAL: Handle server errors that prevent startup
server.on("error", (error: NodeJS.ErrnoException) => {
  console.error("❌ CRITICAL: Server startup error:", error);
  if (error.code === "EADDRINUSE") {
    console.error(`   Port ${PORT} is already in use`);
    console.error("   Fix: Stop the process using this port or change PORT in environment");
  } else {
    console.error(`   Error code: ${error.code || "unknown"}`);
    console.error(`   Error message: ${error.message}`);
  }
  console.error("   Exiting...");
  // Exit immediately - this is a runtime error, not a startup promise rejection
  process.exit(1);
});

/**
 * Initialize scheduler with active strategies on startup
 * This runs in the background and won't block server startup
 */
async function initializeSchedulerOnStartup(): Promise<void> {
  try {
    console.log("🔄 Initializing scheduler with active strategies...");
    const { schedulerService } = await import("./services/scheduler/schedulerService.js");
    const { executeStrategyWorkflow } = await import("./services/workflow/workflowExecutor.js");
    const { db } = await import("./db.js");
    const { protoNameToFrequency } = await import("./services/strategy/strategyHelpers.js");

    // Get all active strategies
    const rows = (await db.all(
      "SELECT * FROM strategies WHERE status = 'STRATEGY_STATUS_ACTIVE'"
    )) as Array<{ id: string; frequency: string }>;

    console.log(`📋 Found ${rows.length} active strategy(ies) to schedule`);

    for (const row of rows) {
      try {
        const frequency = protoNameToFrequency(row.frequency);
        schedulerService.scheduleStrategy(row.id, frequency, async () => {
          await executeStrategyWorkflow(row.id, frequency);
        });
        schedulerService.startStrategy(row.id);
        console.log(`✅ Scheduled and started job for strategy:`, { strategyId: row.id });
      } catch (error) {
        console.error(`❌ Failed to schedule strategy ${row.id}:`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log("✅ Scheduler initialization completed");
  } catch (error) {
    console.error(
      "❌ Could not initialize scheduler:",
      error instanceof Error ? error.message : String(error)
    );
    // Don't fail the server if scheduler init fails, but log it clearly
  }
}

// CRITICAL: Handle unhandled promise rejections (catches startup errors from db.ts)
process.on("unhandledRejection", (reason, _promise) => {
  console.error("❌ CRITICAL: Unhandled promise rejection:", reason);
  console.error("   This indicates a critical startup error (e.g., migration failure)");
  console.error("   Server cannot start - fix the error and restart");
  console.error("   Note: tsx watch will attempt to restart, but will fail until error is fixed");
  console.error("   Exiting...");
  process.exit(1);
});

// CRITICAL: Handle uncaught exceptions (indicates programming errors)
process.on("uncaughtException", (error) => {
  console.error("❌ CRITICAL: Uncaught exception:", error);
  console.error("   This indicates a programming error that must be fixed");
  console.error("   Exiting...");
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
