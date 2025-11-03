import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type PredictionRow, type StrategyRow, db } from "../../db.js";
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
  PredictionSource,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../authHelpers.js";
import {
  calculateStopLossImpact,
  calculateStopLossPct,
  calculateTargetReturnPct,
  dbRowToProtoPrediction,
  mapSourceToDb,
  riskLevelToDbString,
} from "./predictionHelpers.js";

export async function createPrediction(
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
    const strategyRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.strategyId])) as
      | StrategyRow
      | undefined;

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
    const stopLossPct = req.stopLossPct ?? calculateStopLossPct(req.entryPrice, req.stopLossPrice);
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
}

export async function deletePrediction(
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
}

export async function copyPrediction(
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
      throw new ConnectError("Cannot copy private prediction you don't own", Code.PermissionDenied);
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
}
