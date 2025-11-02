import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../db.js";
import {
  type CopyStrategyRequest,
  type CopyStrategyResponse,
  CopyStrategyResponseSchema,
  type CreateStrategyRequest,
  type CreateStrategyResponse,
  CreateStrategyResponseSchema,
  type DeleteStrategyRequest,
  type DeleteStrategyResponse,
  DeleteStrategyResponseSchema,
  type FollowUserRequest,
  type FollowUserResponse,
  FollowUserResponseSchema,
  Frequency,
  type GetCurrentUserRequest,
  type GetCurrentUserResponse,
  GetCurrentUserResponseSchema,
  type GetLeaderboardRequest,
  type GetLeaderboardResponse,
  GetLeaderboardResponseSchema,
  type GetStrategyRequest,
  type GetStrategyResponse,
  GetStrategyResponseSchema,
  type GetUserPerformanceRequest,
  type GetUserPerformanceResponse,
  GetUserPerformanceResponseSchema,
  type GetUserProfileRequest,
  type GetUserProfileResponse,
  GetUserProfileResponseSchema,
  type LeaderboardEntry,
  LeaderboardEntrySchema,
  LeaderboardScope,
  LeaderboardTimeframe,
  type ListCloseFriendsRequest,
  type ListCloseFriendsResponse,
  ListCloseFriendsResponseSchema,
  type ListFollowersRequest,
  type ListFollowersResponse,
  ListFollowersResponseSchema,
  type ListFollowingRequest,
  type ListFollowingResponse,
  ListFollowingResponseSchema,
  type ListStrategiesRequest,
  type ListStrategiesResponse,
  ListStrategiesResponseSchema,
  type PauseStrategyRequest,
  type PauseStrategyResponse,
  PauseStrategyResponseSchema,
  type UserPerformance as ProtoUserPerformance,
  RiskLevel,
  type SendOTPRequest,
  type SendOTPResponse,
  SendOTPResponseSchema,
  type StartStrategyRequest,
  type StartStrategyResponse,
  StartStrategyResponseSchema,
  type StopStrategyRequest,
  type StopStrategyResponse,
  StopStrategyResponseSchema,
  type Strategy,
  StrategyPrivacy,
  StrategySchema,
  StrategyStatus,
  type TriggerPredictionsRequest,
  type TriggerPredictionsResponse,
  TriggerPredictionsResponseSchema,
  type UnfollowUserRequest,
  type UnfollowUserResponse,
  UnfollowUserResponseSchema,
  type UpdateStrategyPrivacyRequest,
  type UpdateStrategyPrivacyResponse,
  UpdateStrategyPrivacyResponseSchema,
  type UpdateStrategyRequest,
  type UpdateStrategyResponse,
  UpdateStrategyResponseSchema,
  type UpdateUserRequest,
  type UpdateUserResponse,
  UpdateUserResponseSchema,
  type User,
  UserPerformanceSchema,
  UserSchema,
  type VerifyOTPRequest,
  type VerifyOTPResponse,
  VerifyOTPResponseSchema,
} from "../gen/stockpicker/v1/strategy_pb.js";
import {
  generateToken,
  getCurrentUserId,
  getUserById,
  getUserByUsername,
  sendOTP as sendOTPHelper,
  verifyOTP as verifyOTPHelper,
} from "./authHelpers.js";
import { getLeaderboard } from "./leaderboardHelpers.js";
import { n8nClient } from "./n8nClient.js";
import { type UserPerformance, calculatePerformance } from "./performanceHelpers.js";
import { dbRowToProtoPrediction } from "./predictionService.js";
import {
  followUser as followUserHelper,
  getCloseFriends,
  getFollowers,
  getFollowing,
  isCloseFriend as isCloseFriendHelper,
  isFollowing as isFollowingHelper,
  unfollowUser as unfollowUserHelper,
} from "./socialHelpers.js";

// Helper to convert frequency enum to trades per month
function getTradesPerMonth(frequency: Frequency): number {
  switch (frequency) {
    case Frequency.DAILY:
      return 22; // ~22 trading days per month
    case Frequency.TWICE_WEEKLY:
      return 8;
    case Frequency.WEEKLY:
      return 4;
    case Frequency.BIWEEKLY:
      return 2;
    case Frequency.MONTHLY:
      return 1;
    default:
      return 8; // default to twice weekly
  }
}

/**
 * Ensure a workflow exists for a strategy. Creates it if missing.
 * This handles cases where workflows were deleted or n8n instance was reset.
 * @param row - The strategy row from the database
 * @returns The workflow ID (existing or newly created)
 */
async function ensureWorkflowExists(row: StrategyRow): Promise<string> {
  const strategyId = row.id;
  const strategyName = row.name;
  const currentWorkflowId = row.n8n_workflow_id;
  const frequency = protoNameToFrequency(row.frequency);

  // If we have a workflow ID, check if it exists and update API URL if needed
  if (currentWorkflowId) {
    try {
      const workflow = await n8nClient.getWorkflow(currentWorkflowId);
      console.log(`✅ Workflow exists for strategy:`, {
        strategyId,
        workflowId: workflow.id,
        workflowName: workflow.name,
      });

      // Check and update API URL if it has changed (e.g., N8N_API_SERVER_URL was updated)
      // This must succeed - if it fails, the operation should fail
      await n8nClient.updateWorkflowApiUrl(currentWorkflowId);

      return workflow.id;
    } catch (error) {
      console.warn(`⚠️ Workflow ${currentWorkflowId} not found in n8n, will create new one:`, {
        strategyId,
        workflowId: currentWorkflowId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall through to create new workflow
    }
  }

  // Workflow doesn't exist or no workflow ID - create it
  console.log(`🔄 Creating missing workflow for strategy:`, {
    strategyId,
    strategyName,
    frequency: frequencyToName(frequency),
    previousWorkflowId: currentWorkflowId,
  });

  try {
    const workflow = await n8nClient.createStrategyWorkflow(strategyId, strategyName, frequency);
    console.log(`✅ Created new workflow for strategy:`, {
      strategyId,
      workflowId: workflow.id,
      workflowName: workflow.name,
    });

    // Update the database with the new workflow ID
    // Use transaction to ensure atomicity: if DB update fails, cleanup the workflow
    try {
      await db.run("BEGIN TRANSACTION");

      await db.run("UPDATE strategies SET n8n_workflow_id = ?, updated_at = ? WHERE id = ?", [
        workflow.id,
        new Date().toISOString(),
        strategyId,
      ]);

      await db.run("COMMIT");
      console.log(`✅ Workflow ID updated in database:`, {
        strategyId,
        workflowId: workflow.id,
      });

      return workflow.id;
    } catch (dbError) {
      // Rollback on database error
      try {
        await db.run("ROLLBACK");
      } catch (rollbackError) {
        console.error("❌ Failed to rollback:", rollbackError);
      }

      // Clean up the created workflow if DB update failed
      try {
        console.log(`🧹 Cleaning up created workflow after DB update failure:`, {
          workflowId: workflow.id,
        });
        await n8nClient.deleteWorkflow(workflow.id);
        console.log(`✅ Workflow cleaned up successfully`);
      } catch (cleanupError) {
        console.error("⚠️ Failed to cleanup workflow after DB failure:", {
          workflowId: workflow.id,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      }

      throw new Error(
        `Failed to update database with workflow ID: ${dbError instanceof Error ? dbError.message : String(dbError)}`
      );
    }
  } catch (error) {
    console.error(`❌ Failed to create workflow for strategy:`, {
      strategyId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to create workflow: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Helper to convert frequency to name (duplicate from n8nClient for convenience)
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
 * Sync all strategies with n8n workflows.
 * Checks each strategy and creates missing workflows.
 * This is useful after n8n instance restarts or when workflows are deleted.
 */
export async function syncStrategiesWithWorkflows(): Promise<void> {
  try {
    console.log("🔄 Syncing strategies with n8n workflows...");

    // Get all strategies from database
    const rows = (await db.all("SELECT * FROM strategies")) as StrategyRow[];
    console.log(`📋 Found ${rows.length} strategy(ies) to sync`);

    let synced = 0;
    let created = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const hadWorkflow = !!row.n8n_workflow_id;
        const workflowId = await ensureWorkflowExists(row);

        if (!hadWorkflow || workflowId !== row.n8n_workflow_id) {
          created++;
          console.log(`✅ Synced strategy "${row.name}":`, {
            strategyId: row.id,
            workflowId,
            created: !hadWorkflow,
            updated: hadWorkflow && workflowId !== row.n8n_workflow_id,
          });
        } else {
          synced++;
        }
      } catch (error) {
        errors++;
        console.error(`❌ Failed to sync strategy "${row.name}":`, {
          strategyId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log("📊 Strategy workflow sync summary:", {
      total: rows.length,
      alreadySynced: synced,
      created: created,
      errors: errors,
    });
  } catch (error) {
    console.error("❌ Failed to sync strategies with workflows:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// Helper to convert enum numeric value to proto enum name string for database storage
function riskLevelToProtoName(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case RiskLevel.LOW:
      return "RISK_LEVEL_LOW";
    case RiskLevel.MEDIUM:
      return "RISK_LEVEL_MEDIUM";
    case RiskLevel.HIGH:
      return "RISK_LEVEL_HIGH";
    default:
      return "RISK_LEVEL_UNSPECIFIED";
  }
}

function frequencyToProtoName(frequency: Frequency): string {
  switch (frequency) {
    case Frequency.DAILY:
      return "FREQUENCY_DAILY";
    case Frequency.TWICE_WEEKLY:
      return "FREQUENCY_TWICE_WEEKLY";
    case Frequency.WEEKLY:
      return "FREQUENCY_WEEKLY";
    case Frequency.BIWEEKLY:
      return "FREQUENCY_BIWEEKLY";
    case Frequency.MONTHLY:
      return "FREQUENCY_MONTHLY";
    default:
      return "FREQUENCY_UNSPECIFIED";
  }
}

function strategyStatusToProtoName(status: StrategyStatus): string {
  switch (status) {
    case StrategyStatus.ACTIVE:
      return "STRATEGY_STATUS_ACTIVE";
    case StrategyStatus.PAUSED:
      return "STRATEGY_STATUS_PAUSED";
    case StrategyStatus.STOPPED:
      return "STRATEGY_STATUS_STOPPED";
    default:
      return "STRATEGY_STATUS_UNSPECIFIED";
  }
}

// Helper to convert proto enum name string from database to enum numeric value
function protoNameToRiskLevel(protoName: string): RiskLevel {
  switch (protoName) {
    case "RISK_LEVEL_LOW":
      return RiskLevel.LOW;
    case "RISK_LEVEL_MEDIUM":
      return RiskLevel.MEDIUM;
    case "RISK_LEVEL_HIGH":
      return RiskLevel.HIGH;
    default:
      return RiskLevel.UNSPECIFIED;
  }
}

function protoNameToFrequency(protoName: string): Frequency {
  switch (protoName) {
    case "FREQUENCY_DAILY":
      return Frequency.DAILY;
    case "FREQUENCY_TWICE_WEEKLY":
      return Frequency.TWICE_WEEKLY;
    case "FREQUENCY_WEEKLY":
      return Frequency.WEEKLY;
    case "FREQUENCY_BIWEEKLY":
      return Frequency.BIWEEKLY;
    case "FREQUENCY_MONTHLY":
      return Frequency.MONTHLY;
    default:
      return Frequency.UNSPECIFIED;
  }
}

function protoNameToStrategyStatus(protoName: string): StrategyStatus {
  switch (protoName) {
    case "STRATEGY_STATUS_ACTIVE":
      return StrategyStatus.ACTIVE;
    case "STRATEGY_STATUS_PAUSED":
      return StrategyStatus.PAUSED;
    case "STRATEGY_STATUS_STOPPED":
      return StrategyStatus.STOPPED;
    default:
      return StrategyStatus.UNSPECIFIED;
  }
}

// Helper to safely convert BigInt or number to number
function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Helper to safely convert BigInt or number to integer
function toInteger(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

// Helper to convert Unix timestamp to Date
// Handles both seconds (SQLite unixepoch()) and milliseconds (Date.now())
function timestampToDate(timestamp: number): Date {
  // If timestamp is < 1e10, it's in seconds, otherwise it's in milliseconds
  const ms = timestamp < 1e10 ? timestamp * 1000 : timestamp;
  return new Date(ms);
}

// Helper to convert DB row to proto Strategy message
async function dbRowToProtoStrategy(row: StrategyRow): Promise<Strategy> {
  try {
    const strategy = create(StrategySchema, {
      id: row.id,
      name: row.name,
      description: row.description,
      customPrompt: row.custom_prompt,
      monthlyBudget: toNumber(row.monthly_budget),
      currentMonthSpent: toNumber(row.current_month_spent),
      currentMonthStart: timestampFromDate(new Date(row.current_month_start)),
      timeHorizon: row.time_horizon,
      targetReturnPct: toNumber(row.target_return_pct),
      frequency: protoNameToFrequency(row.frequency),
      tradesPerMonth: toInteger(row.trades_per_month),
      perTradeBudget: toNumber(row.per_trade_budget),
      perStockAllocation: toNumber(row.per_stock_allocation),
      riskLevel: protoNameToRiskLevel(row.risk_level),
      uniqueStocksCount: toInteger(row.unique_stocks_count),
      maxUniqueStocks: toInteger(row.max_unique_stocks),
      status: protoNameToStrategyStatus(row.status),
      privacy: mapPrivacyFromDb(row.privacy),
      userId: row.user_id,
      createdAt: timestampFromDate(new Date(row.created_at)),
      updatedAt: timestampFromDate(new Date(row.updated_at)),
    });

    if (row.next_trade_scheduled) {
      strategy.nextTradeScheduled = timestampFromDate(new Date(row.next_trade_scheduled));
    }
    if (row.last_trade_executed) {
      strategy.lastTradeExecuted = timestampFromDate(new Date(row.last_trade_executed));
    }

    // Populate user field
    if (row.user_id) {
      try {
        console.log(`👤 Fetching user for strategy:`, { strategyId: row.id, userId: row.user_id });
        const userRow = await getUserById(row.user_id);
        if (userRow) {
          console.log(`👤 User found, creating User proto:`, {
            userId: userRow.id,
            username: userRow.username,
          });
          strategy.user = create(UserSchema, {
            id: userRow.id,
            email: userRow.email,
            username: userRow.username,
            displayName: userRow.display_name ?? undefined,
            avatarUrl: userRow.avatar_url ?? undefined,
            createdAt: timestampFromDate(timestampToDate(userRow.created_at)),
            updatedAt: timestampFromDate(timestampToDate(userRow.updated_at)),
          });
          console.log(`✅ User proto created successfully`);
        } else {
          console.warn(`⚠️ User ${row.user_id} not found in database for strategy ${row.id}`);
        }
      } catch (userError) {
        console.error(`❌ Failed to fetch user ${row.user_id} for strategy ${row.id}:`, userError);
        if (userError instanceof Error) {
          console.error("User fetch error details:", {
            message: userError.message,
            stack: userError.stack,
          });
        }
        // Continue without user field - non-critical
      }
    } else {
      console.warn(`⚠️ Strategy ${row.id} has no user_id`);
    }

    return strategy;
  } catch (error) {
    console.error(`❌ Error in dbRowToProtoStrategy for strategy ${row.id}:`, error);
    if (error instanceof Error) {
      console.error("Strategy conversion error:", {
        message: error.message,
        stack: error.stack,
      });
    }
    throw error;
  }
}

// Helper to map database privacy string to StrategyPrivacy enum
function mapPrivacyFromDb(privacy: string): StrategyPrivacy {
  switch (privacy) {
    case "STRATEGY_PRIVACY_PUBLIC":
      return StrategyPrivacy.PUBLIC;
    case "STRATEGY_PRIVACY_PRIVATE":
      return StrategyPrivacy.PRIVATE;
    default:
      return StrategyPrivacy.PRIVATE;
  }
}

// Helper to map StrategyPrivacy enum to database string
function mapPrivacyToDb(privacy: StrategyPrivacy): string {
  switch (privacy) {
    case StrategyPrivacy.PUBLIC:
      return "STRATEGY_PRIVACY_PUBLIC";
    case StrategyPrivacy.PRIVATE:
      return "STRATEGY_PRIVACY_PRIVATE";
    default:
      return "STRATEGY_PRIVACY_PRIVATE";
  }
}

// Strategy service implementation
export const strategyServiceImpl = {
  async createStrategy(
    req: CreateStrategyRequest,
    context: HandlerContext
  ): Promise<CreateStrategyResponse> {
    console.log(`\n${"=".repeat(80)}`);
    console.log("🎯 CREATE STRATEGY CALLED");
    console.log("Request:", JSON.stringify(req, null, 2));

    // Check authorization header
    const _authHeader = context.requestHeader.get("authorization");

    const id = randomUUID();
    let workflowId: string | null = null;

    // Require authentication
    console.log("🔐 Checking authentication for strategy creation...");
    const userId = getCurrentUserId(context);
    console.log("🔐 Authentication result:", { userId, hasAuth: !!userId });
    if (!userId) {
      console.error("❌ Authentication failed - no userId found");
      throw new ConnectError("Authentication required to create strategies", Code.Unauthenticated);
    }

    try {
      // Validate required fields
      if (!req.name) {
        throw new Error("Strategy name is required");
      }
      if (!req.monthlyBudget || req.monthlyBudget <= 0) {
        throw new Error("Monthly budget must be greater than 0");
      }
      if (req.frequency === undefined || req.frequency === null) {
        throw new Error("Frequency is required");
      }
      if (req.riskLevel === undefined || req.riskLevel === null) {
        throw new Error("Risk level is required");
      }

      console.log("📝 Creating strategy:", {
        name: req.name,
        monthlyBudget: req.monthlyBudget,
        frequency: req.frequency,
        riskLevel: req.riskLevel,
        userId,
      });

      // Step 1: Create n8n workflow first (external resource)
      // If this fails, we won't create the strategy at all
      try {
        console.log(`📝 Creating n8n workflow for new strategy:`, {
          strategyId: id,
          strategyName: req.name,
        });

        const workflow = await n8nClient.createStrategyWorkflow(id, req.name, req.frequency);
        workflowId = workflow.id;

        console.log(`✅ n8n workflow created successfully:`, {
          strategyId: id,
          workflowId: workflow.id,
          workflowName: workflow.name,
        });
      } catch (error) {
        console.error("❌ Failed to create n8n workflow - aborting strategy creation:", {
          strategyId: id,
          strategyName: req.name,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw new Error(
          `Failed to create n8n workflow: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Step 2: Now create strategy in database with workflow ID in a transaction
      const now = new Date().toISOString();
      const tradesPerMonth = getTradesPerMonth(req.frequency);
      // Round to 2 decimal places for monetary values
      const perTradeBudget = Math.round((req.monthlyBudget / tradesPerMonth) * 100) / 100;
      const perStockAllocation = Math.round((perTradeBudget / 3) * 100) / 100; // Always 3 stocks per trade

      const strategyData = {
        id,
        name: req.name,
        description: req.description || "",
        custom_prompt: req.customPrompt || "",
        monthly_budget: req.monthlyBudget,
        current_month_spent: 0,
        current_month_start: now,
        time_horizon: req.timeHorizon || "3 months",
        target_return_pct: req.targetReturnPct ?? 10.0,
        frequency: frequencyToProtoName(req.frequency), // Convert enum to proto name string
        trades_per_month: tradesPerMonth,
        per_trade_budget: perTradeBudget,
        per_stock_allocation: perStockAllocation,
        risk_level: riskLevelToProtoName(req.riskLevel), // Convert enum to proto name string
        unique_stocks_count: 0,
        max_unique_stocks: req.maxUniqueStocks || 20,
        n8n_workflow_id: workflowId, // Use the workflow ID we just created
        status: "STRATEGY_STATUS_PAUSED",
        privacy: "STRATEGY_PRIVACY_PRIVATE", // Default to private
        user_id: userId, // Add user_id
        created_at: now,
        updated_at: now,
      };

      // Prepare parameters array
      const params = [
        strategyData.id,
        strategyData.name,
        strategyData.description,
        strategyData.custom_prompt,
        strategyData.monthly_budget,
        strategyData.current_month_spent,
        strategyData.current_month_start,
        strategyData.time_horizon,
        strategyData.target_return_pct,
        strategyData.frequency,
        strategyData.trades_per_month,
        strategyData.per_trade_budget,
        strategyData.per_stock_allocation,
        strategyData.risk_level,
        strategyData.unique_stocks_count,
        strategyData.max_unique_stocks,
        strategyData.n8n_workflow_id,
        strategyData.status,
        strategyData.privacy,
        strategyData.user_id, // Add user_id to params
        strategyData.created_at,
        strategyData.updated_at,
      ];

      const sql = `
        INSERT INTO strategies (
          id, name, description, custom_prompt, monthly_budget, current_month_spent,
          current_month_start, time_horizon, target_return_pct, frequency,
          trades_per_month, per_trade_budget, per_stock_allocation, risk_level,
          unique_stocks_count, max_unique_stocks, n8n_workflow_id, status,
          privacy, user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Use transaction to ensure atomicity
      try {
        // Begin transaction
        await db.run("BEGIN TRANSACTION");

        // Insert strategy
        console.log(`💾 Inserting strategy into database:`, {
          strategyId: id,
          paramCount: params.length,
          userId: userId,
        });
        await db.run(sql, params);
        console.log("✅ Strategy inserted into database");

        // Commit transaction
        await db.run("COMMIT");
        console.log("✅ Transaction committed successfully");
      } catch (dbError: unknown) {
        // Rollback on any database error
        try {
          await db.run("ROLLBACK");
          console.log("🔄 Transaction rolled back due to database error");
        } catch (rollbackError) {
          console.error("❌ Failed to rollback transaction:", rollbackError);
        }

        // Clean up n8n workflow if database insert failed
        if (workflowId) {
          try {
            console.log(`🧹 Cleaning up n8n workflow after database error:`, { workflowId });
            await n8nClient.deleteWorkflow(workflowId);
            console.log(`✅ n8n workflow deleted successfully after rollback`);
          } catch (cleanupError) {
            console.error("⚠️ Failed to delete n8n workflow during cleanup:", {
              workflowId,
              error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            });
          }
        }

        console.error("❌ Database error details:");
        if (dbError && typeof dbError === "object") {
          const error = dbError as { code?: unknown; errno?: unknown; message?: unknown };
          console.error("  - Error code:", error.code);
          console.error("  - Error errno:", error.errno);
          console.error("  - Error message:", error.message);
        }
        throw dbError;
      }

      // Step 3: Sync workflow active state with strategy status (optional, non-critical)
      if (strategyData.status === "STRATEGY_STATUS_ACTIVE" && workflowId) {
        try {
          console.log(`▶️ Activating workflow to match active strategy status:`, {
            strategyId: id,
            workflowId: workflowId,
          });
          await n8nClient.activateWorkflow(workflowId);
          console.log(`✅ Workflow activated to match strategy status:`, {
            strategyId: id,
            workflowId: workflowId,
          });
        } catch (activateError) {
          console.error("⚠️ Failed to activate workflow during creation (non-critical):", {
            strategyId: id,
            workflowId: workflowId,
            error: activateError instanceof Error ? activateError.message : String(activateError),
          });
          // Continue - workflow is created, activation can be retried later
        }
      } else if (workflowId) {
        console.log(
          `ℹ️ Workflow remains inactive (matches strategy status ${strategyData.status}):`,
          {
            strategyId: id,
            workflowId: workflowId,
          }
        );
      }

      // Fetch the created strategy
      console.log(`📖 Fetching created strategy from database:`, { strategyId: id });
      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [id])) as
        | StrategyRow
        | undefined;

      if (!row) {
        console.error(`❌ Strategy not found after creation:`, { strategyId: id });
        throw new ConnectError(`Failed to fetch created strategy: ${id}`, Code.Internal);
      }

      console.log(`📖 Converting strategy row to proto:`, {
        strategyId: id,
        userId: row.user_id,
        hasWorkflow: !!row.n8n_workflow_id,
      });

      const strategy = await dbRowToProtoStrategy(row);

      console.log("✅ Strategy created successfully with workflow:", {
        strategyId: id,
        workflowId: workflowId,
        hasUser: !!strategy.user,
      });

      return create(CreateStrategyResponseSchema, { strategy });
    } catch (error) {
      console.error(`\n${"=".repeat(80)}`);
      console.error("❌ ERROR IN CREATE STRATEGY");
      console.error("Error type:", error?.constructor?.name || typeof error);
      console.error("Error:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      if (error instanceof ConnectError) {
        console.error("ConnectError code:", error.code);
        console.error("ConnectError details:", error.message);
      }
      console.error(`${"=".repeat(80)}\n`);

      // Convert to ConnectError if it's not already
      if (error instanceof ConnectError) {
        throw error;
      }

      throw new ConnectError(
        error instanceof Error ? error.message : String(error),
        Code.Internal,
        undefined,
        undefined,
        error instanceof Error ? error : undefined
      );
    }
  },

  async listStrategies(
    req: ListStrategiesRequest,
    context: HandlerContext
  ): Promise<ListStrategiesResponse> {
    try {
      const userId = getCurrentUserId(context);
      console.log("📋 Listing strategies, status filter:", req.status || "all", "userId:", userId);

      let rows: StrategyRow[];

      // Build WHERE clause for user scoping
      // Show: user's own strategies + public strategies from others
      let whereClause = userId
        ? "(user_id = ? OR privacy = 'STRATEGY_PRIVACY_PUBLIC')"
        : "privacy = 'STRATEGY_PRIVACY_PUBLIC'"; // No auth = only public

      if (req.status) {
        const statusFilter = strategyStatusToProtoName(req.status);
        whereClause += ` AND status = '${statusFilter}'`;
      }

      const sql = `SELECT * FROM strategies WHERE ${whereClause} ORDER BY created_at DESC`;

      if (userId) {
        rows = (await db.all(sql, [userId])) as StrategyRow[];
      } else {
        rows = (await db.all(sql)) as StrategyRow[];
      }

      const strategies = await Promise.all(rows.map((row) => dbRowToProtoStrategy(row)));
      console.log(`✅ Found ${strategies.length} strategies`);
      return create(ListStrategiesResponseSchema, { strategies });
    } catch (error) {
      console.error("❌ Error listing strategies:", error);
      throw error;
    }
  },

  async getStrategy(
    req: GetStrategyRequest,
    context: HandlerContext
  ): Promise<GetStrategyResponse> {
    try {
      console.log(`📖 Getting strategy:`, { strategyId: req.id });
      const userId = getCurrentUserId(context);
      console.log(`📖 User context:`, { userId, hasAuth: !!userId });
      
      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        console.error(`❌ Strategy not found:`, { strategyId: req.id });
        throw new ConnectError(`Strategy not found: ${req.id}`, Code.NotFound);
      }

      console.log(`📖 Strategy found:`, { 
        strategyId: row.id, 
        name: row.name, 
        privacy: row.privacy, 
        ownerId: row.user_id 
      });

      // Check access: owner or public
      const isOwner = userId && row.user_id === userId;
      const isPublic = row.privacy === "STRATEGY_PRIVACY_PUBLIC";

      console.log(`📖 Access check:`, { isOwner, isPublic, requestedBy: userId, ownerId: row.user_id });

      if (!isOwner && !isPublic) {
        console.error(`❌ Access denied:`, { 
          strategyId: req.id, 
          requestedBy: userId, 
          ownerId: row.user_id, 
          privacy: row.privacy 
        });
        throw new ConnectError("Access denied: This strategy is private", Code.PermissionDenied);
      }

      console.log(`📖 Converting strategy to proto:`, { strategyId: row.id });
      const strategy = await dbRowToProtoStrategy(row);
      console.log(`✅ Strategy retrieved successfully:`, { strategyId: row.id });
      return create(GetStrategyResponseSchema, { strategy });
    } catch (error) {
      // If it's already a ConnectError, re-throw it
      if (error instanceof ConnectError) {
        console.error(`❌ ConnectError in getStrategy:`, {
          code: error.code,
          message: error.message,
          strategyId: req.id,
        });
        throw error;
      }
      // Convert other errors to ConnectError
      console.error("❌ Error in getStrategy:", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        strategyId: req.id,
      });
      throw new ConnectError(
        error instanceof Error ? error.message : "Internal error",
        Code.Internal
      );
    }
  },

  async updateStrategy(
    req: UpdateStrategyRequest,
    context: HandlerContext
  ): Promise<UpdateStrategyResponse> {
    const userId = getCurrentUserId(context);

    // Check ownership
    const existingRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!existingRow) {
      throw new Error(`Strategy not found: ${req.id}`);
    }
    if (userId !== existingRow.user_id) {
      throw new Error("Access denied: You can only update your own strategies");
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: (string | number)[] = [];

    if (req.name) {
      updates.push("name = ?");
      params.push(req.name);
    }
    if (req.description) {
      updates.push("description = ?");
      params.push(req.description);
    }
    if (req.customPrompt) {
      updates.push("custom_prompt = ?");
      params.push(req.customPrompt);
    }
    if (req.timeHorizon) {
      updates.push("time_horizon = ?");
      params.push(req.timeHorizon);
    }
    if (req.targetReturnPct !== undefined) {
      updates.push("target_return_pct = ?");
      params.push(req.targetReturnPct);
    }
    if (req.riskLevel) {
      updates.push("risk_level = ?");
      params.push(riskLevelToProtoName(req.riskLevel));
    }
    if (req.maxUniqueStocks !== undefined) {
      updates.push("max_unique_stocks = ?");
      params.push(req.maxUniqueStocks);
    }

    // Track if name changed for workflow update
    const nameChanged = req.name && req.name !== existingRow.name;
    const oldName = existingRow.name;

    console.log(`🔍 Strategy update check:`, {
      strategyId: req.id,
      nameProvided: !!req.name,
      currentName: existingRow.name,
      newName: req.name,
      nameChanged,
      hasWorkflow: !!existingRow.n8n_workflow_id,
      workflowId: existingRow.n8n_workflow_id,
    });

    // Use transaction to ensure atomicity: DB update and workflow update must both succeed
    try {
      await db.run("BEGIN TRANSACTION");

      // Step 1: Update database
      if (updates.length > 0) {
        updates.push("updated_at = ?");
        params.push(now);
        params.push(req.id); // for WHERE clause

        await db.run(`UPDATE strategies SET ${updates.join(", ")} WHERE id = ?`, params);
        console.log(`✅ Strategy database updated`);
      }

      // Step 2: Update n8n workflow if name changed (must succeed or rollback DB)
      if (nameChanged && existingRow.n8n_workflow_id) {
        console.log(`🔄 Updating n8n workflow name:`, {
          strategyId: req.id,
          workflowId: existingRow.n8n_workflow_id,
          oldName,
          newName: req.name,
        });

        const frequency = protoNameToFrequency(existingRow.frequency);
        if (req.name) {
          await n8nClient.updateStrategyWorkflow(
            existingRow.n8n_workflow_id,
            req.id,
            req.name,
            frequency
          );
        }

        console.log(`✅ n8n workflow name updated successfully:`, {
          strategyId: req.id,
          oldName,
          newName: req.name,
          workflowId: existingRow.n8n_workflow_id,
        });
      } else {
        if (!nameChanged) {
          console.log(`ℹ️ Strategy name unchanged, skipping workflow update`);
        }
        if (!existingRow.n8n_workflow_id) {
          console.log(`ℹ️ Strategy has no workflow ID, skipping workflow update`);
        }
      }

      // Commit transaction if all operations succeeded
      await db.run("COMMIT");
      console.log(`✅ Strategy update transaction committed`);
    } catch (error) {
      // Rollback database changes if workflow update failed
      console.error(`❌ Error during strategy update, rolling back:`, {
        strategyId: req.id,
        error: error instanceof Error ? error.message : String(error),
      });

      try {
        await db.run("ROLLBACK");
        console.log(`🔄 Transaction rolled back`);
      } catch (rollbackError) {
        console.error(`❌ Failed to rollback transaction:`, rollbackError);
      }

      throw new ConnectError(
        `Failed to update strategy: ${error instanceof Error ? error.message : String(error)}`,
        Code.Internal
      );
    }

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as StrategyRow;
    const strategy = await dbRowToProtoStrategy(row);
    return create(UpdateStrategyResponseSchema, { strategy });
  },

  async deleteStrategy(
    req: DeleteStrategyRequest,
    context: HandlerContext
  ): Promise<DeleteStrategyResponse> {
    try {
      const userId = getCurrentUserId(context);

      // Check if strategy exists and is stopped
      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
      }

      // Check ownership
      if (userId !== row.user_id) {
        throw new Error("Access denied: You can only delete your own strategies");
      }

      const status = protoNameToStrategyStatus(row.status);
      if (status !== StrategyStatus.STOPPED) {
        throw new Error(`Strategy must be stopped before deletion. Current status: ${row.status}`);
      }

      // Step 1: Delete n8n workflow first (must succeed before deleting strategy)
      if (row.n8n_workflow_id) {
        console.log(`🗑️ Deleting n8n workflow for strategy:`, {
          strategyId: req.id,
          workflowId: row.n8n_workflow_id,
        });
        await n8nClient.deleteWorkflow(row.n8n_workflow_id);
        console.log(`✅ n8n workflow deleted successfully:`, {
          strategyId: req.id,
          workflowId: row.n8n_workflow_id,
        });
      } else {
        console.log(`ℹ️ No n8n workflow to delete for strategy:`, { strategyId: req.id });
      }

      // Step 2: Delete strategy from database (only if workflow deletion succeeded)
      await db.run("DELETE FROM strategies WHERE id = ?", [req.id]);
      console.log("✅ Strategy deleted:", req.id);
      return create(DeleteStrategyResponseSchema, { success: true });
    } catch (error) {
      console.error("❌ Error deleting strategy:", error);
      throw error;
    }
  },

  async startStrategy(
    req: StartStrategyRequest,
    context: HandlerContext
  ): Promise<StartStrategyResponse> {
    try {
      const userId = getCurrentUserId(context);
      console.log("▶️ Starting strategy:", req.id, "userId:", userId);
      const now = new Date().toISOString();

      // Use direct query instead of prepared statement
      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
      }

      // Check ownership
      if (userId !== row.user_id) {
        throw new Error("Access denied: You can only start your own strategies");
      }

      // Use direct query instead of prepared statement
      // Ensure workflow exists (sync) before activating
      const workflowId = await ensureWorkflowExists(row);

      // Use transaction: DB update and workflow activation must both succeed
      try {
        await db.run("BEGIN TRANSACTION");

        // Step 1: Update database
        await db.run(
          "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
          ["STRATEGY_STATUS_ACTIVE", now, now, req.id]
        );
        console.log(`✅ Strategy database updated to ACTIVE`);

        // Step 2: Activate n8n workflow (must succeed or rollback)
        console.log(`▶️ Activating n8n workflow for strategy:`, {
          strategyId: req.id,
          workflowId,
        });
        await n8nClient.activateWorkflow(workflowId);

        // Verify workflow is actually active
        const workflow = await n8nClient.getWorkflow(workflowId);
        if (!workflow.active) {
          throw new Error("Workflow activation reported success but workflow is still inactive");
        }

        console.log(`✅ n8n workflow activated successfully and verified:`, {
          strategyId: req.id,
          workflowId,
          workflowActive: workflow.active,
        });

        // Commit transaction if all operations succeeded
        await db.run("COMMIT");
        console.log(`✅ Strategy start transaction committed`);
      } catch (error) {
        // Rollback database changes if workflow activation failed
        console.error(`❌ Error during strategy start, rolling back:`, {
          strategyId: req.id,
          error: error instanceof Error ? error.message : String(error),
        });

        try {
          await db.run("ROLLBACK");
          console.log(`🔄 Transaction rolled back`);
        } catch (rollbackError) {
          console.error(`❌ Failed to rollback transaction:`, rollbackError);
        }

        throw new Error(
          `Failed to start strategy: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Use direct query instead of prepared statement
      const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.id,
      ])) as StrategyRow;
      const strategy = await dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy started:", req.id);
      return create(StartStrategyResponseSchema, { strategy });
    } catch (error) {
      console.error("❌ Error starting strategy:", error);
      throw error;
    }
  },

  async pauseStrategy(
    req: PauseStrategyRequest,
    context: HandlerContext
  ): Promise<PauseStrategyResponse> {
    try {
      const userId = getCurrentUserId(context);
      console.log("⏸️ Pausing strategy:", req.id, "userId:", userId);
      const now = new Date().toISOString();

      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
      }

      // Check ownership
      if (userId !== row.user_id) {
        throw new Error("Access denied: You can only pause your own strategies");
      }

      // Use transaction: DB update and workflow deactivation must both succeed
      try {
        await db.run("BEGIN TRANSACTION");

        // Step 1: Update database
        await db.run(
          "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
          ["STRATEGY_STATUS_PAUSED", null, now, req.id]
        );
        console.log(`✅ Strategy database updated to PAUSED`);

        // Step 2: Deactivate n8n workflow if it exists (must succeed or rollback)
        if (row.n8n_workflow_id) {
          console.log(`⏸️ Deactivating n8n workflow for strategy:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
          await n8nClient.deactivateWorkflow(row.n8n_workflow_id);

          // Verify workflow is actually inactive
          const workflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
          if (workflow.active) {
            console.error(
              "⚠️ Workflow deactivation reported success but workflow is still active:",
              {
                strategyId: req.id,
                workflowId: row.n8n_workflow_id,
              }
            );
            // Retry deactivation once
            await n8nClient.deactivateWorkflow(row.n8n_workflow_id);
            const retryWorkflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
            if (retryWorkflow.active) {
              throw new Error("Workflow still active after retry");
            }
          }

          console.log(`✅ n8n workflow deactivated successfully and verified:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            workflowActive: workflow.active,
          });
        } else {
          console.log(`ℹ️ No n8n workflow found for strategy:`, { strategyId: req.id });
        }

        // Commit transaction if all operations succeeded
        await db.run("COMMIT");
        console.log(`✅ Strategy pause transaction committed`);
      } catch (error) {
        // Rollback database changes if workflow deactivation failed
        console.error(`❌ Error during strategy pause, rolling back:`, {
          strategyId: req.id,
          error: error instanceof Error ? error.message : String(error),
        });

        try {
          await db.run("ROLLBACK");
          console.log(`🔄 Transaction rolled back`);
        } catch (rollbackError) {
          console.error(`❌ Failed to rollback transaction:`, rollbackError);
        }

        throw new Error(
          `Failed to pause strategy: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.id,
      ])) as StrategyRow;
      const strategy = await dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy paused:", req.id);
      return create(PauseStrategyResponseSchema, { strategy });
    } catch (error) {
      console.error("❌ Error pausing strategy:", error);
      throw error;
    }
  },

  async stopStrategy(
    req: StopStrategyRequest,
    context: HandlerContext
  ): Promise<StopStrategyResponse> {
    try {
      const userId = getCurrentUserId(context);
      console.log("⏹️ Stopping strategy:", req.id, "userId:", userId);
      const now = new Date().toISOString();

      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
      }

      // Check ownership
      if (userId !== row.user_id) {
        throw new Error("Access denied: You can only stop your own strategies");
      }

      // Use transaction: DB update and workflow deactivation must both succeed
      try {
        await db.run("BEGIN TRANSACTION");

        // Step 1: Update database
        await db.run(
          "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
          ["STRATEGY_STATUS_STOPPED", null, now, req.id]
        );
        console.log(`✅ Strategy database updated to STOPPED`);

        // Step 2: Deactivate n8n workflow if it exists (must succeed or rollback)
        if (row.n8n_workflow_id) {
          console.log(`⏸️ Deactivating n8n workflow for stopped strategy:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
          await n8nClient.deactivateWorkflow(row.n8n_workflow_id);

          // Verify workflow is actually inactive
          const workflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
          if (workflow.active) {
            console.error(
              "⚠️ Workflow deactivation reported success but workflow is still active:",
              {
                strategyId: req.id,
                workflowId: row.n8n_workflow_id,
              }
            );
            // Retry deactivation once
            await n8nClient.deactivateWorkflow(row.n8n_workflow_id);
            const retryWorkflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
            if (retryWorkflow.active) {
              throw new Error("Workflow still active after retry");
            }
          }

          console.log(`✅ n8n workflow deactivated successfully and verified:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            workflowActive: workflow.active,
          });
        } else {
          console.log(`ℹ️ No n8n workflow found for strategy:`, { strategyId: req.id });
        }

        // Commit transaction if all operations succeeded
        await db.run("COMMIT");
        console.log(`✅ Strategy stop transaction committed`);
      } catch (error) {
        // Rollback database changes if workflow deactivation failed
        console.error(`❌ Error during strategy stop, rolling back:`, {
          strategyId: req.id,
          error: error instanceof Error ? error.message : String(error),
        });

        try {
          await db.run("ROLLBACK");
          console.log(`🔄 Transaction rolled back`);
        } catch (rollbackError) {
          console.error(`❌ Failed to rollback transaction:`, rollbackError);
        }

        throw new Error(
          `Failed to stop strategy: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.id,
      ])) as StrategyRow;
      const strategy = await dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy stopped:", req.id);
      return create(StopStrategyResponseSchema, { strategy });
    } catch (error) {
      console.error("❌ Error stopping strategy:", error);
      throw error;
    }
  },

  async triggerPredictions(
    req: TriggerPredictionsRequest,
    context: HandlerContext
  ): Promise<TriggerPredictionsResponse> {
    try {
      const userId = getCurrentUserId(context);
      console.log("🎯 Triggering predictions for strategy:", req.id, "userId:", userId);

      // Get strategy from database
      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;

      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
      }

      // Check ownership
      if (userId !== row.user_id) {
        throw new Error("Access denied: You can only trigger predictions for your own strategies");
      }

      // Validate strategy is active
      if (row.status !== "STRATEGY_STATUS_ACTIVE") {
        throw new Error(
          `Cannot trigger predictions for inactive strategy. Current status: ${row.status}`
        );
      }

      // Ensure workflow exists (sync) before executing
      const workflowId = await ensureWorkflowExists(row);

      // Execute the n8n workflow manually
      console.log(`▶️ Executing n8n workflow:`, {
        strategyId: req.id,
        workflowId,
      });

      await n8nClient.executeWorkflow(workflowId);

      console.log(`✅ Predictions triggered successfully:`, {
        strategyId: req.id,
        workflowId,
      });

      return create(TriggerPredictionsResponseSchema, {
        success: true,
        message: "Prediction generation triggered successfully. Check back in a few moments.",
      });
    } catch (error) {
      console.error("❌ Error triggering predictions:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return create(TriggerPredictionsResponseSchema, {
        success: false,
        message: `Failed to trigger predictions: ${errorMessage}`,
      });
    }
  },

  async updateStrategyPrivacy(
    req: UpdateStrategyPrivacyRequest,
    context: HandlerContext
  ): Promise<UpdateStrategyPrivacyResponse> {
    const userId = getCurrentUserId(context);

    // Check strategy exists and ownership
    const existingRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!existingRow) {
      throw new Error(`Strategy not found: ${req.id}`);
    }

    // Check ownership
    if (userId !== existingRow.user_id) {
      throw new Error("Access denied: You can only update privacy for your own strategies");
    }

    const privacyStr = mapPrivacyToDb(req.privacy);
    await db.run("UPDATE strategies SET privacy = ?, updated_at = ? WHERE id = ?", [
      privacyStr,
      new Date().toISOString(),
      req.id,
    ]);

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new Error(`Strategy not found: ${req.id}`);
    }

    const strategy = await dbRowToProtoStrategy(row);
    return create(UpdateStrategyPrivacyResponseSchema, { strategy });
  },

  // ============================================================================
  // AUTH RPCs
  // ============================================================================

  async sendOTP(req: SendOTPRequest): Promise<SendOTPResponse> {
    console.log(`\n${"=".repeat(80)}`);
    console.log(`[STRATEGY SERVICE] sendOTP called`);
    console.log(`Request email:`, req.email);
    console.log(`Request object:`, JSON.stringify(req, null, 2));
    console.log(`${"=".repeat(80)}\n`);

    try {
      if (!req.email) {
        console.error(`[STRATEGY SERVICE] ❌ Missing email in request`);
        return create(SendOTPResponseSchema, {
          success: false,
          message: "Email is required",
        });
      }

      console.log(`[STRATEGY SERVICE] 📧 Calling sendOTPHelper for: ${req.email}`);
      await sendOTPHelper(req.email);
      console.log(`[STRATEGY SERVICE] ✅ sendOTPHelper completed successfully`);

      return create(SendOTPResponseSchema, {
        success: true,
        message: "OTP sent successfully. Check your email.",
      });
    } catch (error) {
      console.error(`[STRATEGY SERVICE] ❌ Error in sendOTP:`, error);
      console.error(
        `[STRATEGY SERVICE] Error stack:`,
        error instanceof Error ? error.stack : "N/A"
      );
      return create(SendOTPResponseSchema, {
        success: false,
        message: error instanceof Error ? error.message : "Failed to send OTP. Please try again.",
      });
    }
  },

  async verifyOTP(req: VerifyOTPRequest): Promise<VerifyOTPResponse> {
    try {
      console.log("🔐 Verifying OTP for:", req.email);
      const user = await verifyOTPHelper(req.email, req.otpCode);

      if (!user) {
        console.warn("⚠️ Invalid OTP attempt for:", req.email);
        throw new Error("Invalid or expired OTP code");
      }

      // Generate JWT token
      const token = generateToken(user);

      // Convert user to proto
      const protoUser = create(UserSchema, {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name || "",
        avatarUrl: user.avatar_url || "",
        createdAt: timestampFromDate(timestampToDate(user.created_at)),
        updatedAt: timestampFromDate(timestampToDate(user.updated_at)),
      });

      console.log("✅ OTP verified successfully for:", user.email);
      return create(VerifyOTPResponseSchema, {
        success: true,
        user: protoUser,
        token,
      });
    } catch (error) {
      console.error("❌ Error verifying OTP:", error);
      throw error; // Re-throw to send proper error to client
    }
  },

  async getCurrentUser(
    _req: GetCurrentUserRequest,
    context: HandlerContext
  ): Promise<GetCurrentUserResponse> {
    try {
      const userId = getCurrentUserId(context);

      if (!userId) {
        return create(GetCurrentUserResponseSchema, {
          user: undefined,
        });
      }

      const user = await getUserById(userId);

      if (!user) {
        return create(GetCurrentUserResponseSchema, {
          user: undefined,
        });
      }

      const protoUser = create(UserSchema, {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name || "",
        avatarUrl: user.avatar_url || "",
        createdAt: timestampFromDate(timestampToDate(user.created_at)),
        updatedAt: timestampFromDate(timestampToDate(user.updated_at)),
      });

      return create(GetCurrentUserResponseSchema, {
        user: protoUser,
      });
    } catch (error) {
      console.error("❌ Error getting current user:", error);
      return create(GetCurrentUserResponseSchema, {
        user: undefined,
      });
    }
  },

  async updateUser(req: UpdateUserRequest, context: HandlerContext): Promise<UpdateUserResponse> {
    try {
      const userId = getCurrentUserId(context);
      if (!userId) {
        throw new ConnectError("Authentication required", Code.Unauthenticated);
      }

      // Get current user
      const currentUser = await getUserById(userId);
      if (!currentUser) {
        throw new ConnectError("User not found", Code.NotFound);
      }

      const updates: string[] = [];
      const params: (string | null)[] = [];

      // Validate and update username
      if (req.username !== undefined) {
        const newUsername = req.username.trim();

        // Validate username format: alphanumeric, underscore, hyphen, 3-30 chars
        if (newUsername.length < 3 || newUsername.length > 30) {
          throw new ConnectError(
            "Username must be between 3 and 30 characters",
            Code.InvalidArgument
          );
        }

        if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
          throw new ConnectError(
            "Username can only contain letters, numbers, underscores, and hyphens",
            Code.InvalidArgument
          );
        }

        // Check if username is already taken (by another user)
        const existingUser = await getUserByUsername(newUsername);
        if (existingUser && existingUser.id !== userId) {
          throw new ConnectError("Username is already taken", Code.AlreadyExists);
        }

        // If user is changing to their current username, no-op
        if (newUsername === currentUser.username) {
          // No change needed
        } else {
          updates.push("username = ?");
          params.push(newUsername);
        }
      }

      // Update display_name
      if (req.displayName !== undefined) {
        updates.push("display_name = ?");
        params.push(req.displayName.trim() || null);
      }

      // Update avatar_url
      if (req.avatarUrl !== undefined) {
        updates.push("avatar_url = ?");
        params.push(req.avatarUrl.trim() || null);
      }

      // If no updates, return current user
      if (updates.length === 0) {
        const userRow = await getUserById(userId);
        if (!userRow) {
          throw new ConnectError("User not found", Code.NotFound);
        }

        const protoUser = create(UserSchema, {
          id: userRow.id,
          email: userRow.email,
          username: userRow.username,
          displayName: userRow.display_name || "",
          avatarUrl: userRow.avatar_url || "",
          createdAt: timestampFromDate(timestampToDate(userRow.created_at)),
          updatedAt: timestampFromDate(timestampToDate(userRow.updated_at)),
        });

        return create(UpdateUserResponseSchema, { user: protoUser });
      }

      // Update user in database
      params.push(String(Date.now())); // updated_at
      params.push(userId); // WHERE id = ?

      const sql = `UPDATE users SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`;
      await db.run(sql, params);

      // Fetch updated user
      const updatedUser = await getUserById(userId);
      if (!updatedUser) {
        throw new ConnectError("Failed to fetch updated user", Code.Internal);
      }

      const protoUser = create(UserSchema, {
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        displayName: updatedUser.display_name || "",
        avatarUrl: updatedUser.avatar_url || "",
        createdAt: timestampFromDate(timestampToDate(updatedUser.created_at)),
        updatedAt: timestampFromDate(timestampToDate(updatedUser.updated_at)),
      });

      return create(UpdateUserResponseSchema, { user: protoUser });
    } catch (error) {
      console.error("❌ Error updating user:", error);
      if (error instanceof ConnectError) {
        throw error;
      }
      throw new ConnectError(
        error instanceof Error ? error.message : "Failed to update user",
        Code.Internal
      );
    }
  },

  // ============================================================================
  // SOCIAL RPCs
  // ============================================================================

  async followUser(req: FollowUserRequest, context: HandlerContext): Promise<FollowUserResponse> {
    try {
      const userId = getCurrentUserId(context);
      if (!userId) {
        throw new Error("Authentication required");
      }

      if (!req.userId) {
        throw new Error("User ID is required");
      }

      await followUserHelper(userId, req.userId);
      console.log(`✅ User ${userId} followed user ${req.userId}`);
      return create(FollowUserResponseSchema, { success: true });
    } catch (error) {
      console.error("❌ Error following user:", error);
      throw error;
    }
  },

  async unfollowUser(
    req: UnfollowUserRequest,
    context: HandlerContext
  ): Promise<UnfollowUserResponse> {
    try {
      const userId = getCurrentUserId(context);
      if (!userId) {
        throw new Error("Authentication required");
      }

      if (!req.userId) {
        throw new Error("User ID is required");
      }

      await unfollowUserHelper(userId, req.userId);
      console.log(`✅ User ${userId} unfollowed user ${req.userId}`);
      return create(UnfollowUserResponseSchema, { success: true });
    } catch (error) {
      console.error("❌ Error unfollowing user:", error);
      throw error;
    }
  },

  async listFollowing(
    req: ListFollowingRequest,
    context: HandlerContext
  ): Promise<ListFollowingResponse> {
    try {
      const currentUserId = getCurrentUserId(context);
      if (!currentUserId) {
        throw new Error("Authentication required");
      }

      // Use provided user_id or default to current user
      const targetUserId = req.userId || currentUserId;

      const userRows = await getFollowing(targetUserId);

      const users: User[] = await Promise.all(
        userRows.map(async (row) => {
          return create(UserSchema, {
            id: row.id,
            email: row.email,
            username: row.username,
            displayName: row.display_name ?? "",
            avatarUrl: row.avatar_url ?? "",
            createdAt: timestampFromDate(timestampToDate(row.created_at)),
            updatedAt: timestampFromDate(timestampToDate(row.updated_at)),
          });
        })
      );

      return create(ListFollowingResponseSchema, { users });
    } catch (error) {
      console.error("❌ Error listing following:", error);
      throw error;
    }
  },

  async listFollowers(
    req: ListFollowersRequest,
    context: HandlerContext
  ): Promise<ListFollowersResponse> {
    try {
      const currentUserId = getCurrentUserId(context);
      if (!currentUserId) {
        throw new Error("Authentication required");
      }

      // Use provided user_id or default to current user
      const targetUserId = req.userId || currentUserId;

      const userRows = await getFollowers(targetUserId);

      const users: User[] = await Promise.all(
        userRows.map(async (row) => {
          return create(UserSchema, {
            id: row.id,
            email: row.email,
            username: row.username,
            displayName: row.display_name ?? "",
            avatarUrl: row.avatar_url ?? "",
            createdAt: timestampFromDate(timestampToDate(row.created_at)),
            updatedAt: timestampFromDate(timestampToDate(row.updated_at)),
          });
        })
      );

      return create(ListFollowersResponseSchema, { users });
    } catch (error) {
      console.error("❌ Error listing followers:", error);
      throw error;
    }
  },

  async listCloseFriends(
    _req: ListCloseFriendsRequest,
    context: HandlerContext
  ): Promise<ListCloseFriendsResponse> {
    try {
      const userId = getCurrentUserId(context);
      if (!userId) {
        throw new Error("Authentication required");
      }

      const userRows = await getCloseFriends(userId);

      const users: User[] = await Promise.all(
        userRows.map(async (row) => {
          return create(UserSchema, {
            id: row.id,
            email: row.email,
            username: row.username,
            displayName: row.display_name ?? "",
            avatarUrl: row.avatar_url ?? "",
            createdAt: timestampFromDate(timestampToDate(row.created_at)),
            updatedAt: timestampFromDate(timestampToDate(row.updated_at)),
          });
        })
      );

      return create(ListCloseFriendsResponseSchema, { users });
    } catch (error) {
      console.error("❌ Error listing close friends:", error);
      throw error;
    }
  },

  async getUserProfile(
    req: GetUserProfileRequest,
    context: HandlerContext
  ): Promise<GetUserProfileResponse> {
    try {
      const currentUserId = getCurrentUserId(context);

      if (!req.username) {
        throw new Error("Username is required");
      }

      const targetUser = await getUserByUsername(req.username);
      if (!targetUser) {
        throw new Error(`User not found: ${req.username}`);
      }

      // Build relationship flags (only if current user is authenticated)
      let isFollowing = false;
      let isFollowedBy = false;
      let isCloseFriend = false;

      if (currentUserId) {
        isFollowing = await isFollowingHelper(currentUserId, targetUser.id);
        isFollowedBy = await isFollowingHelper(targetUser.id, currentUserId);
        isCloseFriend = await isCloseFriendHelper(currentUserId, targetUser.id);
      }

      // Get user performance (all-time)
      const perf = await calculatePerformance(targetUser.id, LeaderboardTimeframe.ALL_TIME);

      // Convert performance to proto
      const protoPerformance = create(UserPerformanceSchema, {
        userId: perf.userId,
        totalPredictions: perf.totalPredictions,
        closedPredictions: perf.closedPredictions,
        wins: perf.wins,
        winRate: perf.winRate,
        avgReturn: perf.avgReturn,
        totalRoi: perf.totalROI,
        currentStreak: perf.currentStreak,
        bestPrediction: perf.bestPrediction
          ? await dbRowToProtoPrediction(perf.bestPrediction)
          : undefined,
      });

      // Convert user to proto
      const protoUser = create(UserSchema, {
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        displayName: targetUser.display_name ?? "",
        avatarUrl: targetUser.avatar_url ?? "",
        createdAt: timestampFromDate(timestampToDate(targetUser.created_at)),
        updatedAt: timestampFromDate(timestampToDate(targetUser.updated_at)),
      });

      return create(GetUserProfileResponseSchema, {
        user: protoUser,
        isFollowing,
        isFollowedBy,
        isCloseFriend,
        performance: protoPerformance,
      });
    } catch (error) {
      console.error("❌ Error getting user profile:", error);
      throw error;
    }
  },

  async getUserPerformance(
    req: GetUserPerformanceRequest,
    context: HandlerContext
  ): Promise<GetUserPerformanceResponse> {
    try {
      const currentUserId = getCurrentUserId(context);

      // Determine which user's performance to get
      const targetUserId = req.userId || currentUserId;

      if (!targetUserId) {
        throw new ConnectError(
          "Authentication required or user_id must be provided",
          Code.Unauthenticated
        );
      }

      // Get timeframe, default to ALL_TIME
      const timeframe = req.timeframe || LeaderboardTimeframe.ALL_TIME;

      // Calculate performance
      const perf = await calculatePerformance(targetUserId, timeframe);

      // Convert to proto format
      const protoPerformance = create(UserPerformanceSchema, {
        userId: perf.userId,
        totalPredictions: perf.totalPredictions,
        closedPredictions: perf.closedPredictions,
        wins: perf.wins,
        winRate: perf.winRate,
        avgReturn: perf.avgReturn,
        totalRoi: perf.totalROI,
        currentStreak: perf.currentStreak,
        bestPrediction: perf.bestPrediction
          ? await dbRowToProtoPrediction(perf.bestPrediction)
          : undefined,
      });

      return create(GetUserPerformanceResponseSchema, {
        performance: protoPerformance,
      });
    } catch (error) {
      console.error("❌ Error getting user performance:", error);
      if (error instanceof ConnectError) {
        throw error;
      }
      throw new ConnectError(error instanceof Error ? error.message : String(error), Code.Internal);
    }
  },

  async getLeaderboard(
    req: GetLeaderboardRequest,
    context: HandlerContext
  ): Promise<GetLeaderboardResponse> {
    try {
      const currentUserId = getCurrentUserId(context);

      if (!currentUserId) {
        throw new ConnectError("Authentication required to view leaderboard", Code.Unauthenticated);
      }

      // Get request parameters with defaults
      const timeframe = req.timeframe || LeaderboardTimeframe.ALL_TIME;
      const scope = req.scope || LeaderboardScope.GLOBAL;
      const limit = req.limit || 50;
      const offset = req.offset || 0;

      // Get leaderboard data
      const leaderboardResult = await getLeaderboard(
        currentUserId,
        timeframe,
        scope,
        limit,
        offset
      );

      // Convert entries to proto format
      const protoEntries = await Promise.all(
        leaderboardResult.entries.map(async (entry) => {
          // Convert user
          const protoUser = create(UserSchema, {
            id: entry.user.id,
            email: entry.user.email,
            username: entry.user.username,
            displayName: entry.user.display_name ?? "",
            avatarUrl: entry.user.avatar_url ?? "",
            createdAt: timestampFromDate(timestampToDate(entry.user.created_at)),
            updatedAt: timestampFromDate(timestampToDate(entry.user.updated_at)),
          });

          // Convert performance
          const protoPerformance = create(UserPerformanceSchema, {
            userId: entry.performance.userId,
            totalPredictions: entry.performance.totalPredictions,
            closedPredictions: entry.performance.closedPredictions,
            wins: entry.performance.wins,
            winRate: entry.performance.winRate,
            avgReturn: entry.performance.avgReturn,
            totalRoi: entry.performance.totalROI,
            currentStreak: entry.performance.currentStreak,
            bestPrediction: entry.performance.bestPrediction
              ? await dbRowToProtoPrediction(entry.performance.bestPrediction)
              : undefined,
          });

          return create(LeaderboardEntrySchema, {
            rank: entry.rank,
            user: protoUser,
            performanceScore: entry.performanceScore,
            performance: protoPerformance,
          });
        })
      );

      // Convert current user entry if present
      let currentUserEntry: LeaderboardEntry | undefined;
      if (leaderboardResult.currentUserEntry) {
        const entry = leaderboardResult.currentUserEntry;
        const protoUser = create(UserSchema, {
          id: entry.user.id,
          email: entry.user.email,
          username: entry.user.username,
          displayName: entry.user.display_name ?? "",
          avatarUrl: entry.user.avatar_url ?? "",
          createdAt: timestampFromDate(timestampToDate(entry.user.created_at)),
          updatedAt: timestampFromDate(timestampToDate(entry.user.updated_at)),
        });

        const protoPerformance = create(UserPerformanceSchema, {
          userId: entry.performance.userId,
          totalPredictions: entry.performance.totalPredictions,
          closedPredictions: entry.performance.closedPredictions,
          wins: entry.performance.wins,
          winRate: entry.performance.winRate,
          avgReturn: entry.performance.avgReturn,
          totalRoi: entry.performance.totalROI,
          currentStreak: entry.performance.currentStreak,
          bestPrediction: entry.performance.bestPrediction
            ? await dbRowToProtoPrediction(entry.performance.bestPrediction)
            : undefined,
        });

        currentUserEntry = create(LeaderboardEntrySchema, {
          rank: entry.rank,
          user: protoUser,
          performanceScore: entry.performanceScore,
          performance: protoPerformance,
        });
      }

      return create(GetLeaderboardResponseSchema, {
        entries: protoEntries,
        totalCount: leaderboardResult.totalCount,
        currentUserEntry,
      });
    } catch (error) {
      console.error("❌ Error getting leaderboard:", error);
      if (error instanceof ConnectError) {
        throw error;
      }
      throw new ConnectError(error instanceof Error ? error.message : String(error), Code.Internal);
    }
  },

  async copyStrategy(
    req: CopyStrategyRequest,
    context: HandlerContext
  ): Promise<CopyStrategyResponse> {
    try {
      const currentUserId = getCurrentUserId(context);

      if (!currentUserId) {
        throw new ConnectError("Authentication required to copy strategies", Code.Unauthenticated);
      }

      if (!req.strategyId) {
        throw new ConnectError("Strategy ID is required", Code.InvalidArgument);
      }

      // Get the original strategy
      const originalRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.strategyId,
      ])) as StrategyRow | undefined;

      if (!originalRow) {
        throw new ConnectError(`Strategy not found: ${req.strategyId}`, Code.NotFound);
      }

      // Check if strategy is public or user owns it
      const isPublic = originalRow.privacy === "STRATEGY_PRIVACY_PUBLIC";
      const isOwner = originalRow.user_id === currentUserId;

      if (!isPublic && !isOwner) {
        throw new ConnectError("Cannot copy private strategy you don't own", Code.PermissionDenied);
      }

      // Create a copy with new ID and name
      const newId = randomUUID();
      const newName = `${originalRow.name} (Copy)`;
      let workflowId: string | null = null;

      // Convert frequency string from database to Frequency enum
      const frequencyEnum = protoNameToFrequency(originalRow.frequency);

      // Create new n8n workflow
      try {
        const workflow = await n8nClient.createStrategyWorkflow(newId, newName, frequencyEnum);
        workflowId = workflow.id;
      } catch (error) {
        console.error("❌ Failed to create n8n workflow for copied strategy:", error);
        throw new Error(
          `Failed to create n8n workflow: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Insert copied strategy
      const now = new Date().toISOString();
      const tradesPerMonth = getTradesPerMonth(frequencyEnum);
      const perTradeBudget = Math.round((originalRow.monthly_budget / tradesPerMonth) * 100) / 100;
      const perStockAllocation = Math.round((perTradeBudget / 3) * 100) / 100;

      await db.run(
        `INSERT INTO strategies (
          id, name, description, custom_prompt, monthly_budget, current_month_spent,
          current_month_start, time_horizon, frequency, risk_level, status, privacy,
          n8n_workflow_id, user_id, trades_per_month, per_trade_budget, per_stock_allocation,
          unique_stocks_count, max_unique_stocks, target_return_pct, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          newName,
          originalRow.description || "",
          originalRow.custom_prompt || "",
          originalRow.monthly_budget,
          0, // current_month_spent starts at 0
          now, // current_month_start reset
          originalRow.time_horizon || "3 months",
          originalRow.frequency,
          originalRow.risk_level,
          "STRATEGY_STATUS_PAUSED", // Copied strategies start as paused
          "STRATEGY_PRIVACY_PRIVATE", // Copied strategies are private by default
          workflowId, // n8n_workflow_id
          currentUserId, // Owned by the user copying it
          tradesPerMonth,
          perTradeBudget,
          perStockAllocation,
          0, // unique_stocks_count starts at 0
          originalRow.max_unique_stocks || 20,
          originalRow.target_return_pct || 10.0,
          now,
          now,
        ]
      );

      // Fetch the created strategy
      const newRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [newId])) as
        | StrategyRow
        | undefined;

      if (!newRow) {
        throw new ConnectError(`Failed to fetch copied strategy: ${newId}`, Code.Internal);
      }

      // Convert to proto
      const copiedStrategy = await dbRowToProtoStrategy(newRow);

      return create(CopyStrategyResponseSchema, {
        strategy: copiedStrategy,
      });
    } catch (error) {
      console.error("❌ Error copying strategy:", error);
      if (error instanceof ConnectError) {
        throw error;
      }
      throw new ConnectError(error instanceof Error ? error.message : String(error), Code.Internal);
    }
  },
};
