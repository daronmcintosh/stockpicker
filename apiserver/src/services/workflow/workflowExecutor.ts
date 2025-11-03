import { randomUUID } from "node:crypto";
import type { Frequency } from "../../gen/stockpicker/v1/strategy_pb.js";
import type { PrepareDataForWorkflowResponse } from "../../gen/stockpicker/v1/strategy_pb.js";
import { prepareDataForWorkflow } from "../strategy/workflowHandlers.js";
import { executeAIAnalysis } from "./aiAnalysis.js";
import { processWorkflowResults } from "./workflowProcessor.js";

/**
 * Execute a complete workflow for a strategy
 * This replaces the n8n workflow execution
 */
export async function executeStrategyWorkflow(
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
    const preparedData = await prepareWorkflowData(strategyId, executionId);

    // Step 2: Execute AI analysis (parallel agents)
    const aiResults = await executeAIAnalysis(preparedData, strategyId);

    // Step 3: Process results and create predictions
    await processWorkflowResults(strategyId, executionId, aiResults, preparedData);

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
  strategyId: string,
  executionId: string
): Promise<PrepareDataForWorkflowResponse> {
  // Create a minimal HandlerContext for the internal call
  const context = {
    requestHeader: new Headers(),
    signal: new AbortController().signal,
  };

  // Set execution ID in header if needed
  context.requestHeader.set("x-execution-id", executionId);

  return await prepareDataForWorkflow({ id: strategyId }, context as any);
}

