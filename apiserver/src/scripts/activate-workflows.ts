#!/usr/bin/env tsx
/**
 * Script to find and activate n8n workflows by name
 * 
 * Usage:
 *   npx tsx apiserver/src/scripts/activate-workflows.ts "Performance Summary (Monthly)"
 *   npx tsx apiserver/src/scripts/activate-workflows.ts "Strategy: money (Twice Weekly)"
 *   npx tsx apiserver/src/scripts/activate-workflows.ts --all
 */

import { n8nClient } from "../services/n8nClient.js";

async function activateWorkflowByName(workflowName: string) {
  try {
    console.log(`🔍 Searching for workflow: "${workflowName}"`);
    
    // List all workflows
    const workflows = await n8nClient.listWorkflows();
    
    // Find workflow by name (case-insensitive partial match)
    const matchingWorkflow = workflows.find(w => 
      w.name.toLowerCase().includes(workflowName.toLowerCase())
    );
    
    if (!matchingWorkflow) {
      console.log(`❌ Workflow not found: "${workflowName}"`);
      console.log(`\n📋 Available workflows:`);
      workflows.forEach(w => {
        console.log(`   - ${w.name} (ID: ${w.id}, Active: ${w.active ? '✅' : '❌'})`);
      });
      process.exit(1);
    }
    
    console.log(`✅ Found workflow: "${matchingWorkflow.name}" (ID: ${matchingWorkflow.id})`);
    console.log(`   Current status: ${matchingWorkflow.active ? 'Active' : 'Inactive'}`);
    
    if (matchingWorkflow.active) {
      console.log(`✅ Workflow is already active!`);
      return;
    }
    
    // Activate the workflow
    console.log(`▶️  Activating workflow...`);
    await n8nClient.activateWorkflow(matchingWorkflow.id);
    
    // Verify activation
    const updated = await n8nClient.getWorkflow(matchingWorkflow.id);
    if (updated.active) {
      console.log(`✅ Successfully activated workflow: "${updated.name}"`);
    } else {
      console.error(`❌ Activation reported success but workflow is still inactive`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`❌ Error:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function activateAllInactive() {
  try {
    console.log(`🔍 Listing all workflows...`);
    const workflows = await n8nClient.listWorkflows();
    
    const inactive = workflows.filter(w => !w.active);
    
    if (inactive.length === 0) {
      console.log(`✅ All workflows are already active!`);
      return;
    }
    
    console.log(`📋 Found ${inactive.length} inactive workflow(s):`);
    inactive.forEach(w => {
      console.log(`   - ${w.name} (ID: ${w.id})`);
    });
    
    for (const workflow of inactive) {
      try {
        console.log(`\n▶️  Activating: "${workflow.name}"...`);
        await n8nClient.activateWorkflow(workflow.id);
        
        const updated = await n8nClient.getWorkflow(workflow.id);
        if (updated.active) {
          console.log(`✅ Successfully activated: "${updated.name}"`);
        } else {
          console.error(`❌ Failed to activate: "${updated.name}"`);
        }
      } catch (error) {
        console.error(`❌ Error activating "${workflow.name}":`, error instanceof Error ? error.message : String(error));
      }
    }
    
  } catch (error) {
    console.error(`❌ Error:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Get command from arguments
const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  console.log(`Usage: npx tsx apiserver/src/scripts/activate-workflows.ts "<workflow-name>"`);
  console.log(`   or: npx tsx apiserver/src/scripts/activate-workflows.ts --all`);
  console.log(`\nExamples:`);
  console.log(`  npx tsx apiserver/src/scripts/activate-workflows.ts "Performance Summary (Monthly)"`);
  console.log(`  npx tsx apiserver/src/scripts/activate-workflows.ts "Strategy: money (Twice Weekly)"`);
  console.log(`  npx tsx apiserver/src/scripts/activate-workflows.ts --all`);
  process.exit(0);
}

if (command === '--all') {
  activateAllInactive();
} else {
  activateWorkflowByName(command);
}
