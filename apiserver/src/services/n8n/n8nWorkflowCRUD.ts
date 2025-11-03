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

    // Debug: Log HTTP Request node configurations
    if (Array.isArray(requestBody.nodes)) {
      for (const node of requestBody.nodes) {
        if (
          typeof node === "object" &&
          node !== null &&
          (node as Record<string, unknown>).type === "n8n-nodes-base.httpRequest"
        ) {
          const nodeObj = node as Record<string, unknown>;
          const params = nodeObj.parameters as Record<string, unknown> | undefined;
          if (params) {
            console.log(`🔍 HTTP Request node "${nodeObj.name}":`, {
              hasJsonBody: !!params.jsonBody,
              jsonBody: params.jsonBody,
              hasBody: !!params.body,
              body: params.body,
              specifyBody: params.specifyBody,
              contentType: params.contentType,
              bodyContentType: params.bodyContentType, // Legacy field
              hasBodyParameters: !!params.bodyParameters,
              sendBody: params.sendBody,
              url: params.url,
            });
          }
        }
      }
    }

    console.log(`📝 Creating n8n workflow from JSON:`, {
      name: workflow.name,
      nodeCount: Array.isArray(workflowData.nodes) ? workflowData.nodes.length : 0,
      apiUrl: appConfig.n8n.apiServerUrl,
      fields: Object.keys(requestBody),
    });
    const response = await request<N8nWorkflowResponse>("POST", "/workflows", requestBody);
    console.log(`✅ n8n workflow created successfully:`, {
      workflowId: response.id,
      workflowName: response.name,
      active: response.active,
    });
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
    console.log(`📝 Updating full n8n workflow:`, {
      workflowId,
      name: workflow.name,
      nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : undefined,
    });

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

    // Filter workflow to only include API-accepted fields (remove id, active, versionId, meta, etc.)
    const workflowData = processedWorkflow as unknown as Record<string, unknown>;
    const requestBody = filterWorkflowForApi(workflowData);

    // Debug: Log HTTP Request node configurations
    if (Array.isArray(requestBody.nodes)) {
      for (const node of requestBody.nodes) {
        if (
          typeof node === "object" &&
          node !== null &&
          (node as Record<string, unknown>).type === "n8n-nodes-base.httpRequest"
        ) {
          const nodeObj = node as Record<string, unknown>;
          const params = nodeObj.parameters as Record<string, unknown> | undefined;
          if (params) {
            console.log(`🔍 HTTP Request node "${nodeObj.name}":`, {
              hasJsonBody: !!params.jsonBody,
              jsonBody: params.jsonBody,
              hasBody: !!params.body,
              body: params.body,
              specifyBody: params.specifyBody,
              contentType: params.contentType,
              bodyContentType: params.bodyContentType, // Legacy field
              hasBodyParameters: !!params.bodyParameters,
              sendBody: params.sendBody,
              url: params.url,
            });
          }
        }
      }
    }

    console.log(`📝 Filtered workflow fields for update:`, {
      fields: Object.keys(requestBody),
      nodeCount: Array.isArray(requestBody.nodes) ? requestBody.nodes.length : 0,
    });

    // Use PUT to replace the entire workflow
    const response = await request<N8nWorkflowResponse>(
      "PUT",
      `/workflows/${workflowId}`,
      requestBody
    );
    console.log(`✅ n8n workflow updated successfully:`, {
      workflowId: response.id,
      workflowName: response.name,
      active: response.active,
    });
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
    console.log(`🔍 Getting full n8n workflow:`, { workflowId });
    const response = await request<N8nFullWorkflow>("GET", `/workflows/${workflowId}`);
    console.log(`✅ Retrieved full n8n workflow:`, {
      workflowId: response.id,
      workflowName: response.name,
      active: response.active,
      nodeCount: Array.isArray(response.nodes) ? response.nodes.length : 0,
    });
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
    console.log(`🔍 Getting n8n workflow:`, { workflowId });
    const response = await request<N8nWorkflowResponse>("GET", `/workflows/${workflowId}`);
    console.log(`✅ Retrieved n8n workflow:`, {
      workflowId: response.id,
      workflowName: response.name,
      active: response.active,
    });
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
    console.log(`🗑️ Deleting n8n workflow:`, { workflowId });
    await request<void>("DELETE", `/workflows/${workflowId}`);
    console.log(`✅ n8n workflow deleted successfully:`, { workflowId });
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
    console.log(`▶️ Activating n8n workflow:`, { workflowId });
    // Use the dedicated activate endpoint instead of PATCH with active: true
    await request<void>("POST", `/workflows/${workflowId}/activate`);
    console.log(`✅ n8n workflow activated successfully:`, { workflowId });
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
    console.log(`⏸️ Deactivating n8n workflow:`, { workflowId });
    // Use the dedicated deactivate endpoint instead of PATCH with active: false
    await request<void>("POST", `/workflows/${workflowId}/deactivate`);
    console.log(`✅ n8n workflow deactivated successfully:`, { workflowId });
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
    console.log(`📝 Updating n8n workflow:`, {
      workflowId,
      updates: Object.keys(updates),
    });

    // n8n doesn't support PATCH, so we need to fetch the full workflow first
    const existingWorkflow = await getFullWorkflow(request, workflowId);

    // Merge updates into the existing workflow
    const updatedWorkflow: N8nFullWorkflow = {
      ...existingWorkflow,
      ...updates,
      id: workflowId,
    };

    // Pass strategyId to updateFullWorkflow for credential updates
    const response = await updateFullWorkflow(
      request,
      workflowId,
      updatedWorkflow,
      userToken,
      strategyId
    );

    console.log(`✅ n8n workflow updated:`, {
      workflowId: response.id,
      workflowName: response.name,
      active: response.active,
    });
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
      console.log(`✅ Workflow API URL is current:`, { workflowId });
      return null;
    }

    console.log(`🔄 Updating API URL in workflow:`, {
      workflowId,
      workflowName: workflow.name,
    });

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
    const response = await updateFullWorkflow(
      request,
      workflowId,
      workflowWithId,
      userToken,
      strategyId
    );

    console.log(`✅ Workflow API URL updated:`, {
      workflowId: response.id,
      workflowName: response.name,
    });

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
    console.log(`📝 Updating n8n workflow for strategy:`, {
      workflowId,
      strategyId,
      strategyName,
      newName: updates.name,
      frequency: frequencyToName(frequency),
    });
    // Pass strategyId to updateWorkflow so it can update credentials
    const response = await updateWorkflow(request, workflowId, updates, userToken, strategyId);
    console.log(`✅ n8n workflow updated for strategy:`, {
      workflowId: response.id,
      strategyId,
    });
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
    console.log(`🔄 Rebuilding workflow from latest template:`, {
      workflowId,
      strategyId,
      strategyName,
      frequency: frequencyToName(frequency),
    });

    // Get existing workflow to preserve active status
    const existingWorkflow = await getFullWorkflow(request, workflowId);
    const wasActive = existingWorkflow.active;

    // Create new workflow structure from latest template
    const template = createStrategyWorkflowTemplate(strategyId, strategyName, frequency);
    const credentialName = `Strategy-${strategyId}-Auth`;
    const credentialId = await createOrUpdateCredential(request, credentialName, userToken);

    let processedWorkflow = injectApiUrl(template);
    processedWorkflow = injectCredentialReference(processedWorkflow, credentialId, credentialName);

    // Create the new workflow
    const newWorkflow = await createWorkflow(request, processedWorkflow);

    // Delete old workflow
    await deleteWorkflow(request, workflowId);
    console.log(`🗑️ Deleted old workflow:`, { workflowId });

    // The new workflow is created but inactive by default
    // Restore active status if it was active before
    if (wasActive) {
      await activateWorkflow(request, newWorkflow.id);
      console.log(`✅ Restored active status for rebuilt workflow:`, {
        workflowId: newWorkflow.id,
      });
    }

    console.log(`✅ Workflow rebuilt successfully:`, {
      oldWorkflowId: workflowId,
      newWorkflowId: newWorkflow.id,
      active: wasActive,
    });

    return newWorkflow;
  } catch (error) {
    console.error(`❌ Error rebuilding workflow from template:`, {
      workflowId,
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
