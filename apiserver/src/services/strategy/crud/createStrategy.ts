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
import { getCurrentUserId } from "../../authHelpers.js";
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

    // Create strategy in database (workflow will be scheduled when strategy is started)
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
        unique_stocks_count, max_unique_stocks, status,
        privacy, user_id, source_config, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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


      console.error("❌ Database error details:");
      if (dbError && typeof dbError === "object") {
        const error = dbError as { code?: unknown; errno?: unknown; message?: unknown };
        console.error("  - Error code:", error.code);
        console.error("  - Error errno:", error.errno);
        console.error("  - Error message:", error.message);
      }
      throw dbError;
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
    });

    const strategy = await dbRowToProtoStrategy(row);

    console.log("✅ Strategy created successfully:", {
      strategyId: id,
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
