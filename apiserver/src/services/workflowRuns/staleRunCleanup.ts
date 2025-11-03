import { db } from "../../db.js";

/**
 * Cleanup stale workflow runs that have been in 'running' status for too long
 * This handles cases where workflows fail silently or timeout
 * Runs every 5 minutes and marks runs older than 30 minutes as failed
 */
export async function cleanupStaleWorkflowRuns(): Promise<void> {
  try {
    const staleThresholdMinutes = 30;
    const staleThresholdMs = staleThresholdMinutes * 60 * 1000;

    // Find workflow runs that have been running for more than the threshold
    // SQLite doesn't support datetime arithmetic directly, so we calculate in JavaScript
    const allRunningRuns = (await db.all(
      `SELECT id, strategy_id, execution_id, created_at, updated_at
       FROM workflow_runs
       WHERE status = 'running'`
    )) as Array<{
      id: string;
      strategy_id: string;
      execution_id: string | null;
      created_at: string;
      updated_at: string;
    }>;

    // Filter runs that have been running longer than the threshold
    const now = Date.now();
    const staleRuns = allRunningRuns.filter((run) => {
      const updatedAt = new Date(run.updated_at).getTime();
      const ageMs = now - updatedAt;
      return ageMs > staleThresholdMs;
    }) as Array<{
      id: string;
      strategy_id: string;
      execution_id: string | null;
      created_at: string;
      updated_at: string;
    }>;

    if (staleRuns.length > 0) {
      console.log(`🧹 Found ${staleRuns.length} stale workflow runs to cleanup`);

      for (const run of staleRuns) {
        const updatedAt = new Date(run.updated_at).getTime();
        const now = Date.now();
        const ageMinutes = Math.floor((now - updatedAt) / 60000);

        const errorMessage = `Workflow run timed out after ${ageMinutes} minutes. The workflow may have failed silently or been interrupted.`;

        await db.run(
          `UPDATE workflow_runs
           SET status = 'failed',
               error_message = ?,
               updated_at = datetime('now')
           WHERE id = ?`,
          [errorMessage, run.id]
        );

        console.log(`✅ Marked stale workflow run as failed:`, {
          workflowRunId: run.id,
          strategyId: run.strategy_id,
          executionId: run.execution_id,
          ageMinutes,
        });
      }
    }
  } catch (error) {
    console.error("❌ Error in cleanupStaleWorkflowRuns:", error);
    // Don't throw - this is a background cleanup task
  }
}

/**
 * Start the stale workflow run cleanup task
 * Runs cleanup every 5 minutes
 */
export function startStaleWorkflowRunCleanup(): void {
  // Run immediately, then every 5 minutes
  cleanupStaleWorkflowRuns().catch((error) => {
    console.error("⚠️ Initial stale workflow run cleanup failed:", error);
  });

  const intervalMs = 5 * 60 * 1000; // 5 minutes
  setInterval(() => {
    cleanupStaleWorkflowRuns().catch((error) => {
      console.error("⚠️ Stale workflow run cleanup failed:", error);
    });
  }, intervalMs);

  console.log("✅ Started stale workflow run cleanup task (runs every 5 minutes)");
}
