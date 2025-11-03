import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionSource } from "@/gen/stockpicker/v1/strategy_pb";

// Helper to determine prediction source
export function getPredictionSource(prediction: Prediction): "AI" | "Manual" {
  const source = prediction.source;
  if (source === PredictionSource.MANUAL) return "Manual";
  if (source === PredictionSource.AI) return "AI";
  // Fallback: try to detect from technical analysis content
  if (
    prediction.technicalAnalysis &&
    prediction.technicalAnalysis !== "Manual prediction" &&
    prediction.technicalAnalysis.length > 50
  ) {
    return "Manual";
  }
  return "AI"; // Default to AI for now
}

// Helper to safely convert BigInt or number to number (for protobuf numeric fields)
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}
