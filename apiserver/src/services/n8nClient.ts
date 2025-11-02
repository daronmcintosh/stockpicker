import { appConfig } from "../config.js";
import { Frequency } from "../gen/stockpicker/v1/strategy_pb.js";

/**
 * Replace $env.API_URL placeholders with actual API URL
 * Since n8n env vars aren't reliable, we inject the URL directly into the workflow
 */
function injectApiUrl(workflow: N8nWorkflow): N8nWorkflow {
  const apiUrl = appConfig.n8n.apiServerUrl || "http://apiserver:3000";

  // Deep clone to avoid mutating original
  const processed = JSON.parse(JSON.stringify(workflow));

  // Recursively replace $env.API_URL expressions with actual URL
  function replaceEnvVars(obj: unknown): unknown {
    if (typeof obj === "string") {
      // Replace n8n expression syntax: {{ $env.API_URL }} or ={{ $env.API_URL }}
      // Replace with just the URL value (no expression, since we're hardcoding it)
      return obj
        .replace(/\{\{\s*\$env\.API_URL\s*\}\}/g, apiUrl)
        .replace(/=\{\{\s*\$env\.API_URL\s*\}\}/g, apiUrl);
    }
    if (Array.isArray(obj)) {
      return obj.map(replaceEnvVars);
    }
    if (obj !== null && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = replaceEnvVars(value);
      }
      return result;
    }
    return obj;
  }

  return replaceEnvVars(processed) as N8nWorkflow;
}

// Helper to get auth headers (n8n API requires X-N8N-API-KEY header)
// See: https://docs.n8n.io/api/authentication/
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!appConfig.n8n.apiKey) {
    throw new Error(
      "N8N_API_KEY environment variable is required. Get your API key from n8n: Settings > n8n API"
    );
  }

  // n8n API authentication uses X-N8N-API-KEY header
  headers["X-N8N-API-KEY"] = appConfig.n8n.apiKey;

  return headers;
}

// Helper to convert frequency enum to cron expression
function frequencyToCron(frequency: Frequency): string {
  switch (frequency) {
    case Frequency.DAILY:
      return "0 10 * * *"; // Daily at 10am
    case Frequency.TWICE_WEEKLY:
      return "0 10 * * 1,4"; // Monday and Thursday at 10am
    case Frequency.WEEKLY:
      return "0 10 * * 1"; // Monday at 10am
    case Frequency.BIWEEKLY:
      return "0 10 1,15 * *"; // 1st and 15th of month at 10am
    case Frequency.MONTHLY:
      return "0 10 1 * *"; // 1st of month at 10am
    default:
      return "0 10 * * 1,4"; // Default to twice weekly
  }
}

// Helper to convert frequency enum to name string
function frequencyToName(frequency: Frequency): string {
  switch (frequency) {
    case Frequency.DAILY:
      return "Daily";
    case Frequency.TWICE_WEEKLY:
      return "Twice Weekly";
    case Frequency.WEEKLY:
      return "Weekly";
    case Frequency.BIWEEKLY:
      return "Biweekly";
    case Frequency.MONTHLY:
      return "Monthly";
    default:
      return "Unknown";
  }
}

interface N8nWorkflow {
  id?: string;
  name: string;
  active?: boolean; // Read-only in API - cannot be set during creation
  nodes: unknown[];
  connections: unknown;
  settings?: unknown;
  staticData?: unknown;
  tags?: unknown[];
}

interface N8nWorkflowResponse {
  id: string;
  name: string;
  active: boolean;
}

interface N8nFullWorkflow extends N8nWorkflow {
  id: string;
}

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
   * Create a unified workflow for a strategy that supports both manual and scheduled triggers
   * This workflow combines stock fetching, analysis, and prediction creation
   */
  async createStrategyWorkflow(
    strategyId: string,
    strategyName: string,
    frequency: Frequency
  ): Promise<N8nWorkflowResponse> {
    const cronExpression = frequencyToCron(frequency);
    const frequencyName = frequencyToName(frequency);

    // Note: 'active' field is read-only in the API and cannot be set during creation
    // Workflow will be created as inactive by default, then activated separately when strategy starts
    const workflow: N8nWorkflow = {
      name: `Strategy: ${strategyName} (${frequencyName})`,
      nodes: [
        // Schedule Trigger (for cron-based execution)
        {
          parameters: {
            triggerTimes: {
              item: [
                {
                  mode: "cron",
                  cronExpression: cronExpression,
                },
              ],
            },
          },
          id: "schedule-trigger",
          name: "Schedule Trigger",
          type: "n8n-nodes-base.scheduleTrigger",
          typeVersion: 1.2,
          position: [250, 300],
        },
        // Manual Trigger (for manual execution)
        {
          parameters: {},
          id: "manual-trigger",
          name: "Manual Trigger",
          type: "n8n-nodes-base.manualTrigger",
          typeVersion: 1,
          position: [250, 500],
        },
        // Get Strategy - uses hardcoded strategyId (each workflow is 1:1 with a strategy)
        {
          parameters: {
            url: "={{ $env.API_URL }}/stockpicker.v1.StrategyService/GetStrategy",
            method: "POST",
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: "Content-Type",
                  value: "application/json",
                },
                {
                  name: "Connect-Protocol-Version",
                  value: "1",
                },
              ],
            },
            sendBody: true,
            bodyParameters: {
              parameters: [
                {
                  name: "id",
                  value: strategyId,
                },
              ],
            },
            options: {},
          },
          id: "get-strategy",
          name: "Get Strategy",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [450, 400],
        },
        // Check if strategy is active
        {
          parameters: {
            conditions: {
              options: {
                caseSensitive: true,
                leftValue: "",
                typeValidation: "strict",
              },
              conditions: [
                {
                  id: "check-active",
                  leftValue: "={{ $json.strategy.status }}",
                  rightValue: "STRATEGY_STATUS_ACTIVE",
                  operator: {
                    type: "string",
                    operation: "equals",
                  },
                },
              ],
              combinator: "and",
            },
            options: {},
          },
          id: "check-strategy-active",
          name: "Check Strategy Active",
          type: "n8n-nodes-base.if",
          typeVersion: 2,
          position: [650, 400],
        },
        // Get Active Predictions for budget check
        {
          parameters: {
            url: "={{ $env.API_URL }}/stockpicker.v1.PredictionService/ListPredictions",
            method: "POST",
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: "Content-Type",
                  value: "application/json",
                },
                {
                  name: "Connect-Protocol-Version",
                  value: "1",
                },
              ],
            },
            sendBody: true,
            bodyParameters: {
              parameters: [
                {
                  name: "strategyId",
                  value: `={{ $node['Get Strategy'].json.strategy.id }}`,
                },
                {
                  name: "status",
                  value: "PREDICTION_STATUS_ACTIVE",
                },
              ],
            },
            options: {},
          },
          id: "get-active-predictions",
          name: "Get Active Predictions",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [1050, 300],
        },
        // Check Budget
        {
          parameters: {
            conditions: {
              options: {
                caseSensitive: true,
                leftValue: "",
                typeValidation: "strict",
              },
              conditions: [
                {
                  id: "check-budget-condition",
                  leftValue: "={{ $node['Get Strategy'].json.strategy.currentMonthSpent }}",
                  rightValue: "={{ $node['Get Strategy'].json.strategy.monthlyBudget }}",
                  operator: {
                    type: "number",
                    operation: "smaller",
                  },
                },
              ],
              combinator: "and",
            },
            options: {},
          },
          id: "check-budget",
          name: "Check Budget",
          type: "n8n-nodes-base.if",
          typeVersion: 2,
          position: [1250, 300],
        },
        // Get Top Stocks from Alpha Vantage
        {
          parameters: {
            url: "https://www.alphavantage.co/query",
            method: "GET",
            sendQuery: true,
            queryParameters: {
              parameters: [
                {
                  name: "function",
                  value: "TOP_GAINERS_LOSERS",
                },
                {
                  name: "apikey",
                  value: "={{ $env.ALPHA_VANTAGE_API_KEY }}",
                },
              ],
            },
            options: {},
          },
          id: "get-top-stocks",
          name: "Get Top Stocks (Alpha Vantage)",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [1450, 300],
        },
        // Extract Top Stocks
        {
          parameters: {
            assignments: {
              assignments: [
                {
                  id: "top_stocks",
                  name: "top_stocks",
                  value: "={{ $json.top_gainers || [] }}",
                  type: "array",
                },
              ],
            },
          },
          id: "extract-top-stocks",
          name: "Extract Top Stocks",
          type: "n8n-nodes-base.set",
          typeVersion: 3.4,
          position: [1650, 300],
        },
        // AI Stock Analysis - uses OpenAI API directly (replacing LangChain)
        {
          parameters: {
            url: "https://api.openai.com/v1/chat/completions",
            method: "POST",
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: "Content-Type",
                  value: "application/json",
                },
                {
                  name: "Authorization",
                  value: "=Bearer {{ $env.OPENAI_API_KEY }}",
                },
              ],
            },
            sendBody: true,
            bodyContentType: "json",
            jsonBody:
              '={{ {"model": "gpt-4o-mini", "messages": [{"role": "system", "content": "You are a financial analyst AI assistant. Provide data-driven stock recommendations. Always respond with valid JSON only, no markdown formatting."}, {"role": "user", "content": "You are a stock market analyst. Analyze the following stocks and recommend the top 10 based on:\\n\\nStrategy Parameters:\\n- Time Horizon: " + $node["Get Strategy"].json.strategy.timeHorizon + "\\n- Target Return: " + $node["Get Strategy"].json.strategy.targetReturnPct + "%\\n- Risk Level: " + $node["Get Strategy"].json.strategy.riskLevel + "\\n- Per Stock Budget: $" + $node["Get Strategy"].json.strategy.perStockAllocation + "\\n- Custom Instructions: " + ($node["Get Strategy"].json.strategy.customPrompt || "None") + "\\n\\nAvailable Stocks:\\n" + JSON.stringify($json.top_stocks.slice(0, 50), null, 2) + "\\n\\nFor each recommended stock, provide:\\n1. symbol (string)\\n2. entry_price (number)\\n3. target_price (number)\\n4. stop_loss_price (number)\\n5. technical_analysis (JSON object with RSI, MACD, trends)\\n6. sentiment_score (number 1-10)\\n7. overall_score (number 1-10)\\n\\nReturn a JSON object with a \'recommendations\' property containing an array of exactly 10 stocks, sorted by overall_score descending. Format: {\\"recommendations\\": [...]}"}], "temperature": 0.7, "response_format": {"type": "json_object"}} }}',
            options: {},
          },
          id: "ai-stock-analysis-http",
          name: "AI Stock Analysis (OpenAI)",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [1850, 300],
        },
        // Parse AI Response - extract JSON from OpenAI response
        {
          parameters: {
            mode: "runOnceForEachItem",
            jsCode: `// Extract recommendations from OpenAI response
const response = $input.item.json;
const content = response.choices?.[0]?.message?.content || response.message?.content || '';
let recommendations = [];

try {
  if (!content) {
    console.error('No content found in OpenAI response');
    return [];
  }

  // Parse JSON content
  const parsed = JSON.parse(content);
  // Handle if OpenAI returns object with array property, or direct array
  if (Array.isArray(parsed)) {
    recommendations = parsed;
  } else if (parsed.recommendations && Array.isArray(parsed.recommendations)) {
    recommendations = parsed.recommendations;
  } else if (parsed.stocks && Array.isArray(parsed.stocks)) {
    recommendations = parsed.stocks;
  } else {
    // Try to find any array in the response
    recommendations = Object.values(parsed).find(v => Array.isArray(v)) || [];
  }
} catch (e) {
  console.error('Error parsing OpenAI response:', e);
  recommendations = [];
}

// Return each recommendation as a separate item
return recommendations.map(rec => ({ json: rec }));`,
          },
          id: "parse-ai-response",
          name: "Parse AI Response",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [2050, 300],
        },
        // Sort by Score
        {
          parameters: {
            operation: "sort",
            sortFieldsUi: {
              sortField: [
                {
                  fieldName: "overall_score",
                  order: "descending",
                },
              ],
            },
          },
          id: "sort-by-score",
          name: "Sort by Score",
          type: "n8n-nodes-base.itemLists",
          typeVersion: 3.1,
          position: [2050, 300],
        },
        // Take Top 3 for predictions (but workflow output includes all 10)
        {
          parameters: {
            operation: "limit",
            maxItems: 3,
          },
          id: "take-top-3",
          name: "Take Top 3",
          type: "n8n-nodes-base.itemLists",
          typeVersion: 3.1,
          position: [2250, 300],
        },
        // Prepare Prediction
        {
          parameters: {
            mode: "raw",
            assignments: {
              assignments: [
                {
                  id: "prediction_data",
                  name: "prediction_data",
                  value: `={{ {\n  strategyId: $node['Get Strategy'].json.strategy.id,\n  symbol: $json.symbol,\n  entryPrice: $json.entry_price,\n  allocatedAmount: $node['Get Strategy'].json.strategy.perStockAllocation,\n  targetPrice: $json.target_price,\n  stopLossPrice: $json.stop_loss_price,\n  technicalAnalysis: JSON.stringify($json.technical_analysis || {}),\n  sentimentScore: $json.sentiment_score,\n  overallScore: $json.overall_score\n} }}`,
                  type: "object",
                },
              ],
            },
          },
          id: "prepare-prediction",
          name: "Prepare Prediction",
          type: "n8n-nodes-base.set",
          typeVersion: 3.4,
          position: [2450, 300],
        },
        // Create Prediction
        {
          parameters: {
            url: "={{ $env.API_URL }}/stockpicker.v1.PredictionService/CreatePrediction",
            method: "POST",
            sendHeaders: true,
            headerParameters: {
              parameters: [
                {
                  name: "Content-Type",
                  value: "application/json",
                },
                {
                  name: "Connect-Protocol-Version",
                  value: "1",
                },
              ],
            },
            sendBody: true,
            bodyContentType: "json",
            jsonBody: "={{ $json.prediction_data }}",
            options: {},
          },
          id: "create-prediction",
          name: "Create Prediction",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [2650, 300],
        },
      ],
      connections: {
        "Schedule Trigger": {
          main: [[{ node: "Get Strategy", type: "main", index: 0 }]],
        },
        "Manual Trigger": {
          main: [[{ node: "Get Strategy", type: "main", index: 0 }]],
        },
        "Get Strategy": {
          main: [[{ node: "Check Strategy Active", type: "main", index: 0 }]],
        },
        "Check Strategy Active": {
          main: [
            [{ node: "Get Active Predictions", type: "main", index: 0 }],
            [], // False path - workflow ends
          ],
        },
        "Get Active Predictions": {
          main: [[{ node: "Check Budget", type: "main", index: 0 }]],
        },
        "Check Budget": {
          main: [
            [{ node: "Get Top Stocks (Alpha Vantage)", type: "main", index: 0 }],
            [], // False path - workflow ends
          ],
        },
        "Get Top Stocks (Alpha Vantage)": {
          main: [[{ node: "Extract Top Stocks", type: "main", index: 0 }]],
        },
        "Extract Top Stocks": {
          main: [[{ node: "AI Stock Analysis (OpenAI)", type: "main", index: 0 }]],
        },
        "AI Stock Analysis (OpenAI)": {
          main: [[{ node: "Parse AI Response", type: "main", index: 0 }]],
        },
        "Parse AI Response": {
          main: [[{ node: "Sort by Score", type: "main", index: 0 }]],
        },
        "Sort by Score": {
          main: [[{ node: "Take Top 3", type: "main", index: 0 }]],
        },
        "Take Top 3": {
          main: [[{ node: "Prepare Prediction", type: "main", index: 0 }]],
        },
        "Prepare Prediction": {
          main: [[{ node: "Create Prediction", type: "main", index: 0 }]],
        },
      },
      settings: {
        executionOrder: "v1",
      },
    };

    try {
      // Inject API URL directly instead of relying on $env.API_URL
      const workflowWithApiUrl = injectApiUrl(workflow);

      console.log(`📝 Creating n8n workflow for strategy:`, {
        strategyId,
        strategyName,
        frequency: frequencyToName(frequency),
        cronExpression: frequencyToCron(frequency),
        workflowName: workflow.name,
        nodeCount: workflow.nodes.length,
        apiUrl: appConfig.n8n.apiServerUrl,
      });
      const response = await this.request<N8nWorkflowResponse>(
        "POST",
        "/workflows",
        workflowWithApiUrl
      );
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
   */
  async updateWorkflow(
    workflowId: string,
    updates: Partial<N8nWorkflow>
  ): Promise<N8nWorkflowResponse> {
    try {
      console.log(`📝 Updating n8n workflow:`, {
        workflowId,
        updates: Object.keys(updates),
      });
      const response = await this.request<N8nWorkflowResponse>(
        "PATCH",
        `/workflows/${workflowId}`,
        updates
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
   * Update a strategy workflow when strategy parameters change
   * This updates the workflow name, cron schedule, and AI analysis prompt
   */
  async updateStrategyWorkflow(
    workflowId: string,
    strategyId: string,
    strategyName: string,
    frequency: Frequency
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
      const response = await this.updateWorkflow(workflowId, updates);
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
   * Activate a workflow using the dedicated activate endpoint
   * See: https://docs.n8n.io/api/
   */
  async activateWorkflow(workflowId: string): Promise<void> {
    try {
      console.log(`▶️ Activating n8n workflow:`, { workflowId });
      // Use the dedicated activate endpoint instead of PATCH with active: true
      await this.request<void>("POST", `/workflows/${workflowId}/activate`);
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
  async deactivateWorkflow(workflowId: string): Promise<void> {
    try {
      console.log(`⏸️ Deactivating n8n workflow:`, { workflowId });
      // Use the dedicated deactivate endpoint instead of PATCH with active: false
      await this.request<void>("POST", `/workflows/${workflowId}/deactivate`);
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
   * Delete a workflow
   */
  async deleteWorkflow(workflowId: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting n8n workflow:`, { workflowId });
      await this.request<void>("DELETE", `/workflows/${workflowId}`);
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
   * List all workflows
   */
  async listWorkflows(silent = false): Promise<N8nWorkflowResponse[]> {
    try {
      if (!silent) {
        console.log(`🔍 Listing all n8n workflows`);
      }
      const response = await this.request<{ data: N8nWorkflowResponse[] }>("GET", `/workflows`);
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
   * Get a workflow by ID (returns minimal info)
   */
  async getWorkflow(workflowId: string): Promise<N8nWorkflowResponse> {
    try {
      console.log(`🔍 Getting n8n workflow:`, { workflowId });
      const response = await this.request<N8nWorkflowResponse>("GET", `/workflows/${workflowId}`);
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
   * Get full workflow details including nodes and connections
   */
  async getFullWorkflow(workflowId: string): Promise<N8nFullWorkflow> {
    try {
      console.log(`🔍 Getting full n8n workflow:`, { workflowId });
      const response = await this.request<N8nFullWorkflow>("GET", `/workflows/${workflowId}`);
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
   * Create a workflow from a full workflow object (used for syncing from JSON files)
   */
  async createWorkflow(workflow: N8nWorkflow): Promise<N8nWorkflowResponse> {
    try {
      // Inject API URL directly instead of relying on $env.API_URL
      const workflowWithApiUrl = injectApiUrl(workflow);

      // Filter to only include fields that n8n API accepts for workflow creation
      // n8n API only accepts: name, nodes, connections, settings (optional), staticData (optional), tags (optional)
      // It does NOT accept: id, active, versionId, meta, createdAt, updatedAt, note, etc.
      const workflowData = workflowWithApiUrl as Record<string, unknown>;

      // Filter nodes to remove unsupported fields (like "note" which is UI-only)
      // Nodes can have: id, name, type, typeVersion, position, parameters, disabled, executeOnce, continueOnFail, retryOnFail
      // They should NOT have: note, webhookId, etc.
      const filteredNodes = Array.isArray(workflowData.nodes)
        ? workflowData.nodes.map((node: unknown) => {
            if (typeof node === "object" && node !== null) {
              const nodeObj = node as Record<string, unknown>;
              // Remove "note" field from nodes (UI-only, not accepted by API)
              const { note, webhookId, ...filteredNode } = nodeObj;
              return filteredNode;
            }
            return node;
          })
        : workflowData.nodes;

      // Whitelist approach: only include accepted fields
      const requestBody: Record<string, unknown> = {
        name: workflowData.name,
        nodes: filteredNodes,
        connections: workflowData.connections,
      };

      // Include optional fields only if they exist and are not empty
      if (workflowData.settings) {
        requestBody.settings = workflowData.settings;
      }
      if (workflowData.staticData) {
        requestBody.staticData = workflowData.staticData;
      }
      // Tags must be an array with at least one element (empty arrays might cause issues)
      if (workflowData.tags && Array.isArray(workflowData.tags) && workflowData.tags.length > 0) {
        requestBody.tags = workflowData.tags;
      }

      console.log(`📝 Creating n8n workflow from JSON:`, {
        name: workflow.name,
        nodeCount: Array.isArray(workflowData.nodes) ? workflowData.nodes.length : 0,
        apiUrl: appConfig.n8n.apiServerUrl,
        fields: Object.keys(requestBody),
      });
      const response = await this.request<N8nWorkflowResponse>("POST", "/workflows", requestBody);
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
  async updateFullWorkflow(
    workflowId: string,
    workflow: Partial<N8nWorkflow> & { id: string }
  ): Promise<N8nWorkflowResponse> {
    try {
      console.log(`📝 Updating full n8n workflow:`, {
        workflowId,
        name: workflow.name,
        nodeCount: Array.isArray(workflow.nodes) ? workflow.nodes.length : undefined,
      });
      // Use PUT to replace the entire workflow
      const response = await this.request<N8nWorkflowResponse>(
        "PUT",
        `/workflows/${workflowId}`,
        workflow
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
   * Manually execute a workflow (triggers the manual trigger node)
   * See: https://docs.n8n.io/api/
   */
  async executeWorkflow(workflowId: string): Promise<void> {
    try {
      console.log(`▶️ Executing n8n workflow manually:`, { workflowId });
      // Use the workflow execution endpoint - POST /workflows/{id}/run
      await this.request<void>("POST", `/workflows/${workflowId}/run`);
      console.log(`✅ n8n workflow execution triggered successfully:`, { workflowId });
    } catch (error) {
      console.error(`❌ Error executing n8n workflow:`, {
        workflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to execute n8n workflow: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const n8nClient = new N8nClient();
