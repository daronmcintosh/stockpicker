import { randomUUID } from "node:crypto";
import { Timestamp } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { appConfig } from "../config.js";
import { type StrategyRow, db, statements } from "../db.js";
import { StrategyService } from "../gen/stockpicker/v1/strategy_connect.js";
import {
  type CopyStrategyRequest,
  CopyStrategyResponse,
  type CreateStrategyRequest,
  CreateStrategyResponse,
  type DeleteStrategyRequest,
  DeleteStrategyResponse,
  type FollowUserRequest,
  FollowUserResponse,
  Frequency,
  type GetCurrentUserRequest,
  GetCurrentUserResponse,
  type GetLeaderboardRequest,
  GetLeaderboardResponse,
  type GetStrategyRequest,
  GetStrategyResponse,
  type GetUserPerformanceRequest,
  GetUserPerformanceResponse,
  type GetUserProfileRequest,
  GetUserProfileResponse,
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardTimeframe,
  type ListCloseFriendsRequest,
  ListCloseFriendsResponse,
  type ListFollowersRequest,
  ListFollowersResponse,
  type ListFollowingRequest,
  ListFollowingResponse,
  type ListStrategiesRequest,
  ListStrategiesResponse,
  type PauseStrategyRequest,
  PauseStrategyResponse,
  RiskLevel,
  type SendOTPRequest,
  SendOTPResponse,
  type StartStrategyRequest,
  StartStrategyResponse,
  type StopStrategyRequest,
  StopStrategyResponse,
  Strategy,
  StrategyPrivacy,
  StrategyStatus,
  type TriggerPredictionsRequest,
  TriggerPredictionsResponse,
  type UnfollowUserRequest,
  UnfollowUserResponse,
  type UpdateStrategyPrivacyRequest,
  UpdateStrategyPrivacyResponse,
  type UpdateStrategyRequest,
  UpdateStrategyResponse,
  type UpdateUserRequest,
  UpdateUserResponse,
  User,
  UserPerformance,
  type VerifyOTPRequest,
  VerifyOTPResponse,
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
import { calculatePerformance, calculatePerformanceScore } from "./performanceHelpers.js";
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
    const strategy = new Strategy({
      id: row.id,
      name: row.name,
      description: row.description,
      customPrompt: row.custom_prompt,
      monthlyBudget: toNumber(row.monthly_budget),
      currentMonthSpent: toNumber(row.current_month_spent),
      currentMonthStart: Timestamp.fromDate(new Date(row.current_month_start)),
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
      createdAt: Timestamp.fromDate(new Date(row.created_at)),
      updatedAt: Timestamp.fromDate(new Date(row.updated_at)),
    });

    if (row.next_trade_scheduled) {
      strategy.nextTradeScheduled = Timestamp.fromDate(new Date(row.next_trade_scheduled));
    }
    if (row.last_trade_executed) {
      strategy.lastTradeExecuted = Timestamp.fromDate(new Date(row.last_trade_executed));
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
          strategy.user = new User({
            id: userRow.id,
            email: userRow.email,
            username: userRow.username,
            displayName: userRow.display_name ?? undefined,
            avatarUrl: userRow.avatar_url ?? undefined,
            createdAt: Timestamp.fromDate(timestampToDate(userRow.created_at)),
            updatedAt: Timestamp.fromDate(timestampToDate(userRow.updated_at)),
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
    const authHeader = context.requestHeader.get("authorization");

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

      return new CreateStrategyResponse({ strategy });
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
      return new ListStrategiesResponse({ strategies });
    } catch (error) {
      console.error("❌ Error listing strategies:", error);
      throw error;
    }
  },

  async getStrategy(
    req: GetStrategyRequest,
    context: HandlerContext
  ): Promise<GetStrategyResponse> {
    const userId = getCurrentUserId(context);
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new Error(`Strategy not found: ${req.id}`);
    }

    // Check access: owner or public
    const isOwner = userId && row.user_id === userId;
    const isPublic = row.privacy === "STRATEGY_PRIVACY_PUBLIC";

    if (!isOwner && !isPublic) {
      throw new Error("Access denied: This strategy is private");
    }

    const strategy = await dbRowToProtoStrategy(row);
    return new GetStrategyResponse({ strategy });
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

    if (updates.length > 0) {
      updates.push("updated_at = ?");
      params.push(now);
      params.push(req.id); // for WHERE clause

      await db.run(`UPDATE strategies SET ${updates.join(", ")} WHERE id = ?`, params);
    }

    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as StrategyRow;
    const strategy = await dbRowToProtoStrategy(row);
    return new UpdateStrategyResponse({ strategy });
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

      // Delete n8n workflow if it exists
      if (row.n8n_workflow_id) {
        try {
          console.log(`🗑️ Deleting n8n workflow for strategy:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
          await n8nClient.deleteWorkflow(row.n8n_workflow_id);
          console.log(`✅ n8n workflow deleted successfully:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
        } catch (error) {
          console.error("⚠️ Failed to delete n8n workflow (strategy will still be deleted):", {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue - delete strategy even if workflow deletion fails
        }
      } else {
        console.log(`ℹ️ No n8n workflow to delete for strategy:`, { strategyId: req.id });
      }

      await db.run("DELETE FROM strategies WHERE id = ?", [req.id]);
      console.log("✅ Strategy deleted:", req.id);
      return new DeleteStrategyResponse({ success: true });
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
      await db.run(
        "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
        ["STRATEGY_STATUS_ACTIVE", now, now, req.id]
      );

      // Activate n8n workflow if it exists
      if (row.n8n_workflow_id) {
        try {
          console.log(`▶️ Activating n8n workflow for strategy:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
          await n8nClient.activateWorkflow(row.n8n_workflow_id);

          // Verify workflow is actually active
          const workflow = await n8nClient.getWorkflow(row.n8n_workflow_id);
          if (!workflow.active) {
            console.error(
              "⚠️ Workflow activation reported success but workflow is still inactive:",
              {
                strategyId: req.id,
                workflowId: row.n8n_workflow_id,
              }
            );
            // Revert strategy status to match workflow state
            await db.run("UPDATE strategies SET status = ?, updated_at = ? WHERE id = ?", [
              "STRATEGY_STATUS_PAUSED",
              now,
              req.id,
            ]);
            throw new Error("Workflow activation failed - strategy status reverted to PAUSED");
          }

          console.log(`✅ n8n workflow activated successfully and verified:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            workflowActive: workflow.active,
          });
        } catch (error) {
          console.error("⚠️ Failed to activate n8n workflow:", {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Revert strategy status to match workflow state (inactive)
          try {
            await db.run("UPDATE strategies SET status = ?, updated_at = ? WHERE id = ?", [
              "STRATEGY_STATUS_PAUSED",
              now,
              req.id,
            ]);
            console.log(`⚠️ Strategy status reverted to PAUSED to match workflow state:`, {
              strategyId: req.id,
            });
          } catch (revertError) {
            console.error("❌ Failed to revert strategy status:", revertError);
          }
          throw new Error(
            `Failed to activate workflow: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      } else {
        console.log(`⚠️ No n8n workflow found for strategy:`, { strategyId: req.id });
      }

      // Use direct query instead of prepared statement
      const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.id,
      ])) as StrategyRow;
      const strategy = await dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy started:", req.id);
      return new StartStrategyResponse({ strategy });
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

      await db.run(
        "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
        ["STRATEGY_STATUS_PAUSED", null, now, req.id]
      );

      // Deactivate n8n workflow if it exists
      if (row.n8n_workflow_id) {
        try {
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
              console.error("❌ Workflow still active after retry:", {
                strategyId: req.id,
                workflowId: row.n8n_workflow_id,
              });
            }
          }

          console.log(`✅ n8n workflow deactivated successfully and verified:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            workflowActive: workflow.active,
          });
        } catch (error) {
          console.error("⚠️ Failed to deactivate n8n workflow (strategy is still paused):", {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue - strategy is paused, workflow deactivation can be retried
        }
      } else {
        console.log(`ℹ️ No n8n workflow found for strategy:`, { strategyId: req.id });
      }

      const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.id,
      ])) as StrategyRow;
      const strategy = await dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy paused:", req.id);
      return new PauseStrategyResponse({ strategy });
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

      await db.run(
        "UPDATE strategies SET status = ?, next_trade_scheduled = ?, updated_at = ? WHERE id = ?",
        ["STRATEGY_STATUS_STOPPED", null, now, req.id]
      );

      // Deactivate n8n workflow if it exists (but don't delete it)
      if (row.n8n_workflow_id) {
        try {
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
          }

          console.log(`✅ n8n workflow deactivated successfully and verified:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            workflowActive: workflow.active,
          });
        } catch (error) {
          console.error("⚠️ Failed to deactivate n8n workflow (strategy is still stopped):", {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue - strategy is stopped, workflow deactivation can be retried
        }
      } else {
        console.log(`ℹ️ No n8n workflow found for strategy:`, { strategyId: req.id });
      }

      const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.id,
      ])) as StrategyRow;
      const strategy = await dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy stopped:", req.id);
      return new StopStrategyResponse({ strategy });
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

      // Validate workflow exists
      if (!row.n8n_workflow_id) {
        throw new Error(
          `No workflow found for strategy ${req.id}. Strategy may not have been started properly.`
        );
      }

      // Execute the n8n workflow manually
      console.log(`▶️ Executing n8n workflow:`, {
        strategyId: req.id,
        workflowId: row.n8n_workflow_id,
      });

      await n8nClient.executeWorkflow(row.n8n_workflow_id);

      console.log(`✅ Predictions triggered successfully:`, {
        strategyId: req.id,
        workflowId: row.n8n_workflow_id,
      });

      return new TriggerPredictionsResponse({
        success: true,
        message: "Prediction generation triggered successfully. Check back in a few moments.",
      });
    } catch (error) {
      console.error("❌ Error triggering predictions:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return new TriggerPredictionsResponse({
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
    return new UpdateStrategyPrivacyResponse({ strategy });
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
        return new SendOTPResponse({
          success: false,
          message: "Email is required",
        });
      }

      console.log(`[STRATEGY SERVICE] 📧 Calling sendOTPHelper for: ${req.email}`);
      await sendOTPHelper(req.email);
      console.log(`[STRATEGY SERVICE] ✅ sendOTPHelper completed successfully`);

      return new SendOTPResponse({
        success: true,
        message: "OTP sent successfully. Check your email.",
      });
    } catch (error) {
      console.error(`[STRATEGY SERVICE] ❌ Error in sendOTP:`, error);
      console.error(
        `[STRATEGY SERVICE] Error stack:`,
        error instanceof Error ? error.stack : "N/A"
      );
      return new SendOTPResponse({
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
      const protoUser = new User({
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name || undefined,
        avatarUrl: user.avatar_url || undefined,
        createdAt: Timestamp.fromDate(timestampToDate(user.created_at)),
        updatedAt: Timestamp.fromDate(timestampToDate(user.updated_at)),
      });

      console.log("✅ OTP verified successfully for:", user.email);
      return new VerifyOTPResponse({
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
        return new GetCurrentUserResponse({
          user: undefined,
        });
      }

      const user = await getUserById(userId);

      if (!user) {
        return new GetCurrentUserResponse({
          user: undefined,
        });
      }

      const protoUser = new User({
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.display_name || undefined,
        avatarUrl: user.avatar_url || undefined,
        createdAt: Timestamp.fromDate(timestampToDate(user.created_at)),
        updatedAt: Timestamp.fromDate(timestampToDate(user.updated_at)),
      });

      return new GetCurrentUserResponse({
        user: protoUser,
      });
    } catch (error) {
      console.error("❌ Error getting current user:", error);
      return new GetCurrentUserResponse({
        user: undefined,
      });
    }
  },

  async updateUser(
    req: UpdateUserRequest,
    context: HandlerContext
  ): Promise<UpdateUserResponse> {
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
          throw new ConnectError(
            "Username is already taken",
            Code.AlreadyExists
          );
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

        const protoUser = new User({
          id: userRow.id,
          email: userRow.email,
          username: userRow.username,
          displayName: userRow.display_name || undefined,
          avatarUrl: userRow.avatar_url || undefined,
          createdAt: Timestamp.fromDate(timestampToDate(userRow.created_at)),
          updatedAt: Timestamp.fromDate(timestampToDate(userRow.updated_at)),
        });

        return new UpdateUserResponse({ user: protoUser });
      }

      // Update user in database
      params.push(Date.now()); // updated_at
      params.push(userId); // WHERE id = ?

      const sql = `UPDATE users SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`;
      await db.run(sql, params);

      // Fetch updated user
      const updatedUser = await getUserById(userId);
      if (!updatedUser) {
        throw new ConnectError("Failed to fetch updated user", Code.Internal);
      }

      const protoUser = new User({
        id: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        displayName: updatedUser.display_name || undefined,
        avatarUrl: updatedUser.avatar_url || undefined,
        createdAt: Timestamp.fromDate(timestampToDate(updatedUser.created_at)),
        updatedAt: Timestamp.fromDate(timestampToDate(updatedUser.updated_at)),
      });

      return new UpdateUserResponse({ user: protoUser });
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
      return new FollowUserResponse({ success: true });
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
      return new UnfollowUserResponse({ success: true });
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

      const users = await Promise.all(
        userRows.map(async (row) => {
          return new User({
            id: row.id,
            email: row.email,
            username: row.username,
            displayName: row.display_name ?? undefined,
            avatarUrl: row.avatar_url ?? undefined,
            createdAt: Timestamp.fromDate(timestampToDate(row.created_at)),
            updatedAt: Timestamp.fromDate(timestampToDate(row.updated_at)),
          });
        })
      );

      return new ListFollowingResponse({ users });
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

      const users = await Promise.all(
        userRows.map(async (row) => {
          return new User({
            id: row.id,
            email: row.email,
            username: row.username,
            displayName: row.display_name ?? undefined,
            avatarUrl: row.avatar_url ?? undefined,
            createdAt: Timestamp.fromDate(timestampToDate(row.created_at)),
            updatedAt: Timestamp.fromDate(timestampToDate(row.updated_at)),
          });
        })
      );

      return new ListFollowersResponse({ users });
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

      const users = await Promise.all(
        userRows.map(async (row) => {
          return new User({
            id: row.id,
            email: row.email,
            username: row.username,
            displayName: row.display_name ?? undefined,
            avatarUrl: row.avatar_url ?? undefined,
            createdAt: Timestamp.fromDate(timestampToDate(row.created_at)),
            updatedAt: Timestamp.fromDate(timestampToDate(row.updated_at)),
          });
        })
      );

      return new ListCloseFriendsResponse({ users });
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
      const protoPerformance = new UserPerformance({
        userId: perf.userId,
        totalPredictions: perf.totalPredictions,
        closedPredictions: perf.closedPredictions,
        wins: perf.wins,
        winRate: perf.winRate,
        avgReturn: perf.avgReturn,
        totalRoi: perf.totalROI,
        currentStreak: perf.currentStreak,
        // bestPrediction will be handled separately if needed
      });

      // Convert user to proto
      const protoUser = new User({
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        displayName: targetUser.display_name ?? undefined,
        avatarUrl: targetUser.avatar_url ?? undefined,
        createdAt: Timestamp.fromDate(timestampToDate(targetUser.created_at)),
        updatedAt: Timestamp.fromDate(timestampToDate(targetUser.updated_at)),
      });

      return new GetUserProfileResponse({
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
      const protoPerformance = new UserPerformance({
        userId: perf.userId,
        totalPredictions: perf.totalPredictions,
        closedPredictions: perf.closedPredictions,
        wins: perf.wins,
        winRate: perf.winRate,
        avgReturn: perf.avgReturn,
        totalRoi: perf.totalROI,
        currentStreak: perf.currentStreak,
        // bestPrediction can be added later if needed
      });

      return new GetUserPerformanceResponse({
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
          const protoUser = new User({
            id: entry.user.id,
            email: entry.user.email,
            username: entry.user.username,
            displayName: entry.user.display_name ?? undefined,
            avatarUrl: entry.user.avatar_url ?? undefined,
            createdAt: Timestamp.fromDate(timestampToDate(entry.user.created_at)),
            updatedAt: Timestamp.fromDate(timestampToDate(entry.user.updated_at)),
          });

          // Convert performance
          const protoPerformance = new UserPerformance({
            userId: entry.performance.userId,
            totalPredictions: entry.performance.totalPredictions,
            closedPredictions: entry.performance.closedPredictions,
            wins: entry.performance.wins,
            winRate: entry.performance.winRate,
            avgReturn: entry.performance.avgReturn,
            totalRoi: entry.performance.totalROI,
            currentStreak: entry.performance.currentStreak,
            // bestPrediction can be added later if needed
          });

          return new LeaderboardEntry({
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
        const protoUser = new User({
          id: entry.user.id,
          email: entry.user.email,
          username: entry.user.username,
          displayName: entry.user.display_name ?? undefined,
          avatarUrl: entry.user.avatar_url ?? undefined,
          createdAt: Timestamp.fromDate(timestampToDate(entry.user.created_at)),
          updatedAt: Timestamp.fromDate(timestampToDate(entry.user.updated_at)),
        });

        const protoPerformance = new UserPerformance({
          userId: entry.performance.userId,
          totalPredictions: entry.performance.totalPredictions,
          closedPredictions: entry.performance.closedPredictions,
          wins: entry.performance.wins,
          winRate: entry.performance.winRate,
          avgReturn: entry.performance.avgReturn,
          totalRoi: entry.performance.totalROI,
          currentStreak: entry.performance.currentStreak,
        });

        currentUserEntry = new LeaderboardEntry({
          rank: entry.rank,
          user: protoUser,
          performanceScore: entry.performanceScore,
          performance: protoPerformance,
        });
      }

      return new GetLeaderboardResponse({
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

      return new CopyStrategyResponse({
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
