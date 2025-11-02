import { appConfig } from "./config.js";
import { createServer } from "node:http";
import type { ConnectRouter } from "@connectrpc/connect";
import { connectNodeAdapter } from "@connectrpc/connect-node";
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

server.listen(Number(PORT), HOST, () => {
  console.log(`🚀 API Server running on http://${HOST}:${PORT}`);
  console.log(`📡 Connect RPC endpoint ready`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
