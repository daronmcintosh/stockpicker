import {
  Frequency,
  PredictionAction,
  PredictionSource,
  PredictionStatus,
  RiskLevel,
} from "@/gen/stockpicker/v1/strategy_pb";
import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";

export function getFrequencyLabel(frequency: Frequency): string {
  switch (frequency) {
    case Frequency.DAILY:
      return "Daily";
    case Frequency.TWICE_WEEKLY:
      return "Twice Weekly";
    case Frequency.WEEKLY:
      return "Weekly";
    case Frequency.BIWEEKLY:
      return "Biweekly";
    case Frequency.MONTHLY:
      return "Monthly";
    default:
      return "Unspecified";
  }
}

export function getRiskLevelLabel(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case RiskLevel.LOW:
      return "Low";
    case RiskLevel.MEDIUM:
      return "Medium";
    case RiskLevel.HIGH:
      return "High";
    default:
      return "Unspecified";
  }
}

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

export function getStatusColor(status: PredictionStatus) {
  switch (status) {
    case PredictionStatus.ACTIVE:
      return "bg-blue-100 text-blue-800";
    case PredictionStatus.HIT_TARGET:
      return "bg-green-100 text-green-800";
    case PredictionStatus.HIT_STOP:
      return "bg-red-100 text-red-800";
    case PredictionStatus.EXPIRED:
      return "bg-gray-100 text-gray-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getStatusLabel(status: PredictionStatus) {
  switch (status) {
    case PredictionStatus.ACTIVE:
      return "Active";
    case PredictionStatus.HIT_TARGET:
      return "Hit Target";
    case PredictionStatus.HIT_STOP:
      return "Hit Stop";
    case PredictionStatus.EXPIRED:
      return "Expired";
    default:
      return "Unknown";
  }
}

export function getActionLabel(action: PredictionAction) {
  switch (action) {
    case PredictionAction.PENDING:
      return "Pending";
    case PredictionAction.ENTERED:
      return "Entered";
    case PredictionAction.DISMISSED:
      return "Dismissed";
    default:
      return "Unspecified";
  }
}
