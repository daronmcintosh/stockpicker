import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../../db.js";
import { StrategyStatus } from "../../../gen/stockpicker/v1/strategy_pb.js";
import type {
  DeleteStrategyRequest,
  DeleteStrategyResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { DeleteStrategyResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { n8nClient } from "../../n8nClient.js";
import { protoNameToStrategyStatus } from "../strategyHelpers.js";

export async function deleteStrategy(
  req: DeleteStrategyRequest,
  context: HandlerContext
): Promise<DeleteStrategyResponse> {
  try {
    const userId = getCurrentUserId(context);

    // Check if strategy exists and is stopped
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }

    // Check ownership
    if (userId !== row.user_id) {
      throw new ConnectError(
        "Access denied: You can only delete your own strategies",
        Code.PermissionDenied
      );
    }

    const status = protoNameToStrategyStatus(row.status);
    if (status !== StrategyStatus.STOPPED) {
      throw new ConnectError(
        `Strategy must be stopped before deletion. Current status: ${row.status}`,
        Code.FailedPrecondition
      );
    }

    // Step 1: Delete n8n workflow first (must succeed before deleting strategy)
    if (row.n8n_workflow_id) {
      console.log(`🗑️ Deleting n8n workflow for strategy:`, {
        strategyId: req.id,
        workflowId: row.n8n_workflow_id,
      });
      await n8nClient.deleteWorkflow(row.n8n_workflow_id);
      console.log(`✅ n8n workflow deleted successfully:`, {
        strategyId: req.id,
        workflowId: row.n8n_workflow_id,
      });
    } else {
      console.log(`ℹ️ No n8n workflow to delete for strategy:`, { strategyId: req.id });
    }

    // Step 2: Delete strategy from database (only if workflow deletion succeeded)
    await db.run("DELETE FROM strategies WHERE id = ?", [req.id]);
    console.log("✅ Strategy deleted:", req.id);
    return create(DeleteStrategyResponseSchema, { success: true });
  } catch (error) {
    console.error("❌ Error deleting strategy:", error);
    throw error;
  }
}
