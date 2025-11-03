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

// Compute a ranking score for a prediction (0-100).
// Uses available fields: overallScore (0-10), targetReturnPct, riskLevel (penalty), and sentimentScore.
// The formula is simple and deterministic; can be refined later.
export function scorePrediction(prediction: Prediction): number {
  const overall = Math.max(0, Math.min(10, toNumber(prediction.overallScore)));
  const targetReturnPct = toNumber(prediction.targetReturnPct);
  const sentiment = Math.max(0, Math.min(10, toNumber(prediction.sentimentScore)));

  // Risk penalty by enum name; higher risk => larger penalty
  const risk = String(prediction.riskLevel || "")
    .toString()
    .toUpperCase();
  let riskPenalty = 0;
  if (risk.includes("HIGH")) riskPenalty = 10;
  else if (risk.includes("MEDIUM")) riskPenalty = 5;
  else if (risk.includes("LOW")) riskPenalty = 2;

  // Normalize components
  const overallComponent = (overall / 10) * 60; // weight 60
  const returnComponent = Math.max(0, Math.min(40, targetReturnPct)); // cap at 40%
  const sentimentComponent = (sentiment / 10) * 10; // bonus up to +10
  const penaltyComponent = riskPenalty; // subtract

  const raw = overallComponent + returnComponent + sentimentComponent - penaltyComponent;
  return Math.max(0, Math.min(100, Number(raw.toFixed(1))));
}
