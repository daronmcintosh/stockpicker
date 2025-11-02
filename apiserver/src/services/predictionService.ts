import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type PredictionRow, type StrategyRow, db } from "../db.js";
import {
  type CopyPredictionRequest,
  type CopyPredictionResponse,
  CopyPredictionResponseSchema,
  type CreatePredictionRequest,
  type CreatePredictionResponse,
  CreatePredictionResponseSchema,
  type DeletePredictionRequest,
  type DeletePredictionResponse,
  DeletePredictionResponseSchema,
  type GetCurrentPricesRequest,
  type GetCurrentPricesResponse,
  GetCurrentPricesResponseSchema,
  type GetPredictionRequest,
  type GetPredictionResponse,
  GetPredictionResponseSchema,
  type GetPredictionsBySymbolRequest,
  type GetPredictionsBySymbolResponse,
  GetPredictionsBySymbolResponseSchema,
  type GetPublicPredictionsRequest,
  type GetPublicPredictionsResponse,
  GetPublicPredictionsResponseSchema,
  type ListPredictionsRequest,
  type ListPredictionsResponse,
  ListPredictionsResponseSchema,
  type Prediction,
  PredictionAction,
  PredictionPrivacy,
  PredictionSchema,
  PredictionSource,
  PredictionStatus,
  RiskLevel,
  type UpdatePredictionActionRequest,
  type UpdatePredictionActionResponse,
  UpdatePredictionActionResponseSchema,
  type UpdatePredictionPrivacyRequest,
  type UpdatePredictionPrivacyResponse,
  UpdatePredictionPrivacyResponseSchema,
  type User,
  UserSchema,
} from "../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId, getUserById } from "./authHelpers.js";

// Helper to safely convert BigInt or number to number
// Ensures we never pass BigInt to protobuf or frontend
function toNumber(value: unknown): number {
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

// Helper to map database source string to PredictionSource enum
function mapSourceFromDb(source: string | null): PredictionSource {
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
function mapSourceToDb(source: PredictionSource): string {
  switch (source) {
    case PredictionSource.AI:
      return "PREDICTION_SOURCE_AI";
    case PredictionSource.MANUAL:
      return "PREDICTION_SOURCE_MANUAL";
    default:
      return "PREDICTION_SOURCE_UNSPECIFIED";
  }
}

// Helper to convert DB row to proto Prediction message
export async function dbRowToProtoPrediction(row: PredictionRow): Promise<Prediction> {
  // Handle timestamp conversion - SQLite unixepoch() returns seconds, Date.now() returns milliseconds
  const timestampToDate = (timestamp: number): Date => {
    const ms = timestamp < 1e10 ? timestamp * 1000 : timestamp;
    return new Date(ms);
  };

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

// Helper to map database status string to PredictionStatus enum
function mapStatusFromDb(status: string): PredictionStatus {
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
function mapRiskLevelFromDb(riskLevel: string): RiskLevel {
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
function mapActionToEnum(action: string): PredictionAction {
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
function mapEnumToAction(action: PredictionAction): string {
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
function mapPredictionPrivacyFromDb(privacy: string): PredictionPrivacy {
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
function mapPredictionPrivacyToDb(privacy: PredictionPrivacy): string {
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
function calculateStopLossImpact(
  entryPrice: number,
  stopLossPrice: number,
  allocatedAmount: number
): number {
  const priceDiff = entryPrice - stopLossPrice;
  const shares = allocatedAmount / entryPrice;
  return priceDiff * shares;
}

// Helper to calculate target return percentage if not provided
function calculateTargetReturnPct(entryPrice: number, targetPrice: number): number {
  return ((targetPrice - entryPrice) / entryPrice) * 100;
}

// Helper to calculate stop loss percentage if not provided
function calculateStopLossPct(entryPrice: number, stopLossPrice: number): number {
  return ((entryPrice - stopLossPrice) / entryPrice) * 100;
}

// Helper to map proto RiskLevel to database string
function riskLevelToDbString(riskLevel: RiskLevel): string {
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

// Prediction service implementation
export const predictionServiceImpl = {
  async createPrediction(
    req: CreatePredictionRequest,
    context: HandlerContext
  ): Promise<CreatePredictionResponse> {
    try {
      const userId = getCurrentUserId(context);
      console.log("📝 Creating prediction:", {
        strategyId: req.strategyId,
        symbol: req.symbol,
        entryPrice: req.entryPrice,
        allocatedAmount: req.allocatedAmount,
        userId,
      });

      // Get strategy to determine user_id and validate ownership
      const strategyRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.strategyId,
      ])) as StrategyRow | undefined;

      if (!strategyRow) {
        throw new ConnectError(`Strategy not found: ${req.strategyId}`, Code.NotFound);
      }

      // Check ownership: user must own the strategy to create predictions for it
      if (userId !== strategyRow.user_id) {
        throw new ConnectError(
          "Access denied: You can only create predictions for your own strategies",
          Code.PermissionDenied
        );
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      // Calculate derived fields if not provided
      const targetReturnPct =
        req.targetReturnPct ?? calculateTargetReturnPct(req.entryPrice, req.targetPrice);
      const stopLossPct =
        req.stopLossPct ?? calculateStopLossPct(req.entryPrice, req.stopLossPrice);
      const stopLossDollarImpact = calculateStopLossImpact(
        req.entryPrice,
        req.stopLossPrice,
        req.allocatedAmount
      );
      const riskLevelStr = req.riskLevel
        ? riskLevelToDbString(req.riskLevel)
        : "RISK_LEVEL_UNSPECIFIED";

      // Determine source - default to MANUAL if not specified (for manual creation dialog)
      const source = req.source ?? PredictionSource.MANUAL;
      const sourceStr = mapSourceToDb(source);

      // Calculate evaluation date if time horizon is provided
      let evaluationDate: string | null = null;
      if (req.timeHorizonDays) {
        const evalDate = new Date();
        evalDate.setDate(evalDate.getDate() + req.timeHorizonDays);
        evaluationDate = evalDate.toISOString().split("T")[0];
      }

      const predictionData = {
        id,
        strategy_id: req.strategyId,
        symbol: req.symbol,
        entry_price: req.entryPrice,
        allocated_amount: req.allocatedAmount,
        time_horizon_days: req.timeHorizonDays ?? null,
        evaluation_date: evaluationDate,
        target_return_pct: targetReturnPct,
        target_price: req.targetPrice,
        stop_loss_pct: stopLossPct,
        stop_loss_price: req.stopLossPrice,
        stop_loss_dollar_impact: stopLossDollarImpact,
        risk_level: riskLevelStr,
        technical_analysis: req.technicalAnalysis || "",
        sentiment_score: req.sentimentScore,
        overall_score: req.overallScore,
        action: "pending", // Default to pending
        status: "PREDICTION_STATUS_ACTIVE",
        current_price: null,
        current_return_pct: null,
        closed_at: null,
        closed_reason: null,
        created_at: now,
        source: sourceStr,
        user_id: strategyRow.user_id, // Inherit from strategy owner
      };

      console.log("💾 Inserting prediction data:", predictionData);

      // Use direct query instead of prepared statement
      await db.run(
        `
        INSERT INTO predictions (
          id, strategy_id, symbol, entry_price, allocated_amount, time_horizon_days,
          evaluation_date, target_return_pct, target_price, stop_loss_pct,
          stop_loss_price, stop_loss_dollar_impact, risk_level, technical_analysis,
          sentiment_score, overall_score, action, status, current_price, current_return_pct,
          closed_at, closed_reason, created_at, source, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          predictionData.id,
          predictionData.strategy_id,
          predictionData.symbol,
          predictionData.entry_price,
          predictionData.allocated_amount,
          predictionData.time_horizon_days,
          predictionData.evaluation_date,
          predictionData.target_return_pct,
          predictionData.target_price,
          predictionData.stop_loss_pct,
          predictionData.stop_loss_price,
          predictionData.stop_loss_dollar_impact,
          predictionData.risk_level,
          predictionData.technical_analysis,
          predictionData.sentiment_score,
          predictionData.overall_score,
          predictionData.action,
          predictionData.status,
          predictionData.current_price,
          predictionData.current_return_pct,
          predictionData.closed_at,
          predictionData.closed_reason,
          predictionData.created_at,
          predictionData.source,
          predictionData.user_id,
        ]
      );

      const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [id])) as PredictionRow;
      const prediction = await dbRowToProtoPrediction(row);

      console.log("✅ Prediction created successfully:", id);

      return create(CreatePredictionResponseSchema, { prediction });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        console.error("❌ ConnectError in createPrediction:", {
          code: error.code,
          message: error.message,
          strategyId: req.strategyId,
        });
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error creating prediction:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        strategyId: req.strategyId,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },

  async listPredictions(
    req: ListPredictionsRequest,
    context: HandlerContext
  ): Promise<ListPredictionsResponse> {
    try {
      const userId = getCurrentUserId(context);

      // Get strategy to validate ownership
      const strategyRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.strategyId,
      ])) as StrategyRow | undefined;

      if (!strategyRow) {
        throw new ConnectError(`Strategy not found: ${req.strategyId}`, Code.NotFound);
      }

      // Check access: owner OR public strategy
      const isOwner = userId && strategyRow.user_id === userId;
      const isPublic = strategyRow.privacy === "STRATEGY_PRIVACY_PUBLIC";

      if (!isOwner && !isPublic) {
        throw new ConnectError("Access denied: This strategy is private", Code.PermissionDenied);
      }

      let rows: PredictionRow[];
      if (req.status) {
        const statusStr = PredictionStatus[req.status] || "PREDICTION_STATUS_ACTIVE";
        rows = (await db.all(
          "SELECT * FROM predictions WHERE strategy_id = ? AND status = ? ORDER BY created_at DESC",
          [req.strategyId, statusStr]
        )) as PredictionRow[];
      } else {
        rows = (await db.all(
          "SELECT * FROM predictions WHERE strategy_id = ? ORDER BY created_at DESC",
          [req.strategyId]
        )) as PredictionRow[];
      }

      const predictions = await Promise.all(rows.map((row) => dbRowToProtoPrediction(row)));
      return create(ListPredictionsResponseSchema, { predictions });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error in listPredictions:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        strategyId: req.strategyId,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },

  async getPrediction(
    req: GetPredictionRequest,
    context: HandlerContext
  ): Promise<GetPredictionResponse> {
    try {
      const userId = getCurrentUserId(context);
      const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
        | PredictionRow
        | undefined;
      if (!row) {
        throw new ConnectError(`Prediction not found: ${req.id}`, Code.NotFound);
      }

      // Check access: owner OR public prediction
      const isOwner = userId && row.user_id === userId;
      const isPublic = row.privacy === "PREDICTION_PRIVACY_PUBLIC";

      if (!isOwner && !isPublic) {
        throw new ConnectError("Access denied: This prediction is private", Code.PermissionDenied);
      }

      const prediction = await dbRowToProtoPrediction(row);
      return create(GetPredictionResponseSchema, { prediction });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error in getPrediction:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        predictionId: req.id,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },

  async getPredictionsBySymbol(
    req: GetPredictionsBySymbolRequest,
    context: HandlerContext
  ): Promise<GetPredictionsBySymbolResponse> {
    const userId = getCurrentUserId(context);

    let rows: PredictionRow[];
    if (req.strategyId) {
      // Filter by both symbol and strategy
      rows = (await db.all(
        "SELECT * FROM predictions WHERE symbol = ? AND strategy_id = ? ORDER BY created_at DESC",
        [req.symbol, req.strategyId]
      )) as PredictionRow[];
    } else {
      rows = (await db.all("SELECT * FROM predictions WHERE symbol = ? ORDER BY created_at DESC", [
        req.symbol,
      ])) as PredictionRow[];
    }

    // Filter to show user's own + public predictions
    const accessibleRows = rows.filter((row) => {
      const isOwner = userId && row.user_id === userId;
      const isPublic = row.privacy === "PREDICTION_PRIVACY_PUBLIC";
      return isOwner || isPublic;
    });

    const predictions = await Promise.all(accessibleRows.map((row) => dbRowToProtoPrediction(row)));
    return create(GetPredictionsBySymbolResponseSchema, { predictions });
  },

  async updatePredictionAction(
    req: UpdatePredictionActionRequest,
    context: HandlerContext
  ): Promise<UpdatePredictionActionResponse> {
    try {
      const userId = getCurrentUserId(context);

      // Check ownership before update
      const existingRow = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
        | PredictionRow
        | undefined;
      if (!existingRow) {
        throw new ConnectError(`Prediction not found: ${req.id}`, Code.NotFound);
      }

      if (userId !== existingRow.user_id) {
        throw new ConnectError(
          "Access denied: You can only update your own predictions",
          Code.PermissionDenied
        );
      }

      const actionStr = mapEnumToAction(req.action);
      await db.run("UPDATE predictions SET action = ? WHERE id = ?", [actionStr, req.id]);

      const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
        | PredictionRow
        | undefined;
      if (!row) {
        throw new ConnectError(`Prediction not found: ${req.id}`, Code.NotFound);
      }

      const prediction = await dbRowToProtoPrediction(row);
      return create(UpdatePredictionActionResponseSchema, { prediction });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error in updatePredictionAction:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        predictionId: req.id,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },

  async getPublicPredictions(
    req: GetPublicPredictionsRequest,
    _context: HandlerContext
  ): Promise<GetPublicPredictionsResponse> {
    const limit = req.limit ?? 50;
    const offset = req.offset ?? 0;

    // Get total count of public predictions
    const countRow = (await db.get(
      "SELECT COUNT(*) as count FROM predictions WHERE privacy = 'PREDICTION_PRIVACY_PUBLIC'"
    )) as { count: number };
    const total = countRow.count;

    // Get public predictions sorted by most recent
    const rows = (await db.all(
      `SELECT * FROM predictions
       WHERE privacy = 'PREDICTION_PRIVACY_PUBLIC'
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    )) as PredictionRow[];

    const predictions = await Promise.all(rows.map((row) => dbRowToProtoPrediction(row)));

    console.log(`📋 Fetched ${predictions.length} public predictions (total: ${total})`);

    return create(GetPublicPredictionsResponseSchema, { predictions, total });
  },

  async updatePredictionPrivacy(
    req: UpdatePredictionPrivacyRequest,
    context: HandlerContext
  ): Promise<UpdatePredictionPrivacyResponse> {
    try {
      const userId = getCurrentUserId(context);

      // Check ownership before update
      const existingRow = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
        | PredictionRow
        | undefined;
      if (!existingRow) {
        throw new ConnectError(`Prediction not found: ${req.id}`, Code.NotFound);
      }

      if (userId !== existingRow.user_id) {
        throw new ConnectError(
          "Access denied: You can only update privacy for your own predictions",
          Code.PermissionDenied
        );
      }

      const privacyStr = mapPredictionPrivacyToDb(req.privacy);

      await db.run("UPDATE predictions SET privacy = ? WHERE id = ?", [privacyStr, req.id]);

      const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
        | PredictionRow
        | undefined;
      if (!row) {
        throw new ConnectError(`Prediction not found: ${req.id}`, Code.NotFound);
      }

      const prediction = await dbRowToProtoPrediction(row);

      console.log(`🔒 Updated prediction privacy: ${req.id} -> ${privacyStr}`);

      return create(UpdatePredictionPrivacyResponseSchema, { prediction });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error in updatePredictionPrivacy:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        predictionId: req.id,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },

  // TODO: Uncomment after regenerating proto files to include UpdatePredictionRequest and UpdatePredictionResponse
  // async updatePrediction(req: UpdatePredictionRequest): Promise<UpdatePredictionResponse> {
  //   try {
  //     // First, get the existing prediction to calculate derived fields
  //     const existingRow = (await db.get("SELECT * FROM predictions WHERE id = ?", [
  //       req.id,
  //     ])) as PredictionRow | undefined;

  //     if (!existingRow) {
  //       throw new Error(`Prediction not found: ${req.id}`);
  //     }

  //     // Use provided values or fall back to existing values
  //     const entryPrice = req.entryPrice ?? toNumber(existingRow.entry_price);
  //     const targetPrice = req.targetPrice ?? toNumber(existingRow.target_price);
  //     const stopLossPrice = req.stopLossPrice ?? toNumber(existingRow.stop_loss_price);
  //     const allocatedAmount = req.allocatedAmount ?? toNumber(existingRow.allocated_amount);

  //     // Recalculate derived fields if prices changed
  //     const targetReturnPct =
  //       entryPrice && targetPrice ? calculateTargetReturnPct(entryPrice, targetPrice) : toNumber(existingRow.target_return_pct);
  //     const stopLossPct =
  //       entryPrice && stopLossPrice ? calculateStopLossPct(entryPrice, stopLossPrice) : toNumber(existingRow.stop_loss_pct);
  //     const stopLossDollarImpact = calculateStopLossImpact(entryPrice, stopLossPrice, allocatedAmount);

  //     // Build update query dynamically
  //     const updates: string[] = [];
  //     const params: unknown[] = [];

  //     if (req.symbol !== undefined) {
  //       updates.push("symbol = ?");
  //       params.push(req.symbol.toUpperCase());
  //     }
  //     if (req.entryPrice !== undefined) {
  //       updates.push("entry_price = ?");
  //       params.push(entryPrice);
  //       // Recalculate derived fields when entry price changes
  //       updates.push("target_return_pct = ?");
  //       params.push(targetReturnPct);
  //       updates.push("stop_loss_pct = ?");
  //       params.push(stopLossPct);
  //       updates.push("stop_loss_dollar_impact = ?");
  //       params.push(stopLossDollarImpact);
  //     }
  //     if (req.allocatedAmount !== undefined) {
  //       updates.push("allocated_amount = ?");
  //       params.push(allocatedAmount);
  //       // Recalculate stop loss impact when allocated amount changes
  //       updates.push("stop_loss_dollar_impact = ?");
  //       params.push(stopLossDollarImpact);
  //     }
  //     if (req.targetPrice !== undefined) {
  //       updates.push("target_price = ?");
  //       params.push(targetPrice);
  //       updates.push("target_return_pct = ?");
  //       params.push(targetReturnPct);
  //     }
  //     if (req.stopLossPrice !== undefined) {
  //       updates.push("stop_loss_price = ?");
  //       params.push(stopLossPrice);
  //       updates.push("stop_loss_pct = ?");
  //       params.push(stopLossPct);
  //       updates.push("stop_loss_dollar_impact = ?");
  //       params.push(stopLossDollarImpact);
  //     }
  //     if (req.sentimentScore !== undefined) {
  //       updates.push("sentiment_score = ?");
  //       params.push(req.sentimentScore);
  //     }
  //     if (req.overallScore !== undefined) {
  //       updates.push("overall_score = ?");
  //       params.push(req.overallScore);
  //     }
  //     if (req.technicalAnalysis !== undefined) {
  //       updates.push("technical_analysis = ?");
  //       params.push(req.technicalAnalysis);
  //     }
  //     if (req.timeHorizonDays !== undefined) {
  //       updates.push("time_horizon_days = ?");
  //       params.push(req.timeHorizonDays);
  //     }
  //     if (req.riskLevel !== undefined) {
  //       updates.push("risk_level = ?");
  //       params.push(riskLevelToDbString(req.riskLevel));
  //     }

  //     if (updates.length === 0) {
  //       // No updates provided, just return the existing prediction
  //       const prediction = dbRowToProtoPrediction(existingRow);
  //       return new UpdatePredictionResponse({ prediction });
  //     }

  //     // Add WHERE clause
  //     params.push(req.id);

  //     const sql = `UPDATE predictions SET ${updates.join(", ")} WHERE id = ?`;
  //     await db.run(sql, params);

  //     // Fetch updated prediction
  //     const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
  //       | PredictionRow
  //       | undefined;
  //     if (!row) {
  //       throw new Error(`Prediction not found after update: ${req.id}`);
  //     }

  //     const prediction = dbRowToProtoPrediction(row);
  //     console.log(`✅ Updated prediction: ${req.id}`);

  //     return new UpdatePredictionResponse({ prediction });
  //   } catch (error) {
  //     console.error("❌ Error updating prediction:", error);
  //     throw error;
  //   }
  // },

  async getCurrentPrices(
    req: GetCurrentPricesRequest,
    _context: HandlerContext
  ): Promise<GetCurrentPricesResponse> {
    const prices: Record<string, number> = {};
    const symbols = req.symbols || [];

    // Fetch prices for each symbol
    for (const symbol of symbols) {
      try {
        // Try Alpha Vantage first if API key is available
        const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        if (apiKey) {
          const url = new URL("https://www.alphavantage.co/query");
          url.searchParams.set("function", "GLOBAL_QUOTE");
          url.searchParams.set("symbol", symbol);
          url.searchParams.set("apikey", apiKey);

          const response = await fetch(url.toString());
          if (response.ok) {
            interface AlphaVantageQuote {
              "Global Quote"?: {
                "05. price"?: string;
              };
            }
            const data = (await response.json()) as AlphaVantageQuote;
            const quote = data?.["Global Quote"];
            if (quote?.["05. price"]) {
              const price = Number.parseFloat(quote["05. price"]);
              if (!Number.isNaN(price)) {
                prices[symbol] = price;
                continue; // Successfully fetched, move to next symbol
              }
            }
          }
        }

        // Fallback: Try Yahoo Finance (no API key required)
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
        const yahooResponse = await fetch(yahooUrl);
        if (yahooResponse.ok) {
          interface YahooFinanceChart {
            chart?: {
              result?: {
                meta?: {
                  regularMarketPrice?: number;
                };
              }[];
            };
          }
          const data = (await yahooResponse.json()) as YahooFinanceChart;
          const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (price && typeof price === "number") {
            prices[symbol] = price;
            continue;
          }
        }
      } catch (error) {
        console.error(`Failed to fetch price for ${symbol}:`, error);
        // Continue to next symbol
      }

      // Add small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return create(GetCurrentPricesResponseSchema, { prices });
  },

  async deletePrediction(
    req: DeletePredictionRequest,
    context: HandlerContext
  ): Promise<DeletePredictionResponse> {
    try {
      const userId = getCurrentUserId(context);

      // Check if prediction exists and validate ownership
      const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
        | PredictionRow
        | undefined;
      if (!row) {
        throw new ConnectError(`Prediction not found: ${req.id}`, Code.NotFound);
      }

      if (userId !== row.user_id) {
        throw new ConnectError(
          "Access denied: You can only delete your own predictions",
          Code.PermissionDenied
        );
      }

      // Delete the prediction
      await db.run("DELETE FROM predictions WHERE id = ?", [req.id]);
      console.log(`🗑️ Prediction deleted: ${req.id} (${row.symbol})`);
      return create(DeletePredictionResponseSchema, { success: true });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        console.error("❌ ConnectError in deletePrediction:", {
          code: error.code,
          message: error.message,
          predictionId: req.id,
        });
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error deleting prediction:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        predictionId: req.id,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },

  async copyPrediction(
    req: CopyPredictionRequest,
    context: HandlerContext
  ): Promise<CopyPredictionResponse> {
    try {
      const currentUserId = getCurrentUserId(context);

      if (!currentUserId) {
        throw new ConnectError("Authentication required to copy predictions", Code.Unauthenticated);
      }

      if (!req.predictionId) {
        throw new ConnectError("Prediction ID is required", Code.InvalidArgument);
      }

      if (!req.strategyId) {
        throw new ConnectError("Target strategy ID is required", Code.InvalidArgument);
      }

      // Get the original prediction
      const originalRow = (await db.get("SELECT * FROM predictions WHERE id = ?", [
        req.predictionId,
      ])) as PredictionRow | undefined;

      if (!originalRow) {
        throw new ConnectError(`Prediction not found: ${req.predictionId}`, Code.NotFound);
      }

      // Check if prediction is public or user owns it
      const isPublic = originalRow.privacy === "PREDICTION_PRIVACY_PUBLIC";
      const isOwner = originalRow.user_id === currentUserId;

      if (!isPublic && !isOwner) {
        throw new ConnectError(
          "Cannot copy private prediction you don't own",
          Code.PermissionDenied
        );
      }

      // Get and validate target strategy
      const targetStrategyRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.strategyId,
      ])) as StrategyRow | undefined;

      if (!targetStrategyRow) {
        throw new ConnectError(`Target strategy not found: ${req.strategyId}`, Code.NotFound);
      }

      // User must own the target strategy
      if (targetStrategyRow.user_id !== currentUserId) {
        throw new ConnectError(
          "Access denied: You can only copy predictions to your own strategies",
          Code.PermissionDenied
        );
      }

      // Create a copy with new ID and target strategy
      const newId = randomUUID();
      const now = new Date().toISOString();

      // Recalculate evaluation date if time horizon exists
      let evaluationDate: string | null = null;
      if (originalRow.time_horizon_days) {
        const evalDate = new Date();
        evalDate.setDate(evalDate.getDate() + originalRow.time_horizon_days);
        evaluationDate = evalDate.toISOString().split("T")[0];
      }

      // Insert copied prediction - reset status to ACTIVE, action to pending
      await db.run(
        `
        INSERT INTO predictions (
          id, strategy_id, symbol, entry_price, allocated_amount, time_horizon_days,
          evaluation_date, target_return_pct, target_price, stop_loss_pct,
          stop_loss_price, stop_loss_dollar_impact, risk_level, technical_analysis,
          sentiment_score, overall_score, action, status, current_price, current_return_pct,
          closed_at, closed_reason, created_at, source, user_id, privacy
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          newId,
          req.strategyId, // New strategy_id
          originalRow.symbol,
          originalRow.entry_price,
          originalRow.allocated_amount,
          originalRow.time_horizon_days,
          evaluationDate,
          originalRow.target_return_pct,
          originalRow.target_price,
          originalRow.stop_loss_pct,
          originalRow.stop_loss_price,
          originalRow.stop_loss_dollar_impact,
          originalRow.risk_level,
          originalRow.technical_analysis || "",
          originalRow.sentiment_score,
          originalRow.overall_score,
          "pending", // Reset to pending
          "PREDICTION_STATUS_ACTIVE", // Reset to active
          null, // Reset current_price
          null, // Reset current_return_pct
          null, // Reset closed_at
          null, // Reset closed_reason
          now, // New created_at
          originalRow.source,
          currentUserId, // Owned by the user copying it
          "PREDICTION_PRIVACY_PRIVATE", // Copied predictions are private by default
        ]
      );

      // Fetch the created prediction
      const newRow = (await db.get("SELECT * FROM predictions WHERE id = ?", [newId])) as
        | PredictionRow
        | undefined;

      if (!newRow) {
        throw new ConnectError(`Failed to fetch copied prediction: ${newId}`, Code.Internal);
      }

      // Convert to proto
      const copiedPrediction = await dbRowToProtoPrediction(newRow);

      console.log(`✅ Prediction copied successfully: ${originalRow.id} -> ${newId}`);

      return create(CopyPredictionResponseSchema, {
        prediction: copiedPrediction,
      });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        console.error("❌ ConnectError in copyPrediction:", {
          code: error.code,
          message: error.message,
          predictionId: req.predictionId,
          strategyId: req.strategyId,
        });
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error copying prediction:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        predictionId: req.predictionId,
        strategyId: req.strategyId,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },
};
