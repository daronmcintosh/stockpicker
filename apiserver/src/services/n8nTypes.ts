/**
 * Type definitions for n8n workflow API structures
 */

/**
 * Type representing an n8n workflow node
 */
export interface N8nWorkflowNode {
  id: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  disabled?: boolean;
  executeOnce?: boolean;
  continueOnFail?: boolean;
  retryOnFail?: boolean;
  [key: string]: unknown; // Allow additional properties
}

/**
 * Type representing an n8n workflow
 * This matches the structure expected by the n8n API and workflow JSON files
 */
export interface N8nWorkflow {
  id?: string;
  name: string;
  active?: boolean; // Read-only in API - cannot be set during creation
  nodes: N8nWorkflowNode[];
  connections: Record<string, unknown>; // Required by n8n API, can be empty object {}
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
  tags?: string[];
  [key: string]: unknown; // Allow additional metadata fields
}

/**
 * Response type from n8n API when creating/updating/getting a workflow
 */
export interface N8nWorkflowResponse {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Full workflow type with required id field
 * Used when we need to ensure the workflow has an ID (e.g., for updates)
 */
export interface N8nFullWorkflow extends N8nWorkflow {
  id: string;
}
