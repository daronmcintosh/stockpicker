import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../../db.js";
import type {
  UpdateStrategyRequest,
  UpdateStrategyResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { UpdateStrategyResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId, getRawToken } from "../../authHelpers.js";
import { n8nClient } from "../../n8nClient.js";
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
      hasWorkflow: !!existingRow.n8n_workflow_id,
      workflowId: existingRow.n8n_workflow_id,
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

      // Step 2: Update n8n workflow if name changed (must succeed or rollback DB)
      if (nameChanged && existingRow.n8n_workflow_id) {
        console.log(`🔄 Updating n8n workflow name:`, {
          strategyId: req.id,
          workflowId: existingRow.n8n_workflow_id,
          oldName,
          newName: req.name,
        });

        const frequency = protoNameToFrequency(existingRow.frequency);
        if (req.name) {
          // Extract user token from Authorization header for workflow update
          const userToken = getRawToken(context);
          if (userToken) {
            // Rebuild workflow from latest template to propagate code changes
            try {
              console.log(`🔄 Rebuilding workflow from latest template when updating strategy:`, {
                strategyId: req.id,
                workflowId: existingRow.n8n_workflow_id,
              });
              const rebuiltWorkflow = await n8nClient.rebuildWorkflowFromTemplate(
                existingRow.n8n_workflow_id,
                req.id,
                req.name,
                frequency,
                userToken
              );

              // Update database with new workflow ID if it changed
              if (rebuiltWorkflow.id !== existingRow.n8n_workflow_id) {
                await db.run(
                  "UPDATE strategies SET n8n_workflow_id = ?, updated_at = ? WHERE id = ?",
                  [rebuiltWorkflow.id, new Date().toISOString(), req.id]
                );
                console.log(`✅ Updated workflow ID in database:`, {
                  strategyId: req.id,
                  oldWorkflowId: existingRow.n8n_workflow_id,
                  newWorkflowId: rebuiltWorkflow.id,
                });
              }
            } catch (rebuildError) {
              console.warn(`⚠️ Failed to rebuild workflow, falling back to name-only update:`, {
                strategyId: req.id,
                error: rebuildError instanceof Error ? rebuildError.message : String(rebuildError),
              });
              // Fall back to simple name update
              await n8nClient.updateStrategyWorkflow(
                existingRow.n8n_workflow_id,
                req.id,
                req.name,
                frequency,
                userToken
              );
            }
          } else {
            console.warn(`⚠️ No user token available for workflow update, skipping`);
          }
        }

        console.log(`✅ n8n workflow name updated successfully:`, {
          strategyId: req.id,
          oldName,
          newName: req.name,
          workflowId: existingRow.n8n_workflow_id,
        });
      } else {
        if (!nameChanged) {
          console.log(`ℹ️ Strategy name unchanged, skipping workflow update`);
        }
        if (!existingRow.n8n_workflow_id) {
          console.log(`ℹ️ Strategy has no workflow ID, skipping workflow update`);
        }
      }

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
