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

          // If using jsonBody, ensure specifyBody is set and bodyParameters is removed
          // n8n will auto-convert to bodyParameters if both exist or contentType is missing
          if (
            node.parameters.jsonBody &&
            (node.parameters.contentType === "json" || node.parameters.bodyContentType === "json")
          ) {
            // Set specifyBody to "json" if not already set
            if (!node.parameters.specifyBody) {
              (node.parameters as Record<string, unknown>).specifyBody = "json";
            }
            // Ensure contentType is set (may be bodyContentType in older versions)
            if (node.parameters.bodyContentType && !node.parameters.contentType) {
              (node.parameters as Record<string, unknown>).contentType =
                node.parameters.bodyContentType;
              (node.parameters as Record<string, unknown>).bodyContentType = undefined;
            }
            // Remove bodyParameters to avoid n8n auto-converting jsonBody to bodyParameters
            (node.parameters as Record<string, unknown>).bodyParameters = undefined;
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
 * Normalize workflow for comparison by removing fields that don't affect functionality
 * This allows us to detect meaningful differences between workflows
 */
function normalizeWorkflowForComparison(
  workflow: Record<string, unknown>
): Record<string, unknown> {
  const normalized = JSON.parse(JSON.stringify(workflow));

  // Remove metadata fields that don't affect workflow functionality
  // Use delete instead of undefined to completely remove fields
  const fieldsToRemove = [
    "id",
    "active",
    "versionId",
    "meta",
    "createdAt",
    "updatedAt",
    "updatedBy",
    "ownerId",
    "isArchived",
    "pinData",
    "shared",
    "staticData",
    "triggerCount",
    "note", // UI-only field at workflow level
    "tags", // UI-only metadata, doesn't affect workflow functionality
  ];

  for (const field of fieldsToRemove) {
    delete normalized[field];
  }

  // Normalize nodes - keep only meaningful functional fields, ignore IDs and positions
  if (Array.isArray(normalized.nodes)) {
    normalized.nodes = normalized.nodes.map((node: unknown) => {
      if (typeof node === "object" && node !== null) {
        const nodeObj = node as Record<string, unknown>;

        // Extract only meaningful functional fields
        let normalizedParams = nodeObj.parameters as Record<string, unknown> | undefined;

        // Normalize HTTP Request node parameters to handle legacy field names
        if (
          nodeObj.type === "n8n-nodes-base.httpRequest" &&
          normalizedParams &&
          typeof normalizedParams === "object"
        ) {
          normalizedParams = { ...normalizedParams };

          // Normalize bodyContentType (legacy) to contentType (new)
          if (normalizedParams.bodyContentType && !normalizedParams.contentType) {
            normalizedParams.contentType = normalizedParams.bodyContentType;
          }
          // Remove legacy bodyContentType if contentType exists (they're the same)
          normalizedParams.bodyContentType = undefined;

          // Normalize specifyBody - set consistently based on body type
          if (normalizedParams.jsonBody && normalizedParams.contentType === "json") {
            // If using jsonBody with json contentType, specifyBody should be "json"
            normalizedParams.specifyBody = "json";
          } else if (!normalizedParams.jsonBody && !normalizedParams.body) {
            // If no body at all, remove specifyBody (not needed)
            normalizedParams.specifyBody = undefined;
          }
          // Otherwise keep specifyBody as-is if it exists
        }

        const normalizedNode: Record<string, unknown> = {
          name: nodeObj.name,
          type: nodeObj.type,
          typeVersion: nodeObj.typeVersion,
          parameters: normalizedParams,
          disabled: nodeObj.disabled,
          executeOnce: nodeObj.executeOnce,
          continueOnFail: nodeObj.continueOnFail,
          retryOnFail: nodeObj.retryOnFail,
        };

        // Handle credentials: normalize credential references to use names only (ignore IDs)
        if (nodeObj.credentials && typeof nodeObj.credentials === "object") {
          const creds = nodeObj.credentials as Record<string, unknown>;
          const normalizedCreds: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(creds)) {
            if (value && typeof value === "object") {
              const cred = value as Record<string, unknown>;
              // Keep credential name (functional), ignore ID (can change without affecting functionality)
              normalizedCreds[key] = { name: cred.name };
            }
          }
          if (Object.keys(normalizedCreds).length > 0) {
            normalizedNode.credentials = normalizedCreds;
          }
        }

        return normalizedNode;
      }
      return node;
    });

    // Sort nodes by name for consistent comparison (ignore node order)
    normalized.nodes.sort((a: unknown, b: unknown) => {
      const aName = typeof a === "object" && a !== null && "name" in a ? String(a.name) : "";
      const bName = typeof b === "object" && b !== null && "name" in b ? String(b.name) : "";
      return aName.localeCompare(bName);
    });
  }

  // Normalize connections - sort keys for consistent comparison
  if (normalized.connections && typeof normalized.connections === "object") {
    const sortedConnections: Record<string, unknown> = {};
    const connKeys = Object.keys(normalized.connections).sort();
    for (const key of connKeys) {
      sortedConnections[key] = normalized.connections[key];
    }
    normalized.connections = sortedConnections;
  }

  return normalized;
}

/**
 * Compare two workflows to detect if they have meaningful differences
 * Returns true if workflows are different (excluding metadata)
 */
export function workflowsAreDifferent(
  workflow1: N8nWorkflow | N8nFullWorkflow,
  workflow2: N8nWorkflow | N8nFullWorkflow,
  debug = false
): boolean {
  // Normalize both workflows for comparison
  const normalized1 = normalizeWorkflowForComparison(
    workflow1 as unknown as Record<string, unknown>
  );
  const normalized2 = normalizeWorkflowForComparison(
    workflow2 as unknown as Record<string, unknown>
  );

  const json1 = JSON.stringify(normalized1);
  const json2 = JSON.stringify(normalized2);
  const areDifferent = json1 !== json2;

  if (debug || areDifferent) {
    console.log(`🔍 Workflow comparison debug:`, {
      workflow1Name: workflow1.name,
      workflow2Name: workflow2.name,
      areDifferent,
      normalized1Keys: Object.keys(normalized1).sort(),
      normalized2Keys: Object.keys(normalized2).sort(),
      nodeCount1: Array.isArray(normalized1.nodes) ? normalized1.nodes.length : 0,
      nodeCount2: Array.isArray(normalized2.nodes) ? normalized2.nodes.length : 0,
    });

    if (areDifferent) {
      // Try to find specific differences
      const differences: string[] = [];

      // Compare names
      if (normalized1.name !== normalized2.name) {
        differences.push(`Name: "${normalized1.name}" vs "${normalized2.name}"`);
      }

      // Compare node counts
      const nodes1 = Array.isArray(normalized1.nodes) ? normalized1.nodes : [];
      const nodes2 = Array.isArray(normalized2.nodes) ? normalized2.nodes : [];
      if (nodes1.length !== nodes2.length) {
        differences.push(`Node count: ${nodes1.length} vs ${nodes2.length}`);
      } else {
        // Compare nodes by name and type
        for (let i = 0; i < nodes1.length; i++) {
          const node1 = nodes1[i] as Record<string, unknown>;
          const node2 = nodes2[i] as Record<string, unknown>;
          if (node1.name !== node2.name || node1.type !== node2.type) {
            differences.push(
              `Node ${i}: name="${node1.name}" type="${node1.type}" vs name="${node2.name}" type="${node2.type}"`
            );
          } else {
            // Compare parameters
            const params1 = JSON.stringify(node1.parameters || {});
            const params2 = JSON.stringify(node2.parameters || {});
            if (params1 !== params2) {
              differences.push(`Node "${node1.name}" parameters differ`);
              // Show param keys that differ
              const paramKeys1 = Object.keys((node1.parameters as Record<string, unknown>) || {});
              const paramKeys2 = Object.keys((node2.parameters as Record<string, unknown>) || {});
              const uniqueKeys = [
                ...new Set([
                  ...paramKeys1.filter((k) => !paramKeys2.includes(k)),
                  ...paramKeys2.filter((k) => !paramKeys1.includes(k)),
                ]),
              ];
              if (uniqueKeys.length > 0) {
                differences.push(`  - Parameter keys that differ: ${uniqueKeys.join(", ")}`);
              }
            }
          }
        }
      }

      // Compare connections
      const conn1 = JSON.stringify(normalized1.connections || {});
      const conn2 = JSON.stringify(normalized2.connections || {});
      if (conn1 !== conn2) {
        differences.push(`Connections differ`);
      }

      // Compare settings
      const settings1 = JSON.stringify(normalized1.settings || {});
      const settings2 = JSON.stringify(normalized2.settings || {});
      if (settings1 !== settings2) {
        differences.push(`Settings differ`);
      }

      console.log(`📊 Detected differences:`, {
        count: differences.length,
        differences: differences.slice(0, 10), // Limit to first 10 to avoid log spam
      });

      // If no differences found but JSON is different, there might be subtle differences
      // Log the full comparison to help debug
      if (differences.length === 0) {
        console.log(`⚠️  No specific differences found, but workflows differ. Analyzing...`);

        // Compare field by field
        const keys1 = new Set(Object.keys(normalized1));
        const keys2 = new Set(Object.keys(normalized2));
        const onlyIn1 = [...keys1].filter((k) => !keys2.has(k));
        const onlyIn2 = [...keys2].filter((k) => !keys1.has(k));

        if (onlyIn1.length > 0 || onlyIn2.length > 0) {
          console.log(`📋 Fields only in workflow 1:`, onlyIn1);
          console.log(`📋 Fields only in workflow 2:`, onlyIn2);
        }

        // Deep compare if structures seem similar
        try {
          const parsed1 = JSON.parse(json1);
          const parsed2 = JSON.parse(json2);

          // Check if it's just ordering differences in nodes
          if (
            Array.isArray(parsed1.nodes) &&
            Array.isArray(parsed2.nodes) &&
            parsed1.nodes.length === parsed2.nodes.length
          ) {
            const nodeNames1 = parsed1.nodes.map((n: Record<string, unknown>) => n.name).sort();
            const nodeNames2 = parsed2.nodes.map((n: Record<string, unknown>) => n.name).sort();
            if (JSON.stringify(nodeNames1) === JSON.stringify(nodeNames2)) {
              console.log(`ℹ️  Node names match, might be parameter differences`);
              // Compare each node's parameters
              for (let i = 0; i < parsed1.nodes.length; i++) {
                const node1 = parsed1.nodes[i] as Record<string, unknown>;
                const node2 = parsed2.nodes[i] as Record<string, unknown>;
                const params1 = JSON.stringify(node1.parameters || {});
                const params2 = JSON.stringify(node2.parameters || {});
                if (params1 !== params2) {
                  console.log(`   Node "${node1.name}" parameters differ:`);
                  console.log(
                    `     Workflow 1 params keys:`,
                    Object.keys((node1.parameters as Record<string, unknown>) || {})
                  );
                  console.log(
                    `     Workflow 2 params keys:`,
                    Object.keys((node2.parameters as Record<string, unknown>) || {})
                  );
                }
              }
            }
          }
        } catch (_e) {
          // Ignore parse errors
        }

        console.log(
          `📄 Sample normalized workflow 1 (first 1000 chars):`,
          json1.substring(0, 1000)
        );
        console.log(
          `📄 Sample normalized workflow 2 (first 1000 chars):`,
          json2.substring(0, 1000)
        );
      }
    }
  }

  return areDifferent;
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

          // For HTTP Request nodes, ensure jsonBody and bodyContentType are preserved
          if (
            filteredNode.type === "n8n-nodes-base.httpRequest" &&
            filteredNode.parameters &&
            typeof filteredNode.parameters === "object"
          ) {
            const params = filteredNode.parameters as Record<string, unknown>;
            // If jsonBody exists, ensure contentType and specifyBody are set correctly
            if (params.jsonBody && typeof params.jsonBody === "string") {
              // Use contentType (not bodyContentType) for n8n HTTP Request v4.2+
              params.contentType = "json";
              params.specifyBody = "json";
              // Remove bodyContentType if present (legacy field)
              params.bodyContentType = undefined;
              // Remove bodyParameters to avoid n8n auto-converting jsonBody to bodyParameters
              params.bodyParameters = undefined;
            }
          }

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
