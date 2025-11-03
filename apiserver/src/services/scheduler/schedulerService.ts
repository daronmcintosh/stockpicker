import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { Frequency } from "../../gen/stockpicker/v1/strategy_pb.js";
import { frequencyToCron } from "../strategy/strategyHelpers.js";

/**
 * Represents a scheduled job that can be started/stopped
 */
export interface ScheduledJob {
  id: string;
  cronExpression: string;
  task: ScheduledTask;
  description: string;
}

/**
 * Scheduler service that manages cron jobs for strategies and global workflows
 */
class SchedulerService {
  private jobs: Map<string, ScheduledJob> = new Map();
  private globalJobs: Map<string, ScheduledJob> = new Map();

  /**
   * Schedule a job based on strategy frequency
   */
  scheduleStrategy(
    strategyId: string,
    frequency: Frequency,
    callback: () => Promise<void>
  ): void {
    // Stop existing job if it exists
    this.unscheduleStrategy(strategyId);

    const cronExpression = frequencyToCron(frequency);
    const description = `Strategy ${strategyId}`;

    console.log(`📅 Scheduling strategy job:`, {
      strategyId,
      cronExpression,
      description,
    });

    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          console.log(`⏰ Executing scheduled strategy job:`, {
            strategyId,
            cronExpression,
          });
          await callback();
          console.log(`✅ Completed scheduled strategy job:`, { strategyId });
        } catch (error) {
          console.error(`❌ Error in scheduled strategy job:`, {
            strategyId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      {
        timezone: "America/New_York",
      }
    );

    // Don't start immediately
    task.stop();

    const job: ScheduledJob = {
      id: strategyId,
      cronExpression,
      task,
      description,
    };

    this.jobs.set(strategyId, job);
  }

  /**
   * Start a strategy job
   */
  startStrategy(strategyId: string): void {
    const job = this.jobs.get(strategyId);
    if (!job) {
      console.warn(`⚠️ No job found for strategy:`, { strategyId });
      return;
    }

    job.task.start();
    console.log(`▶️ Started scheduled job:`, {
      strategyId,
      cronExpression: job.cronExpression,
    });
  }

  /**
   * Stop a strategy job
   */
  stopStrategy(strategyId: string): void {
    const job = this.jobs.get(strategyId);
    if (!job) {
      console.warn(`⚠️ No job found for strategy:`, { strategyId });
      return;
    }

    job.task.stop();
    console.log(`⏹️ Stopped scheduled job:`, {
      strategyId,
      cronExpression: job.cronExpression,
    });
  }

  /**
   * Unschedule a strategy job (remove it completely)
   */
  unscheduleStrategy(strategyId: string): void {
    const job = this.jobs.get(strategyId);
    if (job) {
      job.task.stop();
      job.task.destroy();
      this.jobs.delete(strategyId);
      console.log(`🗑️ Unscheduled job:`, { strategyId });
    }
  }

  /**
   * Schedule a global job (e.g., daily performance tracking)
   */
  scheduleGlobal(
    jobId: string,
    cronExpression: string,
    description: string,
    callback: () => Promise<void>
  ): void {
    // Stop existing job if it exists
    this.unscheduleGlobal(jobId);

    console.log(`📅 Scheduling global job:`, {
      jobId,
      cronExpression,
      description,
    });

    const task = cron.schedule(
      cronExpression,
      async () => {
        try {
          console.log(`⏰ Executing global job:`, { jobId, description });
          await callback();
          console.log(`✅ Completed global job:`, { jobId });
        } catch (error) {
          console.error(`❌ Error in global job:`, {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
      {
        timezone: "America/New_York",
      }
    );

    // Global jobs start immediately (task is already running)

    const job: ScheduledJob = {
      id: jobId,
      cronExpression,
      task,
      description,
    };

    this.globalJobs.set(jobId, job);
  }

  /**
   * Unschedule a global job
   */
  unscheduleGlobal(jobId: string): void {
    const job = this.globalJobs.get(jobId);
    if (job) {
      job.task.stop();
      job.task.destroy();
      this.globalJobs.delete(jobId);
      console.log(`🗑️ Unscheduled global job:`, { jobId });
    }
  }

  /**
   * Get all active strategy jobs
   */
  getActiveStrategyJobs(): string[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * Get all active global jobs
   */
  getActiveGlobalJobs(): string[] {
    return Array.from(this.globalJobs.keys());
  }

  /**
   * Clear all jobs (for cleanup/testing)
   */
  clearAll(): void {
    for (const job of this.jobs.values()) {
      job.task.stop();
      job.task.destroy();
    }
    for (const job of this.globalJobs.values()) {
      job.task.stop();
      job.task.destroy();
    }
    this.jobs.clear();
    this.globalJobs.clear();
    console.log(`🧹 Cleared all scheduled jobs`);
  }
}

export const schedulerService = new SchedulerService();

