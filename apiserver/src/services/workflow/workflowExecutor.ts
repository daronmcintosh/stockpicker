import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import type { Frequency } from "../../gen/stockpicker/v1/strategy_pb.js";
import type {
  PrepareDataForWorkflowRequest,
  PrepareDataForWorkflowResponse,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { PrepareDataForWorkflowRequestSchema } from "../../gen/stockpicker/v1/strategy_pb.js";
import { prepareDataForWorkflow } from "../strategy/workflowHandlers.js";
import { executeAIAnalysis } from "./aiAnalysis.js";
import { processWorkflowResults } from "./workflowProcessor.js";

/**
 * Execute a complete workflow for a strategy
 * This replaces the n8n workflow execution
 */
export async function executeStrategyWorkflow(
  context: HandlerContext,
  strategyId: string,
  frequency: Frequency
): Promise<void> {
  const executionId = randomUUID();
  console.log(`🚀 Starting workflow execution:`, {
    strategyId,
    frequency,
    executionId,
  });

  try {
    // Step 1: Prepare data (same as n8n workflow would call PrepareDataForWorkflow)
    const preparedData = await prepareWorkflowData(context, strategyId, executionId);

    // Step 2: Execute AI analysis (parallel agents)
    const aiResults = await executeAIAnalysis(preparedData, strategyId);

    // Step 3: Process results and create predictions
    await processWorkflowResults(context, strategyId, executionId, aiResults, preparedData);

    console.log(`✅ Workflow execution completed:`, {
      strategyId,
      executionId,
    });
  } catch (error) {
    console.error(`❌ Workflow execution failed:`, {
      strategyId,
      executionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Prepare workflow data (replaces n8n's "Get Prepared Data" step)
 */
async function prepareWorkflowData(
  context: HandlerContext,
  strategyId: string,
  executionId: string
): Promise<PrepareDataForWorkflowResponse> {
  // Set execution ID in header if needed
  context.requestHeader.set("x-execution-id", executionId);

  const request = create(PrepareDataForWorkflowRequestSchema, { id: strategyId });
  return await prepareDataForWorkflow(request, context);
}
