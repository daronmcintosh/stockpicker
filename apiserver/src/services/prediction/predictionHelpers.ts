import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { type PredictionRow, db } from "../../db.js";
import {
  type Prediction,
  PredictionAction,
  PredictionPrivacy,
  PredictionSchema,
  PredictionSource,
  PredictionStatus,
  RiskLevel,
  UserSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { getUserById } from "../authHelpers.js";

// Helper to safely convert BigInt or number to number
// Ensures we never pass BigInt to protobuf or frontend
export function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    // Double-check: if it's somehow a BigInt that was coerced, ensure it's a regular number
    return Number(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  // Fallback: try to convert whatever it is
  try {
    return Number(value);
  } catch {
    return 0;
  }
}

// Helper to convert Unix timestamp to Date
// Handles both seconds (SQLite unixepoch()) and milliseconds (Date.now())
export function timestampToDate(timestamp: number): Date {
  // If timestamp is < 1e10, it's in seconds, otherwise it's in milliseconds
  const ms = timestamp < 1e10 ? timestamp * 1000 : timestamp;
  return new Date(ms);
}

// Helper to map database source string to PredictionSource enum
export function mapSourceFromDb(source: string | null): PredictionSource {
  if (!source) return PredictionSource.UNSPECIFIED;
  // Database stores "PREDICTION_SOURCE_AI", enum keys are "AI"
  const sourceKey = source.replace("PREDICTION_SOURCE_", "");
  switch (sourceKey) {
    case "AI":
      return PredictionSource.AI;
    case "MANUAL":
      return PredictionSource.MANUAL;
    default:
      return PredictionSource.UNSPECIFIED;
  }
}

// Helper to map PredictionSource enum to database string
export function mapSourceToDb(source: PredictionSource): string {
  switch (source) {
    case PredictionSource.AI:
      return "PREDICTION_SOURCE_AI";
    case PredictionSource.MANUAL:
      return "PREDICTION_SOURCE_MANUAL";
    default:
      return "PREDICTION_SOURCE_UNSPECIFIED";
  }
}

// Helper to map database status string to PredictionStatus enum
export function mapStatusFromDb(status: string): PredictionStatus {
  // Database stores "PREDICTION_STATUS_ACTIVE", enum keys are "ACTIVE"
  const statusKey = status.replace("PREDICTION_STATUS_", "");
  switch (statusKey) {
    case "ACTIVE":
      return PredictionStatus.ACTIVE;
    case "HIT_TARGET":
      return PredictionStatus.HIT_TARGET;
    case "HIT_STOP":
      return PredictionStatus.HIT_STOP;
    case "EXPIRED":
      return PredictionStatus.EXPIRED;
    default:
      return PredictionStatus.UNSPECIFIED;
  }
}

// Helper to map database risk level string to RiskLevel enum
export function mapRiskLevelFromDb(riskLevel: string): RiskLevel {
  // Database stores "RISK_LEVEL_LOW", enum keys are "LOW"
  const riskKey = riskLevel?.replace("RISK_LEVEL_", "") || "";
  switch (riskKey) {
    case "LOW":
      return RiskLevel.LOW;
    case "MEDIUM":
      return RiskLevel.MEDIUM;
    case "HIGH":
      return RiskLevel.HIGH;
    default:
      return RiskLevel.UNSPECIFIED;
  }
}

// Helper to map database action string to enum
export function mapActionToEnum(action: string): PredictionAction {
  switch (action) {
    case "pending":
      return PredictionAction.PENDING;
    case "entered":
      return PredictionAction.ENTERED;
    case "dismissed":
      return PredictionAction.DISMISSED;
    default:
      return PredictionAction.UNSPECIFIED;
  }
}

// Helper to map enum to database action string
export function mapEnumToAction(action: PredictionAction): string {
  switch (action) {
    case PredictionAction.PENDING:
      return "pending";
    case PredictionAction.ENTERED:
      return "entered";
    case PredictionAction.DISMISSED:
      return "dismissed";
    default:
      return "pending";
  }
}

// Helper to map database privacy string to PredictionPrivacy enum
export function mapPredictionPrivacyFromDb(privacy: string): PredictionPrivacy {
  // Database stores "PREDICTION_PRIVACY_PUBLIC", enum keys are "PUBLIC"
  const privacyKey = privacy.replace("PREDICTION_PRIVACY_", "");
  switch (privacyKey) {
    case "PUBLIC":
      return PredictionPrivacy.PUBLIC;
    case "PRIVATE":
      return PredictionPrivacy.PRIVATE;
    default:
      return PredictionPrivacy.PRIVATE;
  }
}

// Helper to map PredictionPrivacy enum to database string
export function mapPredictionPrivacyToDb(privacy: PredictionPrivacy): string {
  switch (privacy) {
    case PredictionPrivacy.PUBLIC:
      return "PREDICTION_PRIVACY_PUBLIC";
    case PredictionPrivacy.PRIVATE:
      return "PREDICTION_PRIVACY_PRIVATE";
    default:
      return "PREDICTION_PRIVACY_PRIVATE";
  }
}

// Helper to calculate stop loss dollar impact
export function calculateStopLossImpact(
  entryPrice: number,
  stopLossPrice: number,
  allocatedAmount: number
): number {
  const priceDiff = entryPrice - stopLossPrice;
  const shares = allocatedAmount / entryPrice;
  return priceDiff * shares;
}

// Helper to calculate target return percentage if not provided
export function calculateTargetReturnPct(entryPrice: number, targetPrice: number): number {
  return ((targetPrice - entryPrice) / entryPrice) * 100;
}

// Helper to calculate stop loss percentage if not provided
export function calculateStopLossPct(entryPrice: number, stopLossPrice: number): number {
  return ((entryPrice - stopLossPrice) / entryPrice) * 100;
}

// Helper to map proto RiskLevel to database string
export function riskLevelToDbString(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case RiskLevel.LOW:
      return "RISK_LEVEL_LOW";
    case RiskLevel.MEDIUM:
      return "RISK_LEVEL_MEDIUM";
    case RiskLevel.HIGH:
      return "RISK_LEVEL_HIGH";
    default:
      return "RISK_LEVEL_UNSPECIFIED";
  }
}

// Helper to convert DB row to proto Prediction message
export async function dbRowToProtoPrediction(row: PredictionRow): Promise<Prediction> {
  const prediction = create(PredictionSchema, {
    id: row.id,
    strategyId: row.strategy_id,
    symbol: row.symbol,
    entryPrice: toNumber(row.entry_price),
    allocatedAmount: toNumber(row.allocated_amount),
    timeHorizonDays: toNumber(row.time_horizon_days ?? 0),
    targetReturnPct: toNumber(row.target_return_pct),
    targetPrice: toNumber(row.target_price),
    stopLossPct: toNumber(row.stop_loss_pct),
    stopLossPrice: toNumber(row.stop_loss_price),
    stopLossDollarImpact: toNumber(row.stop_loss_dollar_impact),
    riskLevel: mapRiskLevelFromDb(row.risk_level),
    technicalAnalysis: row.technical_analysis || "",
    sentimentScore: toNumber(row.sentiment_score),
    overallScore: toNumber(row.overall_score),
    action: mapActionToEnum(row.action),
    status: mapStatusFromDb(row.status),
    createdAt: timestampFromDate(new Date(row.created_at)),
    privacy: mapPredictionPrivacyFromDb(row.privacy || "PREDICTION_PRIVACY_PRIVATE"),
    source: mapSourceFromDb(row.source),
    userId: row.user_id,
    evaluationDate: row.evaluation_date
      ? timestampFromDate(new Date(row.evaluation_date))
      : undefined,
    currentPrice: row.current_price !== null ? toNumber(row.current_price) : undefined,
    currentReturnPct:
      row.current_return_pct !== null ? toNumber(row.current_return_pct) : undefined,
    closedAt: row.closed_at ? timestampFromDate(new Date(row.closed_at)) : undefined,
    closedReason: row.closed_reason || undefined,
  });

  // Populate user field
  const userRow = await getUserById(row.user_id);
  if (userRow) {
    prediction.user = create(UserSchema, {
      id: userRow.id,
      email: userRow.email,
      username: userRow.username,
      displayName: userRow.display_name ?? undefined,
      avatarUrl: userRow.avatar_url ?? undefined,
      createdAt: timestampFromDate(timestampToDate(userRow.created_at)),
      updatedAt: timestampFromDate(timestampToDate(userRow.updated_at)),
    });
  }

  return prediction;
}
