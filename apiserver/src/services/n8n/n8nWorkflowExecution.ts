import type { N8nWorkflowResponse } from "../n8nTypes.js";
import type { RequestMethod } from "./n8nCredentials.js";
import { getFullWorkflow, getWorkflow } from "./n8nWorkflowCRUD.js";

/**
 * Manually execute a workflow (triggers the manual trigger node)
 * See: https://docs.n8n.io/api/
 *
 * Note: n8n workflow execution can be done via:
 * - POST /workflows/{id}/activate (to activate and run)
 * - POST /executions/workflow/{id} (alternative endpoint)
 * - Using webhook trigger (if configured)
 */
export async function executeWorkflow(
  request: RequestMethod,
  baseURL: string,
  workflowId: string
): Promise<void> {
  try {
    console.log(`▶️ Executing n8n workflow manually:`, { workflowId, baseURL });

    // First verify the workflow exists and get its details
    let workflow: N8nWorkflowResponse;
    try {
      workflow = await getWorkflow(request, workflowId);
      console.log(`✅ Workflow verified:`, {
        workflowId: workflow.id,
        name: workflow.name,
        active: workflow.active,
      });
    } catch (verifyError) {
      console.error(`❌ Workflow verification failed:`, {
        workflowId,
        error: verifyError instanceof Error ? verifyError.message : String(verifyError),
      });

      // List available workflows to help debug
      try {
        const { listWorkflows } = await import("./n8nWorkflowCRUD.js");
        const allWorkflows = await listWorkflows(request, true);
        console.log(`📋 Available workflows in n8n:`, {
          count: allWorkflows.length,
          workflowIds: allWorkflows.map((w) => ({ id: w.id, name: w.name })),
        });
      } catch (listError) {
        console.error(`⚠️ Could not list workflows:`, listError);
      }

      throw new Error(
        `Workflow ${workflowId} does not exist in n8n. It may have been deleted or the ID is incorrect. Check the logs above for available workflow IDs.`
      );
    }

    // Try the standard workflow execution endpoint
    // POST /workflows/{id}/run
    try {
      await request<void>("POST", `/workflows/${workflowId}/run`);
      console.log(`✅ n8n workflow execution triggered successfully:`, { workflowId });
      return;
    } catch (runError) {
      // If /run endpoint doesn't work, try alternative: activate workflow first
      if (runError instanceof Error && runError.message.includes("404")) {
        console.log(`⚠️ /run endpoint returned 404, trying alternative approach...`);

        // Try activating the workflow if it's not active
        if (!workflow.active) {
          console.log(`🔄 Activating workflow first...`);
          try {
            const { activateWorkflow } = await import("./n8nWorkflowCRUD.js");
            await activateWorkflow(request, workflowId);
            console.log(`✅ Workflow activated`);
          } catch (activateError) {
            console.error(`❌ Failed to activate workflow:`, activateError);
          }
        }

        // Try the executions endpoint instead
        try {
          console.log(`🔄 Trying executions endpoint...`);
          await request<void>("POST", `/executions/workflow/${workflowId}`);
          console.log(`✅ n8n workflow execution triggered via executions endpoint:`, {
            workflowId,
          });
          return;
        } catch (execError) {
          console.error(`❌ Executions endpoint also failed:`, execError);
          throw new Error(
            `Both execution endpoints failed. Original error: ${runError.message}. Alternative error: ${execError instanceof Error ? execError.message : String(execError)}`
          );
        }
      }
      throw runError;
    }
  } catch (error) {
    console.error(`❌ Error executing n8n workflow:`, {
      workflowId,
      baseURL,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to execute n8n workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Execute workflow with input data via webhook trigger
 * Gets the webhook URL for the workflow and POSTs the data to it
 */
export async function executeWorkflowWithData(
  request: RequestMethod,
  baseURL: string,
  workflowId: string,
  inputData: Record<string, unknown>
): Promise<string> {
  try {
    console.log(`▶️ Executing n8n workflow with data:`, {
      workflowId,
      dataKeys: Object.keys(inputData),
    });

    // Get the full workflow to find the webhook trigger node
    const workflow = await getFullWorkflow(request, workflowId);

    // Find the webhook trigger node
    const webhookNode = Array.isArray(workflow.nodes)
      ? workflow.nodes.find(
          (n) => n.type === "n8n-nodes-base.webhook" && n.name === "Webhook Trigger"
        )
      : null;

    if (!webhookNode || !webhookNode.webhookId) {
      throw new Error(`Workflow ${workflowId} does not have a webhook trigger node configured`);
    }

    // Construct webhook URL
    // n8n webhook URLs are: {baseURL}/webhook/{path}
    const webhookPath = (webhookNode.parameters?.path as string) || webhookNode.webhookId;
    const webhookUrl = `${baseURL}/webhook/${webhookPath}`;

    console.log(`📡 Triggering webhook:`, { webhookUrl, workflowId });

    // POST data to webhook (no auth needed for webhook)
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(inputData),
      signal: AbortSignal.timeout(60000), // 60 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Webhook trigger failed: HTTP ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    // Try to get execution ID from response
    let executionId: string | undefined;
    try {
      const result = (await response.json()) as { executionId?: string; id?: string };
      executionId = result?.executionId || result?.id;
    } catch {
      // Response might not be JSON, that's okay
    }

    console.log(`✅ Workflow webhook triggered successfully:`, {
      workflowId,
      webhookUrl,
      executionId,
    });

    return executionId || "";
  } catch (error) {
    console.error(`❌ Error executing workflow with data:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to execute workflow with data: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get workflow execution results
 * Returns the output data from the last execution
 */
export async function getWorkflowExecutionResults(
  request: RequestMethod,
  workflowId: string,
  executionId?: string
): Promise<Array<Record<string, unknown>>> {
  try {
    console.log(`🔍 Getting workflow execution results:`, { workflowId, executionId });

    let execution: unknown;
    if (executionId) {
      // Get specific execution
      execution = await request<unknown>("GET", `/executions/${executionId}`);
    } else {
      // Get latest execution for this workflow
      const executions = await request<{
        data: Array<{ id: string; workflowId: string; finished: boolean }>;
      }>("GET", `/executions?workflowId=${workflowId}&limit=1`);

      if (!executions.data || executions.data.length === 0) {
        throw new Error(`No executions found for workflow ${workflowId}`);
      }

      const latestExecution = executions.data[0];
      if (!latestExecution.finished) {
        throw new Error(
          `Latest execution ${latestExecution.id} is not finished yet. Please wait and try again.`
        );
      }

      execution = await request<unknown>("GET", `/executions/${latestExecution.id}`);
    }

    // Extract output data from execution
    // n8n execution structure: { data: { resultData: { runData: { nodeName: [{ data: { main: [[{ json: ... }]] } }] } } } } }
    const executionObj = execution as {
      data?: {
        resultData?: {
          runData?: Record<
            string,
            Array<{
              data?: {
                main?: Array<Array<{ json?: Record<string, unknown> }>>;
              };
            }>
          >;
        };
      };
    };

    // Find the "Output Recommendations" node (or last node)
    const runData = executionObj.data?.resultData?.runData;
    if (!runData) {
      throw new Error(`No execution data found in execution result`);
    }

    // Look for "Output Recommendations" node first, otherwise get last node
    let outputNodeName = "Output Recommendations";
    if (!runData[outputNodeName]) {
      // Get the last node that has output
      const nodeNames = Object.keys(runData);
      outputNodeName = nodeNames[nodeNames.length - 1] || nodeNames[0];
      console.log(`⚠️ Output Recommendations node not found, using: ${outputNodeName}`);
    }

    const nodeOutput = runData[outputNodeName];
    if (!nodeOutput || !nodeOutput[0]?.data?.main) {
      throw new Error(`No output data found from node ${outputNodeName}`);
    }

    // Extract recommendations from the output
    const mainOutput = nodeOutput[0].data.main[0];
    if (!mainOutput || !mainOutput[0]?.json) {
      throw new Error(`No JSON data found in output from node ${outputNodeName}`);
    }

    const outputJson = mainOutput[0].json;
    const recommendations =
      (outputJson.recommendations as Array<Record<string, unknown>>) ||
      (Array.isArray(outputJson) ? outputJson : [outputJson]);

    console.log(`✅ Retrieved workflow execution results:`, {
      workflowId,
      executionId,
      recommendationsCount: recommendations.length,
      outputNode: outputNodeName,
    });

    return recommendations;
  } catch (error) {
    console.error(`❌ Error getting workflow execution results:`, {
      workflowId,
      executionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to get workflow execution results: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Wait for workflow execution to complete and get results
 * Polls the execution status until finished, then returns results
 */
export async function waitForWorkflowExecution(
  request: RequestMethod,
  workflowId: string,
  executionId: string,
  maxWaitSeconds = 300,
  pollIntervalSeconds = 2
): Promise<Array<Record<string, unknown>>> {
  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;
  const pollIntervalMs = pollIntervalSeconds * 1000;

  console.log(`⏳ Waiting for workflow execution to complete:`, {
    workflowId,
    executionId,
    maxWaitSeconds,
  });

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const execution = (await request<{
        id: string;
        finished: boolean;
        stoppedAt?: string;
      }>("GET", `/executions/${executionId}`)) as {
        id: string;
        finished: boolean;
        stoppedAt?: string;
      };

      if (execution.finished) {
        console.log(`✅ Workflow execution completed:`, {
          workflowId,
          executionId,
          duration: Date.now() - startTime,
        });
        return getWorkflowExecutionResults(request, workflowId, executionId);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      // If execution doesn't exist yet, wait and retry
      if (error instanceof Error && error.message.includes("404")) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Workflow execution ${executionId} did not complete within ${maxWaitSeconds} seconds`
  );
}
