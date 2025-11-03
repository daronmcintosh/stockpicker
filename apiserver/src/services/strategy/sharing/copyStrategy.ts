import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../../db.js";
import type {
  CopyStrategyRequest,
  CopyStrategyResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { CopyStrategyResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId, getRawToken } from "../../authHelpers.js";
import { n8nClient } from "../../n8nClient.js";
import { dbRowToProtoStrategy } from "../strategyHelpers.js";
import { getTradesPerMonth, protoNameToFrequency } from "../strategyHelpers.js";

export async function copyStrategy(
  req: CopyStrategyRequest,
  context: HandlerContext
): Promise<CopyStrategyResponse> {
  try {
    const currentUserId = getCurrentUserId(context);

    if (!currentUserId) {
      throw new ConnectError("Authentication required to copy strategies", Code.Unauthenticated);
    }

    if (!req.strategyId) {
      throw new ConnectError("Strategy ID is required", Code.InvalidArgument);
    }

    // Get the original strategy
    const originalRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.strategyId])) as
      | StrategyRow
      | undefined;

    if (!originalRow) {
      throw new ConnectError(`Strategy not found: ${req.strategyId}`, Code.NotFound);
    }

    // Check if strategy is public or user owns it
    const isPublic = originalRow.privacy === "STRATEGY_PRIVACY_PUBLIC";
    const isOwner = originalRow.user_id === currentUserId;

    if (!isPublic && !isOwner) {
      throw new ConnectError("Cannot copy private strategy you don't own", Code.PermissionDenied);
    }

    // Create a copy with new ID and name
    const newId = randomUUID();
    const newName = `${originalRow.name} (Copy)`;
    let workflowId: string | null = null;

    // Convert frequency string from database to Frequency enum
    const frequencyEnum = protoNameToFrequency(originalRow.frequency);

    // Create new n8n workflow
    try {
      // Extract user token from Authorization header for n8n workflow authentication
      const userToken = getRawToken(context);
      if (!userToken) {
        throw new ConnectError(
          "Authentication required: User token must be provided in Authorization header",
          Code.Unauthenticated
        );
      }

      const workflow = await n8nClient.createStrategyWorkflow(
        newId,
        newName,
        frequencyEnum,
        userToken
      );
      workflowId = workflow.id;
    } catch (error) {
      console.error("❌ Failed to create n8n workflow for copied strategy:", error);
      throw new Error(
        `Failed to create n8n workflow: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Insert copied strategy
    const now = new Date().toISOString();
    const tradesPerMonth = getTradesPerMonth(frequencyEnum);
    const perTradeBudget = Math.round((originalRow.monthly_budget / tradesPerMonth) * 100) / 100;
    const perStockAllocation = Math.round((perTradeBudget / 3) * 100) / 100;

    await db.run(
      `INSERT INTO strategies (
        id, name, description, custom_prompt, monthly_budget, current_month_spent,
        current_month_start, time_horizon, frequency, risk_level, status, privacy,
        n8n_workflow_id, user_id, trades_per_month, per_trade_budget, per_stock_allocation,
        unique_stocks_count, max_unique_stocks, target_return_pct, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId,
        newName,
        originalRow.description || "",
        originalRow.custom_prompt || "",
        originalRow.monthly_budget,
        0, // current_month_spent starts at 0
        now, // current_month_start reset
        originalRow.time_horizon || "3 months",
        originalRow.frequency,
        originalRow.risk_level,
        "STRATEGY_STATUS_PAUSED", // Copied strategies start as paused
        "STRATEGY_PRIVACY_PRIVATE", // Copied strategies are private by default
        workflowId, // n8n_workflow_id
        currentUserId, // Owned by the user copying it
        tradesPerMonth,
        perTradeBudget,
        perStockAllocation,
        0, // unique_stocks_count starts at 0
        originalRow.max_unique_stocks || 20,
        originalRow.target_return_pct || 10.0,
        now,
        now,
      ]
    );

    // Fetch the created strategy
    const newRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [newId])) as
      | StrategyRow
      | undefined;

    if (!newRow) {
      throw new ConnectError(`Failed to fetch copied strategy: ${newId}`, Code.Internal);
    }

    // Convert to proto
    const copiedStrategy = await dbRowToProtoStrategy(newRow);

    return create(CopyStrategyResponseSchema, {
      strategy: copiedStrategy,
    });
  } catch (error) {
    console.error("❌ Error copying strategy:", error);
    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(error instanceof Error ? error.message : String(error), Code.Internal);
  }
}
