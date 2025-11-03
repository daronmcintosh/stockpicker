import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { appConfig } from "../../config.js";
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
import { getCurrentUserId, getRawToken } from "../authHelpers.js";
import { n8nClient } from "../n8nClient.js";
import { dbRowToProtoStrategy, protoNameToFrequency } from "./strategyHelpers.js";
import { ensureWorkflowExists } from "./workflowSync.js";

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

    // Extract user token from Authorization header for n8n workflow authentication
    const userToken = getRawToken(context);
    if (!userToken) {
      throw new ConnectError(
        "Authentication required: User token must be provided in Authorization header",
        Code.Unauthenticated
      );
    }

    // Ensure workflow exists and credential is created/updated
    let workflowId = await ensureWorkflowExists(row, userToken);

    // Rebuild workflow from latest template to propagate code changes (enum updates, etc.)
    if (row.n8n_workflow_id) {
      try {
        const frequency = protoNameToFrequency(row.frequency);
        console.log(`🔄 Rebuilding workflow from latest template when starting strategy:`, {
          strategyId: req.id,
          workflowId: row.n8n_workflow_id,
        });
        const rebuiltWorkflow = await n8nClient.rebuildWorkflowFromTemplate(
          row.n8n_workflow_id,
          req.id,
          row.name,
          frequency,
          userToken
        );
        workflowId = rebuiltWorkflow.id;

        // Update database with new workflow ID if it changed
        if (workflowId !== row.n8n_workflow_id) {
          await db.run("UPDATE strategies SET n8n_workflow_id = ?, updated_at = ? WHERE id = ?", [
            workflowId,
            new Date().toISOString(),
            req.id,
          ]);
          console.log(`✅ Updated workflow ID in database:`, {
            strategyId: req.id,
            oldWorkflowId: row.n8n_workflow_id,
            newWorkflowId: workflowId,
          });
        }
      } catch (rebuildError) {
        console.warn(`⚠️ Failed to rebuild workflow, continuing with existing workflow:`, {
          strategyId: req.id,
          error: rebuildError instanceof Error ? rebuildError.message : String(rebuildError),
        });
        // Continue with existing workflow - don't fail strategy start
      }
    }

    // Use transaction: DB update and workflow activation must both succeed
    try {
      await db.run("BEGIN TRANSACTION");

      // Step 1: Update database
      await db.run(
        "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
        ["STRATEGY_STATUS_ACTIVE", now, now, req.id]
      );
      console.log(`✅ Strategy database updated to ACTIVE`);

      // Step 2: Activate n8n workflow (must succeed or rollback)
      console.log(`▶️ Activating n8n workflow for strategy:`, {
        strategyId: req.id,
        workflowId,
      });
      await n8nClient.activateWorkflow(workflowId);

      // Verify workflow is actually active
      const workflow = await n8nClient.getWorkflow(workflowId);
      if (!workflow.active) {
        throw new ConnectError(
          "Workflow activation reported success but workflow is still inactive",
          Code.Internal
        );
      }

      console.log(`✅ n8n workflow activated successfully and verified:`, {
        strategyId: req.id,
        workflowId,
        workflowActive: workflow.active,
      });

      // Commit transaction if all operations succeeded
      await db.run("COMMIT");
      console.log(`✅ Strategy start transaction committed`);
    } catch (error) {
      // Rollback database changes if workflow activation failed
      console.error(`❌ Error during strategy start, rolling back:`, {
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

      // Step 2: Deactivate n8n workflow if it exists (must succeed or rollback)
      if (row.n8n_workflow_id) {
        console.log(`⏸️ Deactivating n8n workflow for strategy:`, {
          strategyId: req.id,
          workflowId: row.n8n_workflow_id,
        });
        await n8nClient.deactivateWorkflow(row.n8n_workflow_id);

        // Verify workflow is actually inactive
        const workflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
        if (workflow.active) {
          console.error("⚠️ Workflow deactivation reported success but workflow is still active:", {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
          // Retry deactivation once
          await n8nClient.deactivateWorkflow(row.n8n_workflow_id);
          const retryWorkflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
          if (retryWorkflow.active) {
            throw new ConnectError("Workflow still active after retry", Code.Internal);
          }
        }

        console.log(`✅ n8n workflow deactivated successfully and verified:`, {
          strategyId: req.id,
          workflowId: row.n8n_workflow_id,
          workflowActive: workflow.active,
        });
      } else {
        console.log(`ℹ️ No n8n workflow found for strategy:`, { strategyId: req.id });
      }

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

      // Step 2: Deactivate n8n workflow if it exists (must succeed or rollback)
      if (row.n8n_workflow_id) {
        console.log(`⏸️ Deactivating n8n workflow for stopped strategy:`, {
          strategyId: req.id,
          workflowId: row.n8n_workflow_id,
        });
        await n8nClient.deactivateWorkflow(row.n8n_workflow_id);

        // Verify workflow is actually inactive
        const workflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
        if (workflow.active) {
          console.error("⚠️ Workflow deactivation reported success but workflow is still active:", {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
          // Retry deactivation once
          await n8nClient.deactivateWorkflow(row.n8n_workflow_id);
          const retryWorkflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
          if (retryWorkflow.active) {
            throw new ConnectError("Workflow still active after retry", Code.Internal);
          }
        }

        console.log(`✅ n8n workflow deactivated successfully and verified:`, {
          strategyId: req.id,
          workflowId: row.n8n_workflow_id,
          workflowActive: workflow.active,
        });
      } else {
        console.log(`ℹ️ No n8n workflow found for strategy:`, { strategyId: req.id });
      }

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

    // Extract user token from Authorization header for n8n workflow authentication
    const userToken = getRawToken(context);
    if (!userToken) {
      throw new ConnectError(
        "Authentication required: User token must be provided in Authorization header",
        Code.Unauthenticated
      );
    }

    // Ensure workflow exists and credential is created/updated
    let workflowId = await ensureWorkflowExists(row, userToken);

    // Check for template changes on each prediction trigger
    // This ensures template code updates (bug fixes, improvements) propagate to workflows
    // Diff detection in rebuildWorkflowFromTemplate prevents unnecessary updates
    if (row.n8n_workflow_id) {
      try {
        const frequency = protoNameToFrequency(row.frequency);
        const rebuiltWorkflow = await n8nClient.rebuildWorkflowFromTemplate(
          row.n8n_workflow_id,
          req.id,
          row.name,
          frequency,
          userToken
        );
        workflowId = rebuiltWorkflow.id;

        // Update database with new workflow ID if it changed (shouldn't happen anymore, but keep for safety)
        if (workflowId !== row.n8n_workflow_id) {
          await db.run("UPDATE strategies SET n8n_workflow_id = ?, updated_at = ? WHERE id = ?", [
            workflowId,
            new Date().toISOString(),
            req.id,
          ]);
        }
      } catch (rebuildError) {
        console.warn(`⚠️ Failed to rebuild workflow, continuing with existing workflow:`, {
          strategyId: req.id,
          error: rebuildError instanceof Error ? rebuildError.message : String(rebuildError),
        });
        // Continue with existing workflow - don't fail prediction trigger
      }
    }

    // Trigger the workflow via webhook
    // Use webhook URL from environment variable (N8N_WEBHOOK_URL)
    const webhookUrl = appConfig.n8n.webhookUrl;

    if (!webhookUrl) {
      throw new ConnectError(
        `Webhook URL not configured. Please set N8N_WEBHOOK_URL environment variable.`,
        Code.FailedPrecondition
      );
    }

    // Verify workflow is active (webhooks only work for active workflows)
    const workflow = await n8nClient.getWorkflow(workflowId);
    if (!workflow.active) {
      throw new ConnectError(
        `Workflow ${workflowId} is not active. Webhooks only work for active workflows.`,
        Code.FailedPrecondition
      );
    }

    console.log(`▶️ Triggering workflow via webhook:`, {
      strategyId: req.id,
      workflowId,
      webhookUrl,
      workflowActive: workflow.active,
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ triggered: true }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Webhook trigger failed: HTTP ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    console.log(`✅ Predictions triggered successfully:`, {
      strategyId: req.id,
      workflowId,
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
