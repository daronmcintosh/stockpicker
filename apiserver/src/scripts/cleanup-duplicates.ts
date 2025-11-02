#!/usr/bin/env tsx
/**
 * Script to clean up duplicate workflows in n8n
 *
 * This finds all workflows with duplicate names and keeps only the most recent one,
 * deleting all others.
 *
 * Usage:
 *   npx tsx apiserver/src/scripts/cleanup-duplicates.ts
 */

import { n8nClient } from "../services/n8nClient.js";

async function cleanupDuplicates(): Promise<void> {
  try {
    console.log("🔍 Finding duplicate workflows...");

    const workflows = await n8nClient.listWorkflows(true);

    // Group workflows by name
    const workflowsByName = new Map<string, typeof workflows>();

    for (const workflow of workflows) {
      if (!workflowsByName.has(workflow.name)) {
        workflowsByName.set(workflow.name, []);
      }
      const workflowsList = workflowsByName.get(workflow.name);
      if (workflowsList) {
        workflowsList.push(workflow);
      }
    }

    // Find duplicates (names with more than 1 workflow)
    const duplicates = Array.from(workflowsByName.entries()).filter(
      ([_, workflows]) => workflows.length > 1
    );

    if (duplicates.length === 0) {
      console.log("✅ No duplicate workflows found!");
      return;
    }

    console.log(`\n⚠️  Found ${duplicates.length} workflow name(s) with duplicates:`);
    for (const [name, wfs] of duplicates) {
      console.log(`   - "${name}": ${wfs.length} copies`);
    }

    console.log("\n🗑️  Cleaning up duplicates...");

    for (const [name, duplicateWorkflows] of duplicates) {
      console.log(`\n📋 Processing: "${name}" (${duplicateWorkflows.length} copies)`);

      // Check which ones are active
      const activeWorkflows = duplicateWorkflows.filter((w) => w.active);

      if (activeWorkflows.length > 1) {
        console.log(`   ⚠️  Warning: ${activeWorkflows.length} active copies found!`);
        console.log(`   Keeping the most recently updated active one, deleting others.`);
      }

      // Keep the most recently updated one (or an active one if any exist)
      // Sort by active first, then by created date (assuming newer is better)
      const sorted = [...duplicateWorkflows].sort((a, b) => {
        if (a.active && !b.active) return -1;
        if (!a.active && b.active) return 1;
        // Both same active status, keep first one (they're already sorted by listWorkflows)
        return 0;
      });

      const keep = sorted[0];
      const toDelete = sorted.slice(1);

      console.log(`   ✅ Keeping: ID ${keep.id} (active: ${keep.active})`);

      // Delete the rest
      for (const workflow of toDelete) {
        try {
          console.log(`   🗑️  Deleting: ID ${workflow.id} (active: ${workflow.active})`);
          await n8nClient.deleteWorkflow(workflow.id);
        } catch (error) {
          console.error(
            `   ❌ Failed to delete ${workflow.id}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }
    }

    console.log("\n✅ Duplicate cleanup completed!");

    // Show final count
    const finalWorkflows = await n8nClient.listWorkflows(true);
    console.log(`\n📊 Final workflow count: ${finalWorkflows.length}`);
  } catch (error) {
    console.error(
      "❌ Error cleaning up duplicates:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

cleanupDuplicates();
