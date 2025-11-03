import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../db.js";
import {
  type UpdateStrategyPrivacyRequest,
  type UpdateStrategyPrivacyResponse,
  UpdateStrategyPrivacyResponseSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../authHelpers.js";
import { dbRowToProtoStrategy, mapPrivacyToDb } from "./strategyHelpers.js";

export async function updateStrategyPrivacy(
  req: UpdateStrategyPrivacyRequest,
  context: HandlerContext
): Promise<UpdateStrategyPrivacyResponse> {
  const userId = getCurrentUserId(context);

  // Check strategy exists and ownership
  const existingRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
    | StrategyRow
    | undefined;
  try {
    if (!existingRow) {
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }

    // Check ownership
    if (userId !== existingRow.user_id) {
      throw new ConnectError(
        "Access denied: You can only update privacy for your own strategies",
        Code.PermissionDenied
      );
    }

    const privacyStr = mapPrivacyToDb(req.privacy);
    await db.run("UPDATE strategies SET privacy = ?, updated_at = ? WHERE id = ?", [
      privacyStr,
      new Date().toISOString(),
      req.id,
    ]);

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }

    const strategy = await dbRowToProtoStrategy(row);
    return create(UpdateStrategyPrivacyResponseSchema, { strategy });
  } catch (error) {
    // If it's already a ConnectError, re-throw it
    if (error instanceof ConnectError) {
      throw error;
    }
    // Convert other errors to ConnectError
    console.error("❌ Error in updateStrategyPrivacy:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      strategyId: req.id,
    });
    throw new ConnectError(
      error instanceof Error ? error.message : "Internal error",
      Code.Internal
    );
  }
}
