import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type PredictionRow, type StrategyRow, db } from "../../db.js";
import {
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
  PredictionStatus,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../authHelpers.js";
import { dbRowToProtoPrediction } from "./predictionHelpers.js";

export async function listPredictions(
  req: ListPredictionsRequest,
  context: HandlerContext
): Promise<ListPredictionsResponse> {
  try {
    const userId = getCurrentUserId(context);

    // Get strategy to validate ownership
    const strategyRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.strategyId])) as
      | StrategyRow
      | undefined;

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
}

export async function getPrediction(
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
}

export async function getPredictionsBySymbol(
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
}

export async function getPublicPredictions(
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
}
