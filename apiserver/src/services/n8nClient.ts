import { appConfig } from "../config.js";
import { Frequency } from "../gen/stockpicker/v1/strategy_pb.js";
import type { N8nFullWorkflow, N8nWorkflow, N8nWorkflowResponse } from "./n8nTypes.js";

/**
 * Get the current API URL from config
 */
function getCurrentApiUrl(): string {
  return appConfig.n8n.apiServerUrl || "http://apiserver:3000";
}

/**
 * Replace $env.API_URL placeholders with actual API URL
 * Since n8n env vars aren't reliable, we inject the URL directly into the workflow
 */
function injectApiUrl(workflow: N8nWorkflow): N8nWorkflow {
  const apiUrl = getCurrentApiUrl();

  // Deep clone to avoid mutating original
  const processed = JSON.parse(JSON.stringify(workflow));

  // Recursively replace $env.API_URL expressions with actual URL
  function replaceEnvVars(obj: unknown): unknown {
    if (typeof obj === "string") {
      // Replace n8n expression syntax: {{ $env.API_URL }} or ={{ $env.API_URL }}
      // Also replace any old hardcoded URLs with the new one
      return (
        obj
          .replace(/\{\{\s*\$env\.API_URL\s*\}\}/g, apiUrl)
          .replace(/=\{\{\s*\$env\.API_URL\s*\}\}/g, apiUrl)
          // Replace common API URL patterns (http://apiserver:3000, http://localhost:3001, etc.)
          .replace(
            /https?:\/\/[^\/\s"']+(\/stockpicker\.v1\.(Strategy|Prediction)Service\/)/g,
            `${apiUrl}$1`
          )
      );
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

/**
 * Inject credential references into HTTP request nodes instead of embedding tokens
 * This allows n8n workflows to use credential resources securely
 */
function injectCredentialReference(
  workflow: N8nWorkflow,
  credentialId: string,
  credentialName: string
): N8nWorkflow {
  // Deep clone to avoid mutating original
  const processed = JSON.parse(JSON.stringify(workflow));

  // Find all HTTP request nodes that call our API and inject credential reference
  if (Array.isArray(processed.nodes)) {
    for (const node of processed.nodes) {
      if (node.type === "n8n-nodes-base.httpRequest" && node.parameters) {
        // Check if this node calls our API (contains stockpicker.v1)
        const url = node.parameters.url as string;
        if (url?.includes("stockpicker.v1")) {
          // Remove Authorization header if present (will use credential instead)
          if (node.parameters.headerParameters?.parameters) {
            node.parameters.headerParameters.parameters =
              node.parameters.headerParameters.parameters.filter(
                (p: { name: string }) => p.name !== "Authorization"
              );
          }

          // Add credential reference to the node
          // n8n HTTP Request node uses credentials field for credential references
          if (!node.credentials) {
            node.credentials = {};
          }
          node.credentials.httpHeaderAuth = {
            id: credentialId,
            name: credentialName,
          };

          // Set authentication to use generic credential type with httpHeaderAuth
          // n8n requires: authentication = "genericCredentialType" and genericAuthType = "httpHeaderAuth"
          node.parameters.authentication = "genericCredentialType";
          node.parameters.genericAuthType = "httpHeaderAuth";
        }
      }
    }
  }

  return processed;
}

/**
 * Check if a workflow needs API URL updates by scanning for URLs in nodes
 * Returns true if any URL in the workflow doesn't match the current API URL
 */
function needsApiUrlUpdate(workflow: N8nFullWorkflow): boolean {
  const currentApiUrl = getCurrentApiUrl();
  const workflowJson = JSON.stringify(workflow);

  // Check if workflow contains old API URLs (not using current URL and not using $env.API_URL)
  // We'll look for common patterns that indicate a hardcoded API URL
  const urlPatterns = [
    /http:\/\/apiserver:3000/,
    /http:\/\/localhost:\d+/,
    /https?:\/\/[^\/\s"']+\/stockpicker\.v1\.(Strategy|Prediction)Service/,
  ];

  // If workflow uses $env.API_URL, it doesn't need updating (n8n will resolve it)
  if (workflowJson.includes("$env.API_URL")) {
    return false;
  }

  // Check if any old URL patterns exist
  for (const pattern of urlPatterns) {
    if (pattern.test(workflowJson)) {
      // Check if it's not the current URL
      if (!workflowJson.includes(currentApiUrl)) {
        return true;
      }
    }
  }

  return false;
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

/**
 * Filter workflow object to only include fields that n8n API accepts
 * n8n API only accepts: name, nodes, connections, settings (optional), staticData (optional), tags (optional)
 * It does NOT accept: id, active, versionId, meta, createdAt, updatedAt, note, etc.
 */
function filterWorkflowForApi(workflow: Record<string, unknown>): Record<string, unknown> {
  // Filter nodes to remove unsupported fields (like "note" which is UI-only)
  // Nodes can have: id, name, type, typeVersion, position, parameters, disabled, executeOnce, continueOnFail, retryOnFail
  // They should NOT have: note, webhookId, etc.
  const filteredNodes = Array.isArray(workflow.nodes)
    ? workflow.nodes.map((node: unknown) => {
        if (typeof node === "object" && node !== null) {
          const nodeObj = node as Record<string, unknown>;
          // Remove unsupported fields from nodes
          const { note, webhookId, ...filteredNode } = nodeObj;
          return filteredNode;
        }
        return node;
      })
    : workflow.nodes;

  // Whitelist approach: only include accepted fields
  const requestBody: Record<string, unknown> = {
    name: workflow.name,
    nodes: filteredNodes,
    connections: workflow.connections,
  };

  // Include optional fields only if they exist and are not empty
  if (workflow.settings) {
    requestBody.settings = workflow.settings;
  }
  if (workflow.staticData) {
    requestBody.staticData = workflow.staticData;
  }
  // Tags must be an array with at least one element (empty arrays might cause issues)
  if (workflow.tags && Array.isArray(workflow.tags) && workflow.tags.length > 0) {
    requestBody.tags = workflow.tags;
  }

  return requestBody;
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
   * Create or update an HTTP Header Auth credential in n8n
   * This stores the user token securely as a credential resource
   * @param credentialName - Unique name for the credential (typically strategy ID or user ID)
   * @param userToken - The JWT token to store
   * @returns The credential ID
   */
  async createOrUpdateCredential(credentialName: string, userToken: string): Promise<string> {
    try {
      console.log(`🔐 Creating/updating n8n credential:`, { credentialName });

      // Try to get existing credential first
      let existingCredentialId: string | null = null;
      try {
        const credentials = await this.request<Array<{ id: string; name: string }>>(
          "GET",
          "/credentials"
        );
        const existing = credentials.find((c) => c.name === credentialName);
        if (existing) {
          existingCredentialId = existing.id;
          console.log(`📋 Found existing credential:`, {
            credentialId: existingCredentialId,
            credentialName,
          });
        }
      } catch (_error) {
        // Credential doesn't exist yet, will create new one
        console.log(`ℹ️ No existing credential found, creating new one`);
      }

      // HTTP Header Auth credential structure for n8n
      const credentialData = {
        name: credentialName,
        type: "httpHeaderAuth",
        data: {
          name: "Authorization",
          value: `Bearer ${userToken}`,
        },
      };

      if (existingCredentialId) {
        // Update existing credential
        const response = await this.request<{ id: string }>(
          "PUT",
          `/credentials/${existingCredentialId}`,
          credentialData
        );
        console.log(`✅ Updated n8n credential:`, {
          credentialId: response.id,
          credentialName,
        });
        return response.id;
      }
      // Create new credential
      const response = await this.request<{ id: string }>("POST", "/credentials", credentialData);
      console.log(`✅ Created n8n credential:`, {
        credentialId: response.id,
        credentialName,
      });
      return response.id;
    } catch (error) {
      console.error(`❌ Error creating/updating n8n credential:`, {
        credentialName,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to create/update credential: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
    frequency: Frequency,
    userToken: string
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
        // Note: This node handles empty responses gracefully - if no predictions exist,
        // it still continues to the budget check which uses currentMonthSpent from the strategy
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
            specifyBody: "json", // Use JSON body format for Connect RPC
            jsonBody:
              "={{ {\n  strategyId: $node['Get Strategy'].json.strategy.id,\n  status: \"PREDICTION_STATUS_ACTIVE\"\n} }}", // Use string enum value for status
            options: {
              // Handle empty responses gracefully - return empty array if no predictions
              response: {
                responseFormat: "json",
                neverError: true, // Don't fail on 200 responses, even if predictions array is empty
              },
            },
            continueOnFail: false, // Set to false to see errors, but we have neverError for 200 responses
          },
          id: "get-active-predictions",
          name: "Get Active Predictions",
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [1050, 300],
        },
        // Handle empty predictions response - normalize to ensure valid data structure
        // Uses runOnceForAllItems to handle empty inputs gracefully
        {
          parameters: {
            mode: "runOnceForAllItems",
            jsCode: `// Normalize predictions response - handle empty arrays, missing data, or errors
// The HTTP Request node might return the response directly or wrapped in json property
// API already filters by PREDICTION_STATUS_ACTIVE, so we just need to extract the array

let predictions = [];
let responseData = null;

// Handle different input scenarios
if ($input.all && $input.all.length > 0) {
  // We have items - get the first item
  responseData = $input.all[0].json;
} else if ($input.item) {
  // Single item mode
  responseData = $input.item.json;
} else if ($json) {
  // Direct json access
  responseData = $json;
}

// Extract predictions from response
if (responseData) {
  // Check if response is wrapped (from HTTP Request node)
  if (responseData.json && responseData.json.predictions) {
    // Response is wrapped: { json: { predictions: [...] } }
    predictions = responseData.json.predictions || [];
  } else if (responseData.predictions) {
    // Response is direct: { predictions: [...] }
    predictions = responseData.predictions || [];
  } else if (Array.isArray(responseData)) {
    // Response might be array directly
    predictions = responseData;
  }
}

// Get strategy from previous node
const strategy = $node['Get Strategy'].json.strategy;

// Always return valid structure, even if predictions array is empty or no input received
const result = {
  json: {
    predictions: Array.isArray(predictions) ? predictions : [],
    strategy: strategy,
    hasPredictions: predictions.length > 0,
    predictionCount: predictions.length
  }
};

// Return array with single item (required by n8n)
return [result];`,
          },
          id: "normalize-predictions",
          name: "Normalize Predictions",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [1050, 500],
        },
        // Check Budget
        // Handles cases when there are no active predictions (currentMonthSpent will be 0 or null)
        // Compares currentMonthSpent (defaults to 0 if null/undefined) < monthlyBudget
        // Uses strategy data from Normalize Predictions output (current item)
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
                  // Use strategy from current item (Normalize Predictions output) or fall back to Get Strategy node
                  // Use nullish coalescing to default to 0 if currentMonthSpent is null/undefined (no predictions)
                  leftValue:
                    "={{ $json.strategy?.currentMonthSpent ?? $node['Get Strategy'].json.strategy.currentMonthSpent ?? 0 }}",
                  rightValue:
                    "={{ $json.strategy?.monthlyBudget ?? $node['Get Strategy'].json.strategy.monthlyBudget ?? 0 }}",
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
        // Budget Exhausted - Log why workflow stopped
        {
          parameters: {
            mode: "runOnceForEachItem",
            jsCode: `// Log budget exhaustion details
const strategy = $node['Get Strategy'].json.strategy;
const currentMonthSpent = strategy.currentMonthSpent || 0;
const monthlyBudget = strategy.monthlyBudget || 0;
const remaining = monthlyBudget - currentMonthSpent;

console.log('⚠️ Budget Exhausted:', {
  strategyId: strategy.id,
  strategyName: strategy.name,
  currentMonthSpent: currentMonthSpent,
  monthlyBudget: monthlyBudget,
  remaining: remaining,
  message: remaining <= 0 ? 'No budget remaining' : 'Budget limit reached'
});

return [{
  json: {
    message: 'Budget exhausted - workflow stopped',
    currentMonthSpent,
    monthlyBudget,
    remaining,
    strategyId: strategy.id,
    strategyName: strategy.name
  }
}];`,
          },
          id: "budget-exhausted",
          name: "Budget Exhausted",
          type: "n8n-nodes-base.code",
          typeVersion: 2,
          position: [1250, 500],
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
          main: [[{ node: "Normalize Predictions", type: "main", index: 0 }]],
        },
        "Normalize Predictions": {
          main: [[{ node: "Check Budget", type: "main", index: 0 }]],
        },
        "Check Budget": {
          main: [
            [{ node: "Get Top Stocks (Alpha Vantage)", type: "main", index: 0 }],
            [{ node: "Budget Exhausted", type: "main", index: 0 }], // False path - log budget details
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
      // Step 1: Create or update credential with user token
      const credentialName = `Strategy-${strategyId}-Auth`;
      const credentialId = await this.createOrUpdateCredential(credentialName, userToken);

      // Step 2: Inject API URL and credential reference into workflow
      let processedWorkflow = injectApiUrl(workflow);
      processedWorkflow = injectCredentialReference(
        processedWorkflow,
        credentialId,
        credentialName
      );

      console.log(`📝 Creating n8n workflow for strategy:`, {
        strategyId,
        strategyName,
        frequency: frequencyToName(frequency),
        cronExpression: frequencyToCron(frequency),
        workflowName: workflow.name,
        nodeCount: workflow.nodes.length,
        apiUrl: appConfig.n8n.apiServerUrl,
        credentialId,
        credentialName,
      });
      const response = await this.request<N8nWorkflowResponse>(
        "POST",
        "/workflows",
        processedWorkflow
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
   * Note: n8n doesn't support PATCH, so we fetch the full workflow, apply updates, and PUT it back
   */
  async updateWorkflow(
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
      const existingWorkflow = await this.getFullWorkflow(workflowId);

      // Merge updates into the existing workflow
      const updatedWorkflow: N8nFullWorkflow = {
        ...existingWorkflow,
        ...updates,
        id: workflowId,
      };

      // Pass strategyId to updateFullWorkflow for credential updates
      const response = await this.updateFullWorkflow(
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
    try {
      console.log(`🔄 Rebuilding workflow from latest template:`, {
        workflowId,
        strategyId,
        strategyName,
        frequency: frequencyToName(frequency),
      });

      // Get existing workflow to preserve active status
      const existingWorkflow = await this.getFullWorkflow(workflowId);
      const wasActive = existingWorkflow.active;

      // Create new workflow structure from latest template
      const newWorkflow = await this.createStrategyWorkflow(
        strategyId,
        strategyName,
        frequency,
        userToken
      );

      // Delete old workflow
      await this.deleteWorkflow(workflowId);
      console.log(`🗑️ Deleted old workflow:`, { workflowId });

      // The new workflow is created but inactive by default
      // Restore active status if it was active before
      if (wasActive) {
        await this.activateWorkflow(newWorkflow.id);
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
      const response = await this.updateWorkflow(workflowId, updates, userToken, strategyId);
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
   * Update API URLs in an existing workflow if they've changed
   * This is more efficient than recreating the workflow
   */
  async updateWorkflowApiUrl(
    workflowId: string,
    userToken?: string,
    strategyId?: string
  ): Promise<N8nWorkflowResponse | null> {
    try {
      // Get the full workflow
      const workflow = await this.getFullWorkflow(workflowId);

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
      const response = await this.updateFullWorkflow(
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
      const workflowData = workflowWithApiUrl as unknown as Record<string, unknown>;

      // Filter workflow to only include API-accepted fields
      const requestBody = filterWorkflowForApi(workflowData);

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
        const credentialId = await this.createOrUpdateCredential(credentialName, userToken);

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

      console.log(`📝 Filtered workflow fields for update:`, {
        fields: Object.keys(requestBody),
        nodeCount: Array.isArray(requestBody.nodes) ? requestBody.nodes.length : 0,
      });

      // Use PUT to replace the entire workflow
      const response = await this.request<N8nWorkflowResponse>(
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
   * Manually execute a workflow (triggers the manual trigger node)
   * See: https://docs.n8n.io/api/
   *
   * Note: n8n workflow execution can be done via:
   * - POST /workflows/{id}/activate (to activate and run)
   * - POST /executions/workflow/{id} (alternative endpoint)
   * - Using webhook trigger (if configured)
   */
  async executeWorkflow(workflowId: string): Promise<void> {
    try {
      console.log(`▶️ Executing n8n workflow manually:`, { workflowId, baseURL: this.baseURL });

      // First verify the workflow exists and get its details
      let workflow: N8nWorkflowResponse;
      try {
        workflow = await this.getWorkflow(workflowId);
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
          const allWorkflows = await this.listWorkflows(true);
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
        await this.request<void>("POST", `/workflows/${workflowId}/run`);
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
              await this.request<void>("POST", `/workflows/${workflowId}/activate`);
              console.log(`✅ Workflow activated`);
            } catch (activateError) {
              console.error(`❌ Failed to activate workflow:`, activateError);
            }
          }

          // Try the executions endpoint instead
          try {
            console.log(`🔄 Trying executions endpoint...`);
            await this.request<void>("POST", `/executions/workflow/${workflowId}`);
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
        baseURL: this.baseURL,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to execute n8n workflow: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const n8nClient = new N8nClient();
