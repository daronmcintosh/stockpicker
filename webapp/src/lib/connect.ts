import { PredictionService, StrategyService } from "@/gen/stockpicker/v1/strategy_connect";
import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL || "http://localhost:3001",
});

export const strategyClient = createClient(StrategyService, transport);
export const predictionClient = createClient(PredictionService, transport);
