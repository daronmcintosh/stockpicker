import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../../db.js";
import type {
  CreateStrategyRequest,
  CreateStrategyResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { CreateStrategyResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId, getRawToken } from "../../authHelpers.js";
import { n8nClient } from "../../n8nClient.js";
import {
  dbRowToProtoStrategy,
  frequencyToProtoName,
  getTradesPerMonth,
  protoNameToFrequency,
  riskLevelToProtoName,
} from "../strategyHelpers.js";

export async function createStrategy(
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

      // Extract user token from Authorization header for n8n workflow authentication
      const userToken = getRawToken(context);
      if (!userToken) {
        throw new ConnectError(
          "Authentication required: User token must be provided in Authorization header",
          Code.Unauthenticated
        );
      }

      const workflow = await n8nClient.createStrategyWorkflow(
        id,
        req.name,
        req.frequency,
        userToken
      );
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
      source_config: (req as unknown as { sourceConfig?: string }).sourceConfig || null, // Store as JSON string
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
      strategyData.source_config, // Add source_config
      strategyData.created_at,
      strategyData.updated_at,
    ];

    const sql = `
      INSERT INTO strategies (
        id, name, description, custom_prompt, monthly_budget,
        current_month_start, time_horizon, target_return_pct, frequency,
        trades_per_month, per_trade_budget, per_stock_allocation, risk_level,
        unique_stocks_count, max_unique_stocks, n8n_workflow_id, status,
        privacy, user_id, source_config, created_at, updated_at
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
      console.log(`ℹ️ Workflow remains inactive (matches strategy status ${strategyData.status}):`, {
        strategyId: id,
        workflowId: workflowId,
      });
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
}
