import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../../db.js";
import type {
  UpdateStrategyRequest,
  UpdateStrategyResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { UpdateStrategyResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import {
  dbRowToProtoStrategy,
  protoNameToFrequency,
  riskLevelToProtoName,
} from "../strategyHelpers.js";

export async function updateStrategy(
  req: UpdateStrategyRequest,
  context: HandlerContext
): Promise<UpdateStrategyResponse> {
  try {
    const userId = getCurrentUserId(context);

    // Check ownership
    const existingRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!existingRow) {
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }
    if (userId !== existingRow.user_id) {
      throw new ConnectError(
        "Access denied: You can only update your own strategies",
        Code.PermissionDenied
      );
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (req.name) {
      updates.push("name = ?");
      params.push(req.name);
    }
    if (req.description !== undefined) {
      updates.push("description = ?");
      params.push(req.description || "");
    }
    if (req.customPrompt) {
      updates.push("custom_prompt = ?");
      params.push(req.customPrompt);
    }
    if (req.timeHorizon) {
      updates.push("time_horizon = ?");
      params.push(req.timeHorizon);
    }
    if (req.targetReturnPct !== undefined) {
      updates.push("target_return_pct = ?");
      params.push(req.targetReturnPct);
    }
    if (req.riskLevel) {
      updates.push("risk_level = ?");
      params.push(riskLevelToProtoName(req.riskLevel));
    }
    if (req.maxUniqueStocks !== undefined) {
      updates.push("max_unique_stocks = ?");
      params.push(req.maxUniqueStocks);
    }

    // Handle source_config if provided
    const sourceConfig = (req as unknown as { sourceConfig?: string }).sourceConfig;
    if (sourceConfig !== undefined) {
      updates.push("source_config = ?");
      params.push(sourceConfig || "");
    }

    // Handle ai_agents if provided
    if (req.aiAgents !== undefined) {
      updates.push("ai_agents = ?");
      params.push(req.aiAgents || "");
    }

    // Track if name changed for workflow update
    const nameChanged = req.name && req.name !== existingRow.name;
    const oldName = existingRow.name;

    console.log(`🔍 Strategy update check:`, {
      strategyId: req.id,
      nameProvided: !!req.name,
      currentName: existingRow.name,
      newName: req.name,
      nameChanged,
    });

    // Use transaction to ensure atomicity: DB update and workflow update must both succeed
    try {
      await db.run("BEGIN TRANSACTION");

      // Step 1: Update database
      if (updates.length > 0) {
        updates.push("updated_at = ?");
        params.push(now);
        params.push(req.id); // for WHERE clause

        await db.run(`UPDATE strategies SET ${updates.join(", ")} WHERE id = ?`, params);
        console.log(`✅ Strategy database updated`);
      }

      // Note: Workflow scheduling is handled automatically when strategy is started/paused
      // No need to update workflow here - scheduler will use latest strategy data on execution

      // Commit transaction if all operations succeeded
      await db.run("COMMIT");
      console.log(`✅ Strategy update transaction committed`);
    } catch (error) {
      // Rollback database changes if workflow update failed
      console.error(`❌ Error during strategy update, rolling back:`, {
        strategyId: req.id,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await db.run("ROLLBACK");
        console.log(`🔄 Transaction rolled back`);
      } catch (rollbackError) {
        console.error(`❌ Failed to rollback transaction:`, rollbackError);
      }

      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        throw error;
      }
      throw new ConnectError(
        `Failed to update strategy: ${error instanceof Error ? error.message : String(error)}`,
        Code.Internal
      );
    }

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as StrategyRow;
    const strategy = await dbRowToProtoStrategy(row);
    return create(UpdateStrategyResponseSchema, { strategy });
  } catch (error) {
    // If it's already a ConnectError, re-throw it
    if (error instanceof ConnectError) {
      console.error("❌ ConnectError in updateStrategy:", {
        code: error.code,
        message: error.message,
        strategyId: req.id,
      });
      throw error;
    }
    // Convert other errors to ConnectError
    console.error("❌ Error in updateStrategy:", {
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
