import { PredictionService, StrategyService } from "@/gen/stockpicker/v1/strategy_pb";
import { createClient as createConnectClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
console.log("[CONNECT] API Base URL:", API_BASE_URL);

// Create transport with logging interceptor
function createTransportWithAuth(token?: string) {
  return createConnectTransport({
    baseUrl: API_BASE_URL,
    interceptors: [
      (next) => async (req) => {
        // Add auth token if provided
        if (token) {
          req.header.set("Authorization", `Bearer ${token}`);
        }

        console.log("[CONNECT TRANSPORT] Outgoing request:", {
          url: req.url,
          method: req.method,
          hasAuth: !!token,
          headers: Object.fromEntries(req.header),
        });
        try {
          const response = await next(req);
          console.log("[CONNECT TRANSPORT] ✅ Response received:", {
            headers: Object.fromEntries(response.header),
          });
          return response;
        } catch (err) {
          console.error("[CONNECT TRANSPORT] ❌ Request failed:", err);
          console.error("[CONNECT TRANSPORT] Error details:", {
            name: err instanceof Error ? err.name : "Unknown",
            message: err instanceof Error ? err.message : String(err),
            code:
              typeof err === "object" && err !== null && "code" in err
                ? String(err.code)
                : undefined,
            cause:
              typeof err === "object" && err !== null && "cause" in err ? err.cause : undefined,
            err,
          });
          throw err;
        }
      },
    ],
  });
}

// Legacy clients (deprecated - use useAuthenticatedClient hook instead)
const transport = createTransportWithAuth();
export const strategyClient = createConnectClient(StrategyService, transport);
export const predictionClient = createConnectClient(PredictionService, transport);

// Create authenticated clients (preferred)
// Returns both strategy and prediction clients
export function createClient(token?: string) {
  const transportWithAuth = createTransportWithAuth(token);

  return {
    strategy: createConnectClient(StrategyService, transportWithAuth),
    prediction: createConnectClient(PredictionService, transportWithAuth),
  };
}
