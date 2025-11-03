import { appConfig } from "../config.js";
import type { Frequency } from "../gen/stockpicker/v1/strategy_pb.js";
import { createOrUpdateCredential } from "./n8n/n8nCredentials.js";
import { getAuthHeaders, injectApiUrl, injectCredentialReference } from "./n8n/n8nHelpers.js";
import {
  activateWorkflow as activateWorkflowCRUD,
  createWorkflow,
  deactivateWorkflow as deactivateWorkflowCRUD,
  deleteWorkflow,
  getFullWorkflow,
  getWorkflow,
  listWorkflows,
  rebuildWorkflowFromTemplate as rebuildWorkflowFromTemplateCRUD,
  updateFullWorkflow,
  updateStrategyWorkflow,
  updateWorkflow,
  updateWorkflowApiUrl,
} from "./n8n/n8nWorkflowCRUD.js";
import {
  executeWorkflow as executeWorkflowExec,
  executeWorkflowWithData,
  getWorkflowExecutionResults,
  waitForWorkflowExecution,
} from "./n8n/n8nWorkflowExecution.js";
import { createStrategyWorkflowTemplate } from "./n8n/n8nWorkflowTemplate.js";
import type { N8nFullWorkflow, N8nWorkflow, N8nWorkflowResponse } from "./n8nTypes.js";

class N8nClient {
  private baseURL: string;

  constructor() {
    this.baseURL = appConfig.n8n.apiUrl;

    // Log configuration for debugging
    console.log("🔧 N8nClient initialized:", {
      baseURL: this.baseURL,
      hasApiKey: !!appConfig.n8n.apiKey,
    });
  }

  // Get auth headers when needed
  private getAuthHeaders(): Record<string, string> {
    return getAuthHeaders();
  }

  /**
   * Helper method to make HTTP requests using fetch
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.getAuthHeaders(),
    };

    const options: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(30000), // 30 second timeout
    };

    if (body !== undefined) {
      options.body = JSON.stringify(body);
    }

    // Log request details for debugging
    console.log(`🔵 n8n API ${method} ${path}`, {
      url,
      hasBody: body !== undefined,
      bodySize: body ? JSON.stringify(body).length : 0,
    });

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: unknown;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = errorText;
      }

      console.error(`❌ n8n API error: HTTP ${response.status} ${response.statusText}`);
      console.error("Response data:", JSON.stringify(errorData, null, 2));

      throw new Error(
        `HTTP ${response.status}: ${response.statusText}${errorText ? ` - ${errorText}` : ""}`
      );
    }

    const result = (await response.json()) as T;
    console.log(`✅ n8n API ${method} ${path} - success`);
    return result;
  }

  /**
   * Create or update an HTTP Header Auth credential in n8n
   * This stores the user token securely as a credential resource
   */
  async createOrUpdateCredential(credentialName: string, userToken: string): Promise<string> {
    return createOrUpdateCredential(this.request.bind(this), credentialName, userToken);
  }

  /**
   * Create a simplified workflow for a strategy that focuses on stock analysis
   * The apiserver prepares all input data (strategy, predictions, budget check)
   * and passes it to the workflow, which then performs AI analysis and returns recommendations
   */
  async createStrategyWorkflow(
    strategyId: string,
    strategyName: string,
    frequency: Frequency,
    userToken: string
  ): Promise<N8nWorkflowResponse> {
    try {
      // Step 1: Create workflow template
      const workflow = createStrategyWorkflowTemplate(strategyId, strategyName, frequency);

      // Step 2: Create or update credential with user token
      const credentialName = `Strategy-${strategyId}-Auth`;
      const credentialId = await this.createOrUpdateCredential(credentialName, userToken);

      // Step 3: Inject API URL and credential reference into workflow
      let processedWorkflow = injectApiUrl(workflow);
      processedWorkflow = injectCredentialReference(
        processedWorkflow,
        credentialId,
        credentialName
      );

      console.log(`📝 Creating n8n workflow for strategy:`, {
        strategyId,
        strategyName,
        frequency: workflow.name,
        workflowName: workflow.name,
        nodeCount: workflow.nodes.length,
        apiUrl: appConfig.n8n.apiServerUrl,
        credentialId,
        credentialName,
      });

      // Step 4: Create workflow in n8n
      const response = await createWorkflow(this.request.bind(this), processedWorkflow);

      console.log(`✅ n8n workflow created successfully:`, {
        workflowId: response.id,
        workflowName: response.name,
        active: response.active,
        strategyId,
      });
      return response;
    } catch (error) {
      console.error("❌ Error creating n8n workflow:", {
        strategyId,
        strategyName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error(
        `Failed to create n8n workflow: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Update a workflow
   * Note: n8n doesn't support PATCH, so we fetch the full workflow, apply updates, and PUT it back
   */
  async updateWorkflow(
    workflowId: string,
    updates: Partial<N8nWorkflow>,
    userToken?: string,
    strategyId?: string
  ): Promise<N8nWorkflowResponse> {
    return updateWorkflow(this.request.bind(this), workflowId, updates, userToken, strategyId);
  }

  /**
   * Rebuild a workflow from the latest template to propagate code changes
   * This replaces the entire workflow structure with the latest version
   * Preserves workflow ID, active status, and updates credentials
   */
  async rebuildWorkflowFromTemplate(
    workflowId: string,
    strategyId: string,
    strategyName: string,
    frequency: Frequency,
    userToken: string
  ): Promise<N8nWorkflowResponse> {
    return rebuildWorkflowFromTemplateCRUD(
      this.request.bind(this),
      workflowId,
      strategyId,
      strategyName,
      frequency,
      userToken
    );
  }

  /**
   * Update a strategy workflow when strategy parameters change
   * This updates the workflow name, cron schedule, and AI analysis prompt
   */
  async updateStrategyWorkflow(
    workflowId: string,
    strategyId: string,
    strategyName: string,
    frequency: Frequency,
    userToken?: string
  ): Promise<N8nWorkflowResponse> {
    return updateStrategyWorkflow(
      this.request.bind(this),
      workflowId,
      strategyId,
      strategyName,
      frequency,
      userToken
    );
  }

  /**
   * Activate a workflow using the dedicated activate endpoint
   * See: https://docs.n8n.io/api/
   */
  async activateWorkflow(workflowId: string): Promise<void> {
    return activateWorkflowCRUD(this.request.bind(this), workflowId);
  }

  /**
   * Deactivate a workflow using the dedicated deactivate endpoint
   * See: https://docs.n8n.io/api/
   */
  async deactivateWorkflow(workflowId: string): Promise<void> {
    return deactivateWorkflowCRUD(this.request.bind(this), workflowId);
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    return deleteWorkflow(this.request.bind(this), workflowId);
  }

  /**
   * List all workflows
   */
  async listWorkflows(silent = false): Promise<N8nWorkflowResponse[]> {
    return listWorkflows(this.request.bind(this), silent);
  }

  /**
   * Get a workflow by ID (returns minimal info)
   */
  async getWorkflow(workflowId: string): Promise<N8nWorkflowResponse> {
    return getWorkflow(this.request.bind(this), workflowId);
  }

  /**
   * Update API URLs in an existing workflow if they've changed
   * This is more efficient than recreating the workflow
   */
  async updateWorkflowApiUrl(
    workflowId: string,
    userToken?: string,
    strategyId?: string
  ): Promise<N8nWorkflowResponse | null> {
    return updateWorkflowApiUrl(this.request.bind(this), workflowId, userToken, strategyId);
  }

  /**
   * Get full workflow details including nodes and connections
   */
  async getFullWorkflow(workflowId: string): Promise<N8nFullWorkflow> {
    return getFullWorkflow(this.request.bind(this), workflowId);
  }

  /**
   * Create a workflow from a full workflow object (used for syncing from JSON files)
   */
  async createWorkflow(workflow: N8nWorkflow): Promise<N8nWorkflowResponse> {
    return createWorkflow(this.request.bind(this), workflow);
  }

  /**
   * Update a full workflow (replaces entire workflow with new content)
   */
  async updateFullWorkflow(
    workflowId: string,
    workflow: N8nFullWorkflow,
    userToken?: string,
    strategyId?: string
  ): Promise<N8nWorkflowResponse> {
    return updateFullWorkflow(this.request.bind(this), workflowId, workflow, userToken, strategyId);
  }

  /**
   * Manually execute a workflow (triggers the manual trigger node)
   * See: https://docs.n8n.io/api/
   */
  async executeWorkflow(workflowId: string): Promise<void> {
    return executeWorkflowExec(this.request.bind(this), this.baseURL, workflowId);
  }

  /**
   * Execute workflow with input data via webhook trigger
   * Gets the webhook URL for the workflow and POSTs the data to it
   */
  async executeWorkflowWithData(
    workflowId: string,
    inputData: Record<string, unknown>
  ): Promise<string> {
    return executeWorkflowWithData(this.request.bind(this), this.baseURL, workflowId, inputData);
  }

  /**
   * Get workflow execution results
   * Returns the output data from the last execution
   */
  async getWorkflowExecutionResults(
    workflowId: string,
    executionId?: string
  ): Promise<Array<Record<string, unknown>>> {
    return getWorkflowExecutionResults(this.request.bind(this), workflowId, executionId);
  }

  /**
   * Wait for workflow execution to complete and get results
   * Polls the execution status until finished, then returns results
   */
  async waitForWorkflowExecution(
    workflowId: string,
    executionId: string,
    maxWaitSeconds = 300,
    pollIntervalSeconds = 2
  ): Promise<Array<Record<string, unknown>>> {
    return waitForWorkflowExecution(
      this.request.bind(this),
      workflowId,
      executionId,
      maxWaitSeconds,
      pollIntervalSeconds
    );
  }
}

export const n8nClient = new N8nClient();
