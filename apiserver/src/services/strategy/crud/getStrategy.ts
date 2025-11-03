import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../../db.js";
import type {
  GetStrategyRequest,
  GetStrategyResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { GetStrategyResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { dbRowToProtoStrategy } from "../strategyHelpers.js";

export async function getStrategy(
  req: GetStrategyRequest,
  context: HandlerContext
): Promise<GetStrategyResponse> {
  try {
    console.log(`📖 Getting strategy:`, { strategyId: req.id });
    const userId = getCurrentUserId(context);
    console.log(`📖 User context:`, { userId, hasAuth: !!userId });

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      console.error(`❌ Strategy not found:`, { strategyId: req.id });
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }

    console.log(`📖 Strategy found:`, {
      strategyId: row.id,
      name: row.name,
      privacy: row.privacy,
      ownerId: row.user_id,
    });

    // Check access: owner or public
    const isOwner = userId && row.user_id === userId;
    const isPublic = row.privacy === "STRATEGY_PRIVACY_PUBLIC";

    console.log(`📖 Access check:`, {
      isOwner,
      isPublic,
      requestedBy: userId,
      ownerId: row.user_id,
    });

    if (!isOwner && !isPublic) {
      console.error(`❌ Access denied:`, {
        strategyId: req.id,
        requestedBy: userId,
        ownerId: row.user_id,
        privacy: row.privacy,
      });
      throw new ConnectError("Access denied: This strategy is private", Code.PermissionDenied);
    }

    console.log(`📖 Converting strategy to proto:`, { strategyId: row.id });
    const strategy = await dbRowToProtoStrategy(row);
    console.log(`✅ Strategy retrieved successfully:`, { strategyId: row.id });
    return create(GetStrategyResponseSchema, { strategy });
  } catch (error) {
    // If it's already a ConnectError, re-throw it
    if (error instanceof ConnectError) {
      console.error(`❌ ConnectError in getStrategy:`, {
        code: error.code,
        message: error.message,
        strategyId: req.id,
      });
      throw error;
    }
    // Convert other errors to ConnectError
    console.error("❌ Error in getStrategy:", {
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
