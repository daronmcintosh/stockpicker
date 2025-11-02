#!/usr/bin/env tsx
/**
 * Script to sync n8n workflows from JSON files
 * 
 * This script:
 * - Checks if workflows with the same name already exist
 * - Updates existing workflows instead of creating duplicates
 * - Creates workflows that don't exist yet
 * 
 * Usage:
 *   npx tsx apiserver/src/scripts/sync-workflows.ts
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { n8nClient } from "../services/n8nClient.js";

interface WorkflowFile {
  name: string;
  content: unknown;
}

async function waitForN8n(maxRetries = 30, delayMs = 2000): Promise<void> {
  console.log("⏳ Waiting for n8n API to be ready...");
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      await n8nClient.listWorkflows(true); // Silent mode for health check
      console.log("✅ n8n API is ready!");
      return;
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`   Attempt ${i + 1}/${maxRetries} - waiting ${delayMs}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else {
        throw new Error(`n8n API not ready after ${maxRetries} attempts`);
      }
    }
  }
}

async function loadWorkflowFiles(workflowsDir: string): Promise<WorkflowFile[]> {
  try {
    const files = readdirSync(workflowsDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const filePath = join(workflowsDir, file);
        const content = JSON.parse(readFileSync(filePath, "utf-8"));
        return {
          name: content.name,
          content,
        };
      });
    
    return files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`ℹ️  Workflows directory not found: ${workflowsDir}`);
      return [];
    }
    throw error;
  }
}

async function syncWorkflows(workflowsDir: string): Promise<void> {
  try {
    console.log("🚀 Starting workflow sync...");
    // Wait for n8n to be ready
    await waitForN8n();

    // Load workflow files
    console.log(`📂 Loading workflows from: ${workflowsDir}`);
    const workflowFiles = await loadWorkflowFiles(workflowsDir);
    
    if (workflowFiles.length === 0) {
      console.log("ℹ️  No workflow files found to sync");
      return;
    }

    console.log(`📋 Found ${workflowFiles.length} workflow file(s):`);
    workflowFiles.forEach((wf) => {
      console.log(`   - ${wf.name}`);
    });

    // Get existing workflows
    const existingWorkflows = await n8nClient.listWorkflows(true); // Silent mode
    console.log(`\n📊 Found ${existingWorkflows.length} existing workflow(s) in n8n`);

    // Sync each workflow
    for (const workflowFile of workflowFiles) {
      // Find ALL workflows with this name (handle duplicates)
      const matchingWorkflows = existingWorkflows.filter(
        (w) => w.name === workflowFile.name
      );

      if (matchingWorkflows.length > 0) {
        console.log(`\n🔄 Found ${matchingWorkflows.length} workflow(s) named "${workflowFile.name}"`);
        
        // Check if any are active (we'll preserve active status)
        const wasActive = matchingWorkflows.some((w) => w.active);
        const activeCount = matchingWorkflows.filter((w) => w.active).length;
        
        if (matchingWorkflows.length > 1) {
          console.log(`   ⚠️  Multiple duplicates found - will delete all and create one clean copy`);
        }
        
        // Delete ALL matching workflows (handles duplicates)
        for (const existingWorkflow of matchingWorkflows) {
          try {
            console.log(`   Deleting workflow ID: ${existingWorkflow.id} (active: ${existingWorkflow.active})`);
            await n8nClient.deleteWorkflow(existingWorkflow.id);
          } catch (error) {
            console.error(`   ⚠️  Failed to delete workflow ${existingWorkflow.id}:`, 
              error instanceof Error ? error.message : String(error));
          }
        }
        
        // Wait a moment for deletions to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
        
        // Create the new workflow from JSON
        try {
          console.log(`   Creating new workflow from JSON...`);
          const created = await n8nClient.createWorkflow(workflowFile.content);
          
          // Reactivate if any of the old ones were active
          if (wasActive) {
            console.log(`   Reactivating workflow (${activeCount} of ${matchingWorkflows.length} were active)...`);
            await n8nClient.activateWorkflow(created.id);
          }
          
          console.log(`✅ Successfully updated workflow: "${workflowFile.name}" (${wasActive ? 'active' : 'inactive'})`);
        } catch (error) {
          console.error(`❌ Error creating workflow "${workflowFile.name}":`, 
            error instanceof Error ? error.message : String(error));
        }
      } else {
        console.log(`\n➕ Creating new workflow: "${workflowFile.name}"`);
        try {
          const created = await n8nClient.createWorkflow(workflowFile.content);
          console.log(`✅ Successfully created workflow: "${created.name}" (ID: ${created.id})`);
        } catch (error) {
          console.error(`❌ Error creating workflow "${workflowFile.name}":`, 
            error instanceof Error ? error.message : String(error));
        }
      }
    }

    console.log("\n✅ Workflow sync completed!");
  } catch (error) {
    console.error("❌ Error syncing workflows:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Export the function for use by the API server
export { syncWorkflows };

// If run directly (not imported), execute the sync
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  // Get workflows directory from command line or use default
  const workflowsDir = process.argv[2] || "/tmp/workflows";
  syncWorkflows(workflowsDir).catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
}

