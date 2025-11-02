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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { n8nClient } from "../services/n8nClient.js";
import type { N8nWorkflow } from "../services/n8nTypes.js";

interface WorkflowFile {
  name: string;
  content: N8nWorkflow;
}

async function waitForN8n(maxRetries = 30, delayMs = 2000): Promise<void> {
  console.log("⏳ Waiting for n8n API to be ready...");

  for (let i = 0; i < maxRetries; i++) {
    try {
      await n8nClient.listWorkflows(true); // Silent mode for health check
      console.log("✅ n8n API is ready!");
      return;
    } catch (_error) {
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
    const files: WorkflowFile[] = readdirSync(workflowsDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const filePath = join(workflowsDir, file);
        const rawContent = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;

        // Ensure required fields exist
        const content: N8nWorkflow = {
          ...rawContent,
          name: rawContent.name as string,
          nodes: Array.isArray(rawContent.nodes) ? rawContent.nodes : [],
          connections: (rawContent.connections as Record<string, unknown>) ?? {},
        } as N8nWorkflow;

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
    for (const wf of workflowFiles) {
      console.log(`   - ${wf.name}`);
    }

    // Get existing workflows
    const existingWorkflows = await n8nClient.listWorkflows(true); // Silent mode
    console.log(`\n📊 Found ${existingWorkflows.length} existing workflow(s) in n8n`);

    // Track which workflows were successfully created
    const createdWorkflows: Array<{ name: string; id: string }> = [];
    const failedWorkflows: Array<{ name: string; error: string }> = [];

    // Sync each workflow
    for (const workflowFile of workflowFiles) {
      // Find ALL workflows with this name (handle duplicates)
      const matchingWorkflows = existingWorkflows.filter((w) => w.name === workflowFile.name);

      if (matchingWorkflows.length > 0) {
        console.log(
          `\n🔄 Found ${matchingWorkflows.length} workflow(s) named "${workflowFile.name}"`
        );

        // Check if any are active (we'll preserve active status)
        const _wasActive = matchingWorkflows.some((w) => w.active);
        const _activeCount = matchingWorkflows.filter((w) => w.active).length;

        if (matchingWorkflows.length > 1) {
          console.log(
            `   ⚠️  Multiple duplicates found - will delete all and create one clean copy`
          );
        }

        // Delete ALL matching workflows (handles duplicates)
        for (const existingWorkflow of matchingWorkflows) {
          try {
            console.log(
              `   Deleting workflow ID: ${existingWorkflow.id} (active: ${existingWorkflow.active})`
            );
            await n8nClient.deleteWorkflow(existingWorkflow.id);
          } catch (error) {
            console.error(
              `   ⚠️  Failed to delete workflow ${existingWorkflow.id}:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        }

        // Wait a moment for deletions to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Create the new workflow from JSON
        try {
          const created = await n8nClient.createWorkflow(workflowFile.content);

          // Wait a moment for workflow to be fully created
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Validate workflow was created by checking if it exists
          const allWorkflows = await n8nClient.listWorkflows(true);
          const verified = allWorkflows.find((w) => w.id === created.id && w.name === created.name);

          if (!verified) {
            throw new Error(
              `Workflow "${created.name}" was not found in n8n after creation. Creation may have failed silently.`
            );
          }

          console.log(`   ✅ Verified workflow exists in n8n (ID: ${verified.id})`);

          // Always activate workflow after creation/update
          console.log(`   Activating workflow...`);
          await n8nClient.activateWorkflow(created.id);

          console.log(`✅ Successfully updated workflow: "${workflowFile.name}" (active)`);
          createdWorkflows.push({ name: workflowFile.name, id: created.id });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Error creating workflow "${workflowFile.name}":`, errorMessage);
          if (error instanceof Error && error.stack) {
            console.error(`   Stack trace:`, error.stack);
          }
          failedWorkflows.push({ name: workflowFile.name, error: errorMessage });
          // Continue with next workflow instead of stopping
        }
      } else {
        console.log(`\n➕ Creating new workflow: "${workflowFile.name}"`);
        try {
          const created = await n8nClient.createWorkflow(workflowFile.content);

          // Wait a moment for workflow to be fully created
          await new Promise((resolve) => setTimeout(resolve, 1000));

          // Validate workflow was created by checking if it exists
          const allWorkflows = await n8nClient.listWorkflows(true);
          const verified = allWorkflows.find((w) => w.id === created.id && w.name === created.name);

          if (!verified) {
            throw new Error(
              `Workflow "${created.name}" was not found in n8n after creation. Creation may have failed silently.`
            );
          }

          console.log(`   ✅ Verified workflow exists in n8n (ID: ${verified.id})`);

          // Always activate workflow after creation
          console.log(`   Activating workflow...`);
          await n8nClient.activateWorkflow(created.id);

          console.log(
            `✅ Successfully created workflow: "${created.name}" (ID: ${created.id}, active)`
          );
          createdWorkflows.push({ name: workflowFile.name, id: created.id });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`❌ Error creating workflow "${workflowFile.name}":`, errorMessage);
          if (error instanceof Error && error.stack) {
            console.error(`   Stack trace:`, error.stack);
          }
          failedWorkflows.push({ name: workflowFile.name, error: errorMessage });
          // Continue with next workflow instead of stopping
        }
      }
    }

    // Final validation summary
    console.log("\n📊 Workflow Sync Summary:");
    console.log(`   ✅ Successfully created/updated: ${createdWorkflows.length} workflow(s)`);
    for (const wf of createdWorkflows) {
      console.log(`      - "${wf.name}" (ID: ${wf.id})`);
    }

    if (failedWorkflows.length > 0) {
      console.log(`   ❌ Failed to create: ${failedWorkflows.length} workflow(s)`);
      for (const wf of failedWorkflows) {
        console.log(`      - "${wf.name}": ${wf.error}`);
      }
      console.log("\n⚠️  Some workflows failed to sync. Please check the errors above.");
    } else {
      console.log("\n✅ All workflows synced successfully!");
    }

    // Final verification: list all workflows in n8n and check against expected workflows
    console.log("\n🔍 Final verification - checking all workflows in n8n...");
    const finalWorkflows = await n8nClient.listWorkflows(true);
    const expectedNames = workflowFiles.map((wf) => wf.name);
    const foundNames = finalWorkflows.map((w) => w.name);

    const missingWorkflows = expectedNames.filter((name) => !foundNames.includes(name));
    if (missingWorkflows.length > 0) {
      console.error(`\n❌ VALIDATION FAILED: The following workflows are missing from n8n:`);
      for (const name of missingWorkflows) {
        console.error(`   - "${name}"`);
      }
      console.error(
        "\n   These workflows were expected but not found. Check the errors above for details."
      );
    } else {
      console.log(
        `✅ Validation passed: All ${expectedNames.length} expected workflow(s) found in n8n`
      );
    }

    console.log("\n✅ Workflow sync completed!");
  } catch (error) {
    console.error(
      "❌ Error syncing workflows:",
      error instanceof Error ? error.message : String(error)
    );
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
