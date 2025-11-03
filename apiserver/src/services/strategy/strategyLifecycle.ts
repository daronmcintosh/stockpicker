import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../db.js";
import {
  type PauseStrategyRequest,
  type PauseStrategyResponse,
  PauseStrategyResponseSchema,
  type StartStrategyRequest,
  type StartStrategyResponse,
  StartStrategyResponseSchema,
  type StopStrategyRequest,
  type StopStrategyResponse,
  StopStrategyResponseSchema,
  type TriggerPredictionsRequest,
  type TriggerPredictionsResponse,
  TriggerPredictionsResponseSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../authHelpers.js";
import { schedulerService } from "../scheduler/schedulerService.js";
import { executeStrategyWorkflow } from "../workflow/workflowExecutor.js";
import { dbRowToProtoStrategy, protoNameToFrequency } from "./strategyHelpers.js";

export async function startStrategy(
  req: StartStrategyRequest,
  context: HandlerContext
): Promise<StartStrategyResponse> {
  try {
    const userId = getCurrentUserId(context);
    console.log("▶️ Starting strategy:", req.id, "userId:", userId);
    const now = new Date().toISOString();

    // Use direct query instead of prepared statement
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }

    // Check ownership
    if (userId !== row.user_id) {
      throw new ConnectError(
        "Access denied: You can only start your own strategies",
        Code.PermissionDenied
      );
    }

    // Get frequency for scheduling
    const frequency = protoNameToFrequency(row.frequency);

    // Use transaction: DB update and scheduler setup must both succeed
    try {
      await db.run("BEGIN TRANSACTION");

      // Step 1: Update database
      await db.run(
        "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
        ["STRATEGY_STATUS_ACTIVE", now, now, req.id]
      );
      console.log(`✅ Strategy database updated to ACTIVE`);

      // Step 2: Schedule workflow job
      console.log(`▶️ Scheduling workflow job for strategy:`, {
        strategyId: req.id,
        frequency,
      });

      schedulerService.scheduleStrategy(req.id, frequency, async () => {
        await executeStrategyWorkflow(context, req.id, frequency);
      });

      // Start the scheduled job
      schedulerService.startStrategy(req.id);

      console.log(`✅ Workflow scheduled and started successfully:`, {
        strategyId: req.id,
        frequency,
      });

      // Commit transaction if all operations succeeded
      await db.run("COMMIT");
      console.log(`✅ Strategy start transaction committed`);
    } catch (error) {
      // Rollback database changes if scheduler setup failed
      console.error(`❌ Error during strategy start, rolling back:`, {
        strategyId: req.id,
        error: error instanceof Error ? error.message : String(error),
      });

      // Stop any scheduled job that was created
      schedulerService.stopStrategy(req.id);

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
        `Failed to start strategy: ${error instanceof Error ? error.message : String(error)}`,
        Code.Internal
      );
    }

    // Use direct query instead of prepared statement
    const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
      req.id,
    ])) as StrategyRow;
    const strategy = await dbRowToProtoStrategy(updatedRow);
    console.log("✅ Strategy started:", req.id);
    return create(StartStrategyResponseSchema, { strategy });
  } catch (error) {
    console.error("❌ Error starting strategy:", error);
    throw error;
  }
}

export async function pauseStrategy(
  req: PauseStrategyRequest,
  context: HandlerContext
): Promise<PauseStrategyResponse> {
  try {
    const userId = getCurrentUserId(context);
    console.log("⏸️ Pausing strategy:", req.id, "userId:", userId);
    const now = new Date().toISOString();

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }

    // Check ownership
    if (userId !== row.user_id) {
      throw new ConnectError(
        "Access denied: You can only pause your own strategies",
        Code.PermissionDenied
      );
    }

    // Use transaction: DB update and workflow deactivation must both succeed
    try {
      await db.run("BEGIN TRANSACTION");

      // Step 1: Update database
      await db.run(
        "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
        ["STRATEGY_STATUS_PAUSED", null, now, req.id]
      );
      console.log(`✅ Strategy database updated to PAUSED`);

      // Step 2: Stop scheduled workflow job
      schedulerService.stopStrategy(req.id);
      console.log(`✅ Workflow job stopped for strategy:`, { strategyId: req.id });

      // Commit transaction if all operations succeeded
      await db.run("COMMIT");
      console.log(`✅ Strategy pause transaction committed`);
    } catch (error) {
      // Rollback database changes if workflow deactivation failed
      console.error(`❌ Error during strategy pause, rolling back:`, {
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
        `Failed to pause strategy: ${error instanceof Error ? error.message : String(error)}`,
        Code.Internal
      );
    }

    const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
      req.id,
    ])) as StrategyRow;
    const strategy = await dbRowToProtoStrategy(updatedRow);
    console.log("✅ Strategy paused:", req.id);
    return create(PauseStrategyResponseSchema, { strategy });
  } catch (error) {
    console.error("❌ Error pausing strategy:", error);
    throw error;
  }
}

export async function stopStrategy(
  req: StopStrategyRequest,
  context: HandlerContext
): Promise<StopStrategyResponse> {
  try {
    const userId = getCurrentUserId(context);
    console.log("⏹️ Stopping strategy:", req.id, "userId:", userId);
    const now = new Date().toISOString();

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
    }

    // Check ownership
    if (userId !== row.user_id) {
      throw new ConnectError(
        "Access denied: You can only stop your own strategies",
        Code.PermissionDenied
      );
    }

    // Use transaction: DB update and workflow deactivation must both succeed
    try {
      await db.run("BEGIN TRANSACTION");

      // Step 1: Update database
      await db.run(
        "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
        ["STRATEGY_STATUS_STOPPED", null, now, req.id]
      );
      console.log(`✅ Strategy database updated to STOPPED`);

      // Step 2: Stop scheduled workflow job
      schedulerService.stopStrategy(req.id);
      console.log(`✅ Workflow job stopped for strategy:`, { strategyId: req.id });

      // Commit transaction if all operations succeeded
      await db.run("COMMIT");
      console.log(`✅ Strategy stop transaction committed`);
    } catch (error) {
      // Rollback database changes if workflow deactivation failed
      console.error(`❌ Error during strategy stop, rolling back:`, {
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
        `Failed to stop strategy: ${error instanceof Error ? error.message : String(error)}`,
        Code.Internal
      );
    }

    const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
      req.id,
    ])) as StrategyRow;
    const strategy = await dbRowToProtoStrategy(updatedRow);
    console.log("✅ Strategy stopped:", req.id);
    return create(StopStrategyResponseSchema, { strategy });
  } catch (error) {
    console.error("❌ Error stopping strategy:", error);
    throw error;
  }
}

export async function triggerPredictions(
  req: TriggerPredictionsRequest,
  context: HandlerContext
): Promise<TriggerPredictionsResponse> {
  try {
    const userId = getCurrentUserId(context);
    console.log("🎯 Triggering predictions for strategy:", req.id, "userId:", userId);

    // Get strategy from database
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;

    if (!row) {
      throw new Error(`Strategy not found: ${req.id}`);
    }

    // Check ownership
    if (userId !== row.user_id) {
      throw new Error("Access denied: You can only trigger predictions for your own strategies");
    }

    // Validate strategy is active
    if (row.status !== "STRATEGY_STATUS_ACTIVE") {
      throw new Error(
        `Cannot trigger predictions for inactive strategy. Current status: ${row.status}`
      );
    }

    // Get frequency for workflow execution
    const frequency = protoNameToFrequency(row.frequency);

    // Execute workflow immediately (manual trigger)
    console.log(`▶️ Triggering workflow execution:`, {
      strategyId: req.id,
      frequency,
    });

    await executeStrategyWorkflow(context, req.id, frequency);

    console.log(`✅ Predictions triggered successfully:`, {
      strategyId: req.id,
    });

    return create(TriggerPredictionsResponseSchema, {
      success: true,
      message: "Prediction generation triggered successfully. Check back in a few moments.",
    });
  } catch (error) {
    console.error("❌ Error triggering predictions:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return create(TriggerPredictionsResponseSchema, {
      success: false,
      message: `Failed to trigger predictions: ${errorMessage}`,
    });
  }
}
