import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type PredictionRow, db } from "../../db.js";
import {
  type UpdatePredictionActionRequest,
  type UpdatePredictionActionResponse,
  UpdatePredictionActionResponseSchema,
  type UpdatePredictionPrivacyRequest,
  type UpdatePredictionPrivacyResponse,
  UpdatePredictionPrivacyResponseSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../authHelpers.js";
import {
  dbRowToProtoPrediction,
  mapEnumToAction,
  mapPredictionPrivacyToDb,
} from "./predictionHelpers.js";

export async function updatePredictionAction(
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
}

export async function updatePredictionPrivacy(
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
}
