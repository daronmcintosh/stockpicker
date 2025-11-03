import { appConfig } from "../../config.js";
import { Frequency } from "../../gen/stockpicker/v1/strategy_pb.js";
import type { N8nFullWorkflow, N8nWorkflow } from "../n8nTypes.js";

/**
 * Get the current API URL from config
 */
export function getCurrentApiUrl(): string {
  return appConfig.n8n.apiServerUrl || "http://apiserver:3000";
}

/**
 * Replace $env.API_URL placeholders with actual API URL
 * Since n8n env vars aren't reliable, we inject the URL directly into the workflow
 */
export function injectApiUrl(workflow: N8nWorkflow): N8nWorkflow {
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
export function injectCredentialReference(
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
export function needsApiUrlUpdate(workflow: N8nFullWorkflow): boolean {
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

/**
 * Helper to get auth headers (n8n API requires X-N8N-API-KEY header)
 * See: https://docs.n8n.io/api/authentication/
 */
export function getAuthHeaders(): Record<string, string> {
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

/**
 * Helper to convert frequency enum to cron expression
 */
export function frequencyToCron(frequency: Frequency): string {
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

/**
 * Helper to convert frequency enum to name string
 */
export function frequencyToName(frequency: Frequency): string {
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
export function filterWorkflowForApi(workflow: Record<string, unknown>): Record<string, unknown> {
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
