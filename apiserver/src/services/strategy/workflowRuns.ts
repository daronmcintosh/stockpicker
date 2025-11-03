import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../db.js";
import type {
  GetWorkflowRunRequest,
  GetWorkflowRunResponse,
  ListWorkflowRunsRequest,
  ListWorkflowRunsResponse,
  WorkflowRun,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import {
  GetWorkflowRunResponseSchema,
  ListWorkflowRunsResponseSchema,
  WorkflowRunSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";

interface WorkflowRunRow {
  id: string;
  strategy_id: string;
  execution_id: string | null;
  input_data: string | null;
  ai_analysis: string | null;
  json_output: string | null;
  markdown_output: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * List workflow runs for a strategy
 */
export async function listWorkflowRuns(
  req: ListWorkflowRunsRequest,
  _context: HandlerContext
): Promise<ListWorkflowRunsResponse> {
  try {
    const strategyId = req.strategyId;
    const limit = req.limit || 50;
    const offset = req.offset || 0;

    // Verify strategy exists
    const strategyRow = (await db.get("SELECT id FROM strategies WHERE id = ?", [strategyId])) as
      | StrategyRow
      | undefined;

    if (!strategyRow) {
      throw new ConnectError(`Strategy not found: ${strategyId}`, Code.NotFound);
    }

    // Get total count
    const totalRow = (await db.get(
      "SELECT COUNT(*) as count FROM workflow_runs WHERE strategy_id = ?",
      [strategyId]
    )) as { count: number } | undefined;

    const total = totalRow?.count || 0;

    // Get workflow runs
    const rows = (await db.all(
      `SELECT * FROM workflow_runs 
       WHERE strategy_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [strategyId, limit, offset]
    )) as WorkflowRunRow[];

    const workflowRuns = rows.map((row) => {
      const createdAt = row.created_at
        ? { seconds: BigInt(Math.floor(new Date(row.created_at).getTime() / 1000)), nanos: 0 }
        : { seconds: BigInt(0), nanos: 0 };
      const updatedAt = row.updated_at
        ? { seconds: BigInt(Math.floor(new Date(row.updated_at).getTime() / 1000)), nanos: 0 }
        : { seconds: BigInt(0), nanos: 0 };

      return create(WorkflowRunSchema, {
        id: row.id,
        strategyId: row.strategy_id,
        executionId: row.execution_id || undefined,
        inputData: row.input_data || undefined,
        aiAnalysis: row.ai_analysis || undefined,
        jsonOutput: row.json_output ?? undefined,
        markdownOutput: row.markdown_output ?? undefined,
        status: row.status,
        errorMessage: row.error_message ?? undefined,
        createdAt,
        updatedAt,
      });
    });

    return create(ListWorkflowRunsResponseSchema, {
      workflowRuns,
      total,
    });
  } catch (error) {
    console.error("❌ Error in listWorkflowRuns:", error);
    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(
      error instanceof Error ? error.message : "Internal server error",
      Code.Internal
    );
  }
}

/**
 * Get a specific workflow run by ID
 */
export async function getWorkflowRun(
  req: GetWorkflowRunRequest,
  _context: HandlerContext
): Promise<GetWorkflowRunResponse> {
  try {
    const workflowRunId = req.id;

    const row = (await db.get("SELECT * FROM workflow_runs WHERE id = ?", [workflowRunId])) as
      | WorkflowRunRow
      | undefined;

    if (!row) {
      throw new ConnectError(`Workflow run not found: ${workflowRunId}`, Code.NotFound);
    }

    const createdAt = row.created_at
      ? { seconds: BigInt(Math.floor(new Date(row.created_at).getTime() / 1000)), nanos: 0 }
      : { seconds: BigInt(0), nanos: 0 };
    const updatedAt = row.updated_at
      ? { seconds: BigInt(Math.floor(new Date(row.updated_at).getTime() / 1000)), nanos: 0 }
      : { seconds: BigInt(0), nanos: 0 };

    const workflowRun = create(WorkflowRunSchema, {
      id: row.id,
      strategyId: row.strategy_id,
      executionId: row.execution_id || undefined,
      inputData: row.input_data || undefined,
      aiAnalysis: row.ai_analysis || undefined,
      jsonOutput: row.json_output ?? undefined,
      markdownOutput: row.markdown_output ?? undefined,
      status: row.status,
      errorMessage: row.error_message ?? undefined,
      createdAt,
      updatedAt,
    });

    return create(GetWorkflowRunResponseSchema, {
      workflowRun,
    });
  } catch (error) {
    console.error("❌ Error in getWorkflowRun:", error);
    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(
      error instanceof Error ? error.message : "Internal server error",
      Code.Internal
    );
  }
}
