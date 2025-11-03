import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyModelPromptRow, type StrategyRow, db } from "../../../db.js";
import type {
  ListModelPromptsRequest,
  ListModelPromptsResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { ListModelPromptsResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";

export async function listModelPrompts(
  req: ListModelPromptsRequest,
  context: HandlerContext
): Promise<ListModelPromptsResponse> {
  try {
    const userId = getCurrentUserId(context);
    console.log(`📝 Listing model prompts for strategy:`, { strategyId: req.strategyId });

    // Get strategy to validate ownership/access
    const strategyRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.strategyId])) as
      | StrategyRow
      | undefined;

    if (!strategyRow) {
      throw new ConnectError(`Strategy not found: ${req.strategyId}`, Code.NotFound);
    }

    // Check access: owner or public
    const isOwner = userId && strategyRow.user_id === userId;
    const isPublic = strategyRow.privacy === "STRATEGY_PRIVACY_PUBLIC";

    if (!isOwner && !isPublic) {
      throw new ConnectError("Access denied: This strategy is private", Code.PermissionDenied);
    }

    // Get all prompts for this strategy
    const rows = (await db.all(
      "SELECT * FROM strategy_model_prompts WHERE strategy_id = ? ORDER BY model_name ASC",
      [req.strategyId]
    )) as StrategyModelPromptRow[];

    const prompts = rows.map((row) => ({
      id: row.id,
      strategyId: row.strategy_id,
      modelName: row.model_name,
      prompt: row.prompt,
      createdAt: timestampFromDate(new Date(row.created_at)),
      updatedAt: timestampFromDate(new Date(row.updated_at)),
    }));

    console.log(`✅ Found ${prompts.length} model prompts for strategy:`, {
      strategyId: req.strategyId,
    });
    return create(ListModelPromptsResponseSchema, { prompts });
  } catch (error) {
    if (error instanceof ConnectError) {
      throw error;
    }
    console.error("❌ Error in listModelPrompts:", {
      error: error instanceof Error ? error.message : String(error),
      strategyId: req.strategyId,
    });
    throw new ConnectError(
      error instanceof Error ? error.message : "Internal error",
      Code.Internal
    );
  }
}
