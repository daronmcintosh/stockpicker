import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import { type PredictionRow, type StrategyRow, db } from "../../db.js";
import {
  Frequency,
  RiskLevel,
  type Strategy,
  StrategyPrivacy,
  StrategySchema,
  StrategyStatus,
  User,
  UserSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { getUserById } from "../authHelpers.js";

// Helper to convert frequency enum to trades per month
export function getTradesPerMonth(frequency: Frequency): number {
  switch (frequency) {
    case Frequency.DAILY:
      return 22; // ~22 trading days per month
    case Frequency.TWICE_WEEKLY:
      return 8;
    case Frequency.WEEKLY:
      return 4;
    case Frequency.BIWEEKLY:
      return 2;
    case Frequency.MONTHLY:
      return 1;
    default:
      return 8; // default to twice weekly
  }
}

// Helper to convert frequency to name
export function frequencyToName(frequency: Frequency): string {
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
      return "Unknown";
  }
}

// Helper to convert enum numeric value to proto enum name string for database storage
export function riskLevelToProtoName(riskLevel: RiskLevel): string {
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

export function frequencyToProtoName(frequency: Frequency): string {
  switch (frequency) {
    case Frequency.DAILY:
      return "FREQUENCY_DAILY";
    case Frequency.TWICE_WEEKLY:
      return "FREQUENCY_TWICE_WEEKLY";
    case Frequency.WEEKLY:
      return "FREQUENCY_WEEKLY";
    case Frequency.BIWEEKLY:
      return "FREQUENCY_BIWEEKLY";
    case Frequency.MONTHLY:
      return "FREQUENCY_MONTHLY";
    default:
      return "FREQUENCY_UNSPECIFIED";
  }
}

export function strategyStatusToProtoName(status: StrategyStatus): string {
  switch (status) {
    case StrategyStatus.ACTIVE:
      return "STRATEGY_STATUS_ACTIVE";
    case StrategyStatus.PAUSED:
      return "STRATEGY_STATUS_PAUSED";
    case StrategyStatus.STOPPED:
      return "STRATEGY_STATUS_STOPPED";
    default:
      return "STRATEGY_STATUS_UNSPECIFIED";
  }
}

// Helper to convert proto enum name string from database to enum numeric value
export function protoNameToRiskLevel(protoName: string): RiskLevel {
  switch (protoName) {
    case "RISK_LEVEL_LOW":
      return RiskLevel.LOW;
    case "RISK_LEVEL_MEDIUM":
      return RiskLevel.MEDIUM;
    case "RISK_LEVEL_HIGH":
      return RiskLevel.HIGH;
    default:
      return RiskLevel.UNSPECIFIED;
  }
}

export function protoNameToFrequency(protoName: string): Frequency {
  switch (protoName) {
    case "FREQUENCY_DAILY":
      return Frequency.DAILY;
    case "FREQUENCY_TWICE_WEEKLY":
      return Frequency.TWICE_WEEKLY;
    case "FREQUENCY_WEEKLY":
      return Frequency.WEEKLY;
    case "FREQUENCY_BIWEEKLY":
      return Frequency.BIWEEKLY;
    case "FREQUENCY_MONTHLY":
      return Frequency.MONTHLY;
    default:
      return Frequency.UNSPECIFIED;
  }
}

export function protoNameToStrategyStatus(protoName: string): StrategyStatus {
  switch (protoName) {
    case "STRATEGY_STATUS_ACTIVE":
      return StrategyStatus.ACTIVE;
    case "STRATEGY_STATUS_PAUSED":
      return StrategyStatus.PAUSED;
    case "STRATEGY_STATUS_STOPPED":
      return StrategyStatus.STOPPED;
    default:
      return StrategyStatus.UNSPECIFIED;
  }
}

// Helper to safely convert BigInt or number to number
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

// Helper to safely convert BigInt or number to integer
export function toInteger(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Helper to convert Unix timestamp to Date
// Handles both seconds (SQLite unixepoch()) and milliseconds (Date.now())
export function timestampToDate(timestamp: number): Date {
  // If timestamp is < 1e10, it's in seconds, otherwise it's in milliseconds
  const ms = timestamp < 1e10 ? timestamp * 1000 : timestamp;
  return new Date(ms);
}

// Helper to convert DB row to proto Strategy message
export async function dbRowToProtoStrategy(row: StrategyRow): Promise<Strategy> {
  try {
    // Calculate current_month_spent from active predictions (where action = 'entered')
    // This ensures accuracy and avoids synchronization issues
    const activePredictionsRows = (await db.all(
      `SELECT allocated_amount FROM predictions
       WHERE strategy_id = ?
       AND status = 'PREDICTION_STATUS_ACTIVE'
       AND action = 'entered'`,
      [row.id]
    )) as Pick<PredictionRow, "allocated_amount">[];

    const currentMonthSpent = activePredictionsRows.reduce(
      (sum, pRow) => sum + toNumber(pRow.allocated_amount),
      0
    );

    const strategy = create(StrategySchema, {
      id: row.id,
      name: row.name,
      description: row.description,
      customPrompt: row.custom_prompt,
      monthlyBudget: toNumber(row.monthly_budget),
      currentMonthSpent,
      currentMonthStart: timestampFromDate(new Date(row.current_month_start)),
      timeHorizon: row.time_horizon,
      targetReturnPct: toNumber(row.target_return_pct),
      frequency: protoNameToFrequency(row.frequency),
      tradesPerMonth: toInteger(row.trades_per_month),
      perTradeBudget: toNumber(row.per_trade_budget),
      perStockAllocation: toNumber(row.per_stock_allocation),
      riskLevel: protoNameToRiskLevel(row.risk_level),
      uniqueStocksCount: toInteger(row.unique_stocks_count),
      maxUniqueStocks: toInteger(row.max_unique_stocks),
      status: protoNameToStrategyStatus(row.status),
      privacy: mapPrivacyFromDb(row.privacy),
      userId: row.user_id,
      createdAt: timestampFromDate(new Date(row.created_at)),
      updatedAt: timestampFromDate(new Date(row.updated_at)),
    });

    if (row.next_trade_scheduled) {
      strategy.nextTradeScheduled = timestampFromDate(new Date(row.next_trade_scheduled));
    }
    if (row.last_trade_executed) {
      strategy.lastTradeExecuted = timestampFromDate(new Date(row.last_trade_executed));
    }

    // Populate user field
    if (row.user_id) {
      try {
        console.log(`👤 Fetching user for strategy:`, { strategyId: row.id, userId: row.user_id });
        const userRow = await getUserById(row.user_id);
        if (userRow) {
          console.log(`👤 User found, creating User proto:`, {
            userId: userRow.id,
            username: userRow.username,
          });
          strategy.user = create(UserSchema, {
            id: userRow.id,
            email: userRow.email,
            username: userRow.username,
            displayName: userRow.display_name ?? undefined,
            avatarUrl: userRow.avatar_url ?? undefined,
            createdAt: timestampFromDate(timestampToDate(userRow.created_at)),
            updatedAt: timestampFromDate(timestampToDate(userRow.updated_at)),
          });
          console.log(`✅ User proto created successfully`);
        } else {
          console.warn(`⚠️ User ${row.user_id} not found in database for strategy ${row.id}`);
        }
      } catch (userError) {
        console.error(`❌ Failed to fetch user ${row.user_id} for strategy ${row.id}:`, userError);
        if (userError instanceof Error) {
          console.error("User fetch error details:", {
            message: userError.message,
            stack: userError.stack,
          });
        }
        // Continue without user field - non-critical
      }
    } else {
      console.warn(`⚠️ Strategy ${row.id} has no user_id`);
    }

    return strategy;
  } catch (error) {
    console.error(`❌ Error in dbRowToProtoStrategy for strategy ${row.id}:`, error);
    if (error instanceof Error) {
      console.error("Strategy conversion error:", {
        message: error.message,
        stack: error.stack,
      });
    }
    throw error;
  }
}

// Helper to map database privacy string to StrategyPrivacy enum
export function mapPrivacyFromDb(privacy: string): StrategyPrivacy {
  switch (privacy) {
    case "STRATEGY_PRIVACY_PUBLIC":
      return StrategyPrivacy.PUBLIC;
    case "STRATEGY_PRIVACY_PRIVATE":
      return StrategyPrivacy.PRIVATE;
    default:
      return StrategyPrivacy.PRIVATE;
  }
}

// Helper to map StrategyPrivacy enum to database string
export function mapPrivacyToDb(privacy: StrategyPrivacy): string {
  switch (privacy) {
    case StrategyPrivacy.PUBLIC:
      return "STRATEGY_PRIVACY_PUBLIC";
    case StrategyPrivacy.PRIVATE:
      return "STRATEGY_PRIVACY_PRIVATE";
    default:
      return "STRATEGY_PRIVACY_PRIVATE";
  }
}
