import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import { Code, ConnectError } from "@connectrpc/connect";
import type { HandlerContext } from "@connectrpc/connect";
import { db } from "../../db.js";
import {
  type UpdateWorkflowRunStatusRequest,
  type UpdateWorkflowRunStatusResponse,
  UpdateWorkflowRunStatusResponseSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";

/**
 * Update workflow run status (Internal - called by workflow executor on error)
 * This allows the workflow to report failures at any step and update the status
 */
export async function updateWorkflowRunStatus(
  req: UpdateWorkflowRunStatusRequest,
  context: HandlerContext
): Promise<UpdateWorkflowRunStatusResponse> {
  try {
    const strategyId = req.strategyId;
    const executionId = context.requestHeader.get("x-execution-id") || req.executionId || null;
    const status = req.status; // 'failed' or 'completed'
    const errorMessage = req.errorMessage || null;

    if (!status || (status !== "failed" && status !== "completed")) {
      throw new ConnectError(
        `Invalid status: ${status}. Must be 'failed' or 'completed'`,
        Code.InvalidArgument
      );
    }

    // Find the workflow run by strategy_id and execution_id
    let workflowRunId: string | null = null;
    if (executionId) {
      const existingRun = (await db.get(
        "SELECT id FROM workflow_runs WHERE strategy_id = ? AND execution_id = ? AND status IN ('pending', 'running')",
        [strategyId, executionId]
      )) as { id: string } | undefined;

      if (existingRun) {
        workflowRunId = existingRun.id;
      }
    }

    // If no existing run found, try to find by strategy_id and status
    if (!workflowRunId) {
      const latestRun = (await db.get(
        "SELECT id FROM workflow_runs WHERE strategy_id = ? AND status IN ('pending', 'running') ORDER BY created_at DESC LIMIT 1",
        [strategyId]
      )) as { id: string } | undefined;

      if (latestRun) {
        workflowRunId = latestRun.id;
      }
    }

    if (workflowRunId) {
      // Update existing workflow run
      await db.run(
        `UPDATE workflow_runs
         SET status = ?,
             error_message = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        [status, errorMessage, workflowRunId]
      );
      console.log(`✅ Updated workflow run status:`, {
        workflowRunId,
        strategyId,
        executionId,
        status,
        errorMessage,
      });
    } else {
      // Create new workflow run if not found (fallback)
      workflowRunId = randomUUID();
      const inputData = JSON.stringify({
        strategy_id: strategyId,
        timestamp: new Date().toISOString(),
      });

      await db.run(
        `INSERT INTO workflow_runs (id, strategy_id, execution_id, input_data, status, error_message, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [workflowRunId, strategyId, executionId, inputData, status, errorMessage]
      );
      console.log(`✅ Created workflow run with status:`, {
        workflowRunId,
        strategyId,
        executionId,
        status,
        errorMessage,
      });
    }

    return create(UpdateWorkflowRunStatusResponseSchema, {
      success: true,
      workflowRunId,
    });
  } catch (error) {
    console.error("❌ Error in updateWorkflowRunStatus:", error);

    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(
      error instanceof Error ? error.message : "Internal server error",
      Code.Internal
    );
  }
}
