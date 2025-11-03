import { appConfig } from "../../config.js";
import type { Frequency } from "../../gen/stockpicker/v1/strategy_pb.js";
import type { N8nFullWorkflow, N8nWorkflow, N8nWorkflowResponse } from "../n8nTypes.js";
import { type RequestMethod, createOrUpdateCredential } from "./n8nCredentials.js";
import {
  filterWorkflowForApi,
  frequencyToName,
  injectApiUrl,
  injectCredentialReference,
  needsApiUrlUpdate,
  workflowsAreDifferent,
} from "./n8nHelpers.js";
import { createStrategyWorkflowTemplate } from "./n8nWorkflowTemplate.js";

/**
 * Create a workflow from a full workflow object (used for syncing from JSON files)
 */
export async function createWorkflow(
  request: RequestMethod,
  workflow: N8nWorkflow
): Promise<N8nWorkflowResponse> {
  try {
    // Inject API URL directly instead of relying on $env.API_URL
    const workflowWithApiUrl = injectApiUrl(workflow);

    // Filter to only include fields that n8n API accepts for workflow creation
    // n8n API only accepts: name, nodes, connections, settings (optional), staticData (optional), tags (optional)
    // It does NOT accept: id, active, versionId, meta, createdAt, updatedAt, note, etc.
    const workflowData = workflowWithApiUrl as unknown as Record<string, unknown>;

    // Filter workflow to only include API-accepted fields
    const requestBody = filterWorkflowForApi(workflowData);

    const response = await request<N8nWorkflowResponse>("POST", "/workflows", requestBody);
    console.log(`✅ Created workflow: ${response.name} (${response.id})`);
    return response;
  } catch (error) {
    console.error("❌ Error creating n8n workflow:", {
      name: workflow.name,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to create n8n workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update a full workflow (replaces entire workflow with new content)
 */
export async function updateFullWorkflow(
  request: RequestMethod,
  workflowId: string,
  workflow: N8nFullWorkflow,
  userToken?: string,
  strategyId?: string
): Promise<N8nWorkflowResponse> {
  try {
    // Fetch existing workflow to compare
    const existingWorkflow = await getFullWorkflow(request, workflowId);

    // Update credential if user token provided
    let processedWorkflow = workflow;
    if (userToken) {
      // Try to extract strategyId from parameter, workflow name, or workflow ID
      let credentialStrategyId = strategyId;
      if (!credentialStrategyId) {
        // Try to extract from workflow name - format: "Strategy: {name} ({frequency})"
        // But we actually need the UUID strategy ID, not the name
        // For now, we'll use a pattern based on existing credentials or workflow ID
        // In practice, strategyId should be passed from the caller
        credentialStrategyId = workflowId;
      }
      const credentialName = `Strategy-${credentialStrategyId}-Auth`;

      // Update the credential with the new token
      const credentialId = await createOrUpdateCredential(request, credentialName, userToken);

      // Inject credential reference into workflow nodes
      processedWorkflow = injectCredentialReference(
        processedWorkflow as N8nWorkflow,
        credentialId,
        credentialName
      ) as N8nFullWorkflow;
    }

    // Check if workflow actually differs from existing one
    console.log(`🔍 Comparing workflow update: ${workflow.name} (${workflowId})`);
    const isDifferent = workflowsAreDifferent(existingWorkflow, processedWorkflow, true);

    if (!isDifferent) {
      console.log(`ℹ️  Workflow unchanged: ${workflow.name} (${workflowId})`);
      return {
        id: workflowId,
        name: existingWorkflow.name,
        active: existingWorkflow.active ?? false,
      };
    }

    console.log(`⚠️  Workflow differs - will update: ${workflow.name} (${workflowId})`);

    // Filter workflow to only include API-accepted fields (remove id, active, versionId, meta, etc.)
    const workflowData = processedWorkflow as unknown as Record<string, unknown>;
    const requestBody = filterWorkflowForApi(workflowData);

    // Use PUT to replace the entire workflow
    const response = await request<N8nWorkflowResponse>(
      "PUT",
      `/workflows/${workflowId}`,
      requestBody
    );
    console.log(`✅ Updated workflow: ${response.name} (${response.id})`);
    return response;
  } catch (error) {
    console.error(`❌ Error updating full n8n workflow:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to update full n8n workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get full workflow details including nodes and connections
 */
export async function getFullWorkflow(
  request: RequestMethod,
  workflowId: string
): Promise<N8nFullWorkflow> {
  try {
    const response = await request<N8nFullWorkflow>("GET", `/workflows/${workflowId}`);
    return response;
  } catch (error) {
    console.error(`❌ Error getting full n8n workflow:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to get full n8n workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get a workflow by ID (returns minimal info)
 */
export async function getWorkflow(
  request: RequestMethod,
  workflowId: string
): Promise<N8nWorkflowResponse> {
  try {
    const response = await request<N8nWorkflowResponse>("GET", `/workflows/${workflowId}`);
    return response;
  } catch (error) {
    console.error(`❌ Error getting n8n workflow:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to get n8n workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * List all workflows
 */
export async function listWorkflows(
  request: RequestMethod,
  silent = false
): Promise<N8nWorkflowResponse[]> {
  try {
    if (!silent) {
      console.log(`🔍 Listing all n8n workflows`);
    }
    const response = await request<{ data: N8nWorkflowResponse[] }>("GET", `/workflows`);
    if (!silent) {
      console.log(`✅ Retrieved ${response.data.length} workflows`);
    }
    return response.data;
  } catch (error) {
    console.error(`❌ Error listing n8n workflows:`, {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to list n8n workflows: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(request: RequestMethod, workflowId: string): Promise<void> {
  try {
    await request<void>("DELETE", `/workflows/${workflowId}`);
  } catch (error) {
    console.error(`❌ Error deleting n8n workflow:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to delete n8n workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Activate a workflow using the dedicated activate endpoint
 * See: https://docs.n8n.io/api/
 */
export async function activateWorkflow(request: RequestMethod, workflowId: string): Promise<void> {
  try {
    // Use the dedicated activate endpoint instead of PATCH with active: true
    await request<void>("POST", `/workflows/${workflowId}/activate`);
  } catch (error) {
    console.error(`❌ Error activating n8n workflow:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Deactivate a workflow using the dedicated deactivate endpoint
 * See: https://docs.n8n.io/api/
 */
export async function deactivateWorkflow(
  request: RequestMethod,
  workflowId: string
): Promise<void> {
  try {
    // Use the dedicated deactivate endpoint instead of PATCH with active: false
    await request<void>("POST", `/workflows/${workflowId}/deactivate`);
  } catch (error) {
    console.error(`❌ Error deactivating n8n workflow:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Update a workflow
 * Note: n8n doesn't support PATCH, so we fetch the full workflow, apply updates, and PUT it back
 */
export async function updateWorkflow(
  request: RequestMethod,
  workflowId: string,
  updates: Partial<N8nWorkflow>,
  userToken?: string,
  strategyId?: string
): Promise<N8nWorkflowResponse> {
  try {
    // n8n doesn't support PATCH, so we need to fetch the full workflow first
    const existingWorkflow = await getFullWorkflow(request, workflowId);

    // Merge updates into the existing workflow
    const updatedWorkflow: N8nFullWorkflow = {
      ...existingWorkflow,
      ...updates,
      id: workflowId,
    };

    // Pass strategyId to updateFullWorkflow for credential updates
    // updateFullWorkflow will check for differences internally
    const response = await updateFullWorkflow(
      request,
      workflowId,
      updatedWorkflow,
      userToken,
      strategyId
    );

    return response;
  } catch (error) {
    console.error(`❌ Error updating n8n workflow:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to update n8n workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Update API URLs in an existing workflow if they've changed
 * This is more efficient than recreating the workflow
 */
export async function updateWorkflowApiUrl(
  request: RequestMethod,
  workflowId: string,
  userToken?: string,
  strategyId?: string
): Promise<N8nWorkflowResponse | null> {
  try {
    // Get the full workflow
    const workflow = await getFullWorkflow(request, workflowId);

    // Check if it needs updating
    if (!needsApiUrlUpdate(workflow)) {
      return null;
    }

    // Inject the current API URL into the workflow
    // Note: injectApiUrl preserves node structure including credentials
    const updatedWorkflow = injectApiUrl(workflow);

    // Ensure the workflow has the ID set (required for N8nFullWorkflow)
    const workflowWithId: N8nFullWorkflow = {
      ...updatedWorkflow,
      id: workflowId,
    };

    // Update the workflow (PUT replaces entire workflow)
    // Pass userToken and strategyId to preserve credentials
    // updateFullWorkflow will check for differences internally
    const response = await updateFullWorkflow(
      request,
      workflowId,
      workflowWithId,
      userToken,
      strategyId
    );

    return response;
  } catch (error) {
    console.error(`❌ Error updating workflow API URL:`, {
      workflowId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Update a strategy workflow when strategy parameters change
 * This updates the workflow name, cron schedule, and AI analysis prompt
 */
export async function updateStrategyWorkflow(
  request: RequestMethod,
  workflowId: string,
  strategyId: string,
  strategyName: string,
  frequency: Frequency,
  userToken?: string
): Promise<N8nWorkflowResponse> {
  const frequencyName = frequencyToName(frequency);

  // Update the workflow name
  const updates: Partial<N8nWorkflow> = {
    name: `Strategy: ${strategyName} (${frequencyName})`,
  };

  // Note: To update nodes (like cron schedule or AI prompt), we would need to fetch
  // the full workflow, modify specific nodes, and update. For now, we'll update
  // the name. Node updates can be done via full workflow replacement if needed.

  try {
    // Pass strategyId to updateWorkflow so it can update credentials
    // updateWorkflow -> updateFullWorkflow will check for differences internally
    const response = await updateWorkflow(request, workflowId, updates, userToken, strategyId);
    return response;
  } catch (error) {
    console.error(`❌ Error updating n8n workflow for strategy:`, {
      workflowId,
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Rebuild a workflow from the latest template to propagate code changes
 * This replaces the entire workflow structure with the latest version
 * Preserves workflow ID, active status, and updates credentials
 */
export async function rebuildWorkflowFromTemplate(
  request: RequestMethod,
  workflowId: string,
  strategyId: string,
  strategyName: string,
  frequency: Frequency,
  userToken: string
): Promise<N8nWorkflowResponse> {
  try {
    // Get existing workflow to preserve active status and compare
    const existingWorkflow = await getFullWorkflow(request, workflowId);
    const wasActive = existingWorkflow.active;

    // Create new workflow structure from latest template
    const template = createStrategyWorkflowTemplate(strategyId, strategyName, frequency);
    const credentialName = `Strategy-${strategyId}-Auth`;
    const credentialId = await createOrUpdateCredential(request, credentialName, userToken);

    let processedWorkflow = injectApiUrl(template);
    processedWorkflow = injectCredentialReference(processedWorkflow, credentialId, credentialName);

    // Check if the new workflow is actually different from the existing one
    // If they're the same, just return the existing workflow (preserving active status)
    console.log(
      `🔍 Comparing template with existing workflow: ${existingWorkflow.name} (${workflowId})`
    );
    const isDifferent = workflowsAreDifferent(existingWorkflow, processedWorkflow, true);

    if (!isDifferent) {
      console.log(`ℹ️  Workflow unchanged: ${existingWorkflow.name} (${workflowId})`);
      return {
        id: workflowId,
        name: existingWorkflow.name,
        active: existingWorkflow.active ?? false,
      };
    }

    console.log(
      `⚠️  Workflow differs from template - will update: ${existingWorkflow.name} (${workflowId})`
    );

    // Workflows are different - update in place to preserve workflow ID
    // This is critical to preserve webhook URLs and other references
    const processedWorkflowWithId = {
      ...processedWorkflow,
      id: workflowId,
    } as N8nFullWorkflow;

    const updatedWorkflow = await updateFullWorkflow(
      request,
      workflowId,
      processedWorkflowWithId,
      userToken,
      strategyId
    );

    // updateFullWorkflow preserves active status, but ensure it's active if it was before
    if (wasActive && !updatedWorkflow.active) {
      await activateWorkflow(request, workflowId);
      return {
        id: workflowId,
        name: updatedWorkflow.name,
        active: true,
      };
    }

    console.log(`✅ Rebuilt workflow: ${updatedWorkflow.name} (${workflowId})`);

    return updatedWorkflow;
  } catch (error) {
    console.error(`❌ Error rebuilding workflow from template:`, {
      workflowId,
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
