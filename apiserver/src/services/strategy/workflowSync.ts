import { type StrategyRow, db } from "../../db.js";
import { n8nClient } from "../n8nClient.js";
import { frequencyToName, protoNameToFrequency } from "./strategyHelpers.js";

/**
 * Ensure a workflow exists for a strategy. Creates it if missing.
 * This handles cases where workflows were deleted or n8n instance was reset.
 * @param row - The strategy row from the database
 * @param userToken - JWT token for workflow authentication (optional for system operations)
 * @returns The workflow ID (existing or newly created)
 */
export async function ensureWorkflowExists(row: StrategyRow, userToken?: string): Promise<string> {
  const strategyId = row.id;
  const strategyName = row.name;
  const currentWorkflowId = row.n8n_workflow_id;
  const frequency = protoNameToFrequency(row.frequency);

  // If we have a workflow ID, check if it exists and update API URL if needed
  if (currentWorkflowId) {
    try {
      const workflow = await n8nClient.getWorkflow(currentWorkflowId);
      console.log(`✅ Workflow exists for strategy:`, {
        strategyId,
        workflowId: workflow.id,
        workflowName: workflow.name,
      });

      // Ensure credential exists/updates and workflow references it (even if workflow already exists)
      // Do this BEFORE updating API URL so credentials are preserved
      if (userToken) {
        try {
          const credentialName = `Strategy-${strategyId}-Auth`;
          const credentialId = await n8nClient.createOrUpdateCredential(credentialName, userToken);
          console.log(`✅ Credential ensured for strategy:`, {
            strategyId,
            credentialName,
            credentialId,
          });

          // Update the workflow to reference the credential
          // Get full workflow, inject credential reference, and update it
          // This ensures credentials are in place before API URL update
          try {
            const fullWorkflow = await n8nClient.getFullWorkflow(currentWorkflowId);
            await n8nClient.updateFullWorkflow(
              currentWorkflowId,
              fullWorkflow,
              userToken,
              strategyId
            );
            console.log(`✅ Workflow updated to reference credential:`, {
              strategyId,
              workflowId: currentWorkflowId,
              credentialId,
            });
          } catch (updateError) {
            console.warn(`⚠️ Failed to update workflow with credential reference:`, {
              strategyId,
              error: updateError instanceof Error ? updateError.message : String(updateError),
            });
            // Continue anyway - credential exists, workflow just needs manual update
          }
        } catch (credError) {
          console.warn(`⚠️ Failed to ensure credential for existing workflow:`, {
            strategyId,
            error: credError instanceof Error ? credError.message : String(credError),
          });
          // Don't fail the operation if credential update fails, but log it
        }
      }

      // Check and update API URL if it has changed (e.g., N8N_API_SERVER_URL was updated)
      // Pass userToken and strategyId to preserve credentials during URL update
      // This must succeed - if it fails, the operation should fail
      await n8nClient.updateWorkflowApiUrl(currentWorkflowId, userToken, strategyId);

      return workflow.id;
    } catch (error) {
      console.warn(`⚠️ Workflow ${currentWorkflowId} not found in n8n, will create new one:`, {
        strategyId,
        workflowId: currentWorkflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall through to create new workflow
    }
  }

  // Workflow doesn't exist or no workflow ID - create it
  console.log(`🔄 Creating missing workflow for strategy:`, {
    strategyId,
    strategyName,
    frequency: frequencyToName(frequency),
    previousWorkflowId: currentWorkflowId,
  });

  // Cannot create workflow without user token
  if (!userToken) {
    throw new Error(
      `Cannot create workflow without user token. Strategy: ${strategyId}. Workflow will be created when user performs an action requiring it.`
    );
  }

  try {
    const workflow = await n8nClient.createStrategyWorkflow(
      strategyId,
      strategyName,
      frequency,
      userToken
    );
    console.log(`✅ Created new workflow for strategy:`, {
      strategyId,
      workflowId: workflow.id,
      workflowName: workflow.name,
    });

    // Update the database with the new workflow ID
    // Use transaction to ensure atomicity: if DB update fails, cleanup the workflow
    try {
      await db.run("BEGIN TRANSACTION");

      await db.run("UPDATE strategies SET n8n_workflow_id = ?, updated_at = ? WHERE id = ?", [
        workflow.id,
        new Date().toISOString(),
        strategyId,
      ]);

      await db.run("COMMIT");
      console.log(`✅ Workflow ID updated in database:`, {
        strategyId,
        workflowId: workflow.id,
      });

      return workflow.id;
    } catch (dbError) {
      // Rollback on database error
      try {
        await db.run("ROLLBACK");
      } catch (rollbackError) {
        console.error("❌ Failed to rollback:", rollbackError);
      }

      // Clean up the created workflow if DB update failed
      try {
        console.log(`🧹 Cleaning up created workflow after DB update failure:`, {
          workflowId: workflow.id,
        });
        await n8nClient.deleteWorkflow(workflow.id);
        console.log(`✅ Workflow cleaned up successfully`);
      } catch (cleanupError) {
        console.error("⚠️ Failed to cleanup workflow after DB failure:", {
          workflowId: workflow.id,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      throw new Error(
        `Failed to update database with workflow ID: ${dbError instanceof Error ? dbError.message : String(dbError)}`
      );
    }
  } catch (error) {
    console.error(`❌ Failed to create workflow for strategy:`, {
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to create workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Sync all strategies with n8n workflows.
 * Checks each strategy and creates missing workflows.
 * This is useful after n8n instance restarts or when workflows are deleted.
 */
export async function syncStrategiesWithWorkflows(): Promise<void> {
  try {
    console.log("🔄 Syncing strategies with n8n workflows...");

    // Get all strategies from database
    const rows = (await db.all("SELECT * FROM strategies")) as StrategyRow[];
    console.log(`📋 Found ${rows.length} strategy(ies) to sync`);

    let synced = 0;
    let created = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const hadWorkflow = !!row.n8n_workflow_id;
        const workflowId = await ensureWorkflowExists(row);

        if (!hadWorkflow || workflowId !== row.n8n_workflow_id) {
          created++;
          console.log(`✅ Synced strategy "${row.name}":`, {
            strategyId: row.id,
            workflowId,
            created: !hadWorkflow,
            updated: hadWorkflow && workflowId !== row.n8n_workflow_id,
          });
        } else {
          synced++;
        }
      } catch (error) {
        errors++;
        console.error(`❌ Failed to sync strategy "${row.name}":`, {
          strategyId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log("📊 Strategy workflow sync summary:", {
      total: rows.length,
      alreadySynced: synced,
      created: created,
      errors: errors,
    });
  } catch (error) {
    console.error("❌ Failed to sync strategies with workflows:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
