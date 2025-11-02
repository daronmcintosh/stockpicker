import { randomUUID } from "node:crypto";
import { Timestamp } from "@bufbuild/protobuf";
import { type StrategyRow, db, statements } from "../db.js";
import { appConfig } from "../config.js";
import { StrategyService } from "../gen/stockpicker/v1/strategy_connect.js";
import {
  type CreateStrategyRequest,
  CreateStrategyResponse,
  type DeleteStrategyRequest,
  DeleteStrategyResponse,
  Frequency,
  type GetStrategyRequest,
  GetStrategyResponse,
  type ListStrategiesRequest,
  ListStrategiesResponse,
  type PauseStrategyRequest,
  PauseStrategyResponse,
  RiskLevel,
  type StartStrategyRequest,
  StartStrategyResponse,
  type StopStrategyRequest,
  StopStrategyResponse,
  Strategy,
  StrategyStatus,
  type UpdateStrategyRequest,
  UpdateStrategyResponse,
} from "../gen/stockpicker/v1/strategy_pb.js";
import { n8nClient } from "./n8nClient.js";

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

// Helper to convert DB row to proto Strategy message
function dbRowToProtoStrategy(row: StrategyRow): Strategy {
  const strategy = new Strategy({
    id: row.id,
    name: row.name,
    description: row.description,
    customPrompt: row.custom_prompt,
    monthlyBudget: row.monthly_budget,
    currentMonthSpent: row.current_month_spent,
    currentMonthStart: Timestamp.fromDate(new Date(row.current_month_start)),
    timeHorizon: row.time_horizon,
    targetReturnPct: row.target_return_pct,
    frequency: protoNameToFrequency(row.frequency),
    tradesPerMonth: row.trades_per_month,
    perTradeBudget: row.per_trade_budget,
    perStockAllocation: row.per_stock_allocation,
    riskLevel: protoNameToRiskLevel(row.risk_level),
    uniqueStocksCount: row.unique_stocks_count,
    maxUniqueStocks: row.max_unique_stocks,
    status: protoNameToStrategyStatus(row.status),
    createdAt: Timestamp.fromDate(new Date(row.created_at)),
    updatedAt: Timestamp.fromDate(new Date(row.updated_at)),
  });

  if (row.next_trade_scheduled) {
    strategy.nextTradeScheduled = Timestamp.fromDate(new Date(row.next_trade_scheduled));
  }
  if (row.last_trade_executed) {
    strategy.lastTradeExecuted = Timestamp.fromDate(new Date(row.last_trade_executed));
  }

  return strategy;
}

// Strategy service implementation
export const strategyServiceImpl = {
  async createStrategy(req: CreateStrategyRequest): Promise<CreateStrategyResponse> {
    try {
      console.log("📝 Creating strategy:", {
        name: req.name,
        monthlyBudget: req.monthlyBudget,
        frequency: req.frequency,
        riskLevel: req.riskLevel,
      });

      const id = randomUUID();
      const now = new Date().toISOString();
      const tradesPerMonth = getTradesPerMonth(req.frequency);
      const perTradeBudget = req.monthlyBudget / tradesPerMonth;
      const perStockAllocation = perTradeBudget / 3; // Always 3 stocks per trade

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
        n8n_workflow_id: null, // Will be set after workflow creation
        status: "STRATEGY_STATUS_PAUSED",
        created_at: now,
        updated_at: now,
      };

      console.log("💾 Inserting strategy data:", strategyData);

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
        strategyData.created_at,
        strategyData.updated_at,
      ];

      const sql = `
        INSERT INTO strategies (
          id, name, description, custom_prompt, monthly_budget, current_month_spent,
          current_month_start, time_horizon, target_return_pct, frequency,
          trades_per_month, per_trade_budget, per_stock_allocation, risk_level,
          unique_stocks_count, max_unique_stocks, n8n_workflow_id, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Debug logging
      const placeholderCount = (sql.match(/\?/g) || []).length;
      const paramCount = params.length;
      console.log("🔍 DEBUG: SQL placeholder count:", placeholderCount);
      console.log("🔍 DEBUG: Parameter array length:", paramCount);
      console.log(
        "🔍 DEBUG: Parameters:",
        params.map((p, i) => `[${i}]: ${JSON.stringify(p)} (${typeof p})`).join("\n")
      );

      // Count columns in INSERT
      const columnMatch = sql.match(/INSERT INTO strategies\s*\(([^)]+)\)/);
      const columns = columnMatch ? columnMatch[1].split(",").map((c) => c.trim()) : [];
      console.log("🔍 DEBUG: Column count in INSERT:", columns.length);
      console.log("🔍 DEBUG: Columns:", columns);

      // Check actual table schema
      try {
        const tableInfo = await db.all("PRAGMA table_info(strategies)");
        console.log("🔍 DEBUG: Actual table column count:", tableInfo.length);
        interface TableColumnInfo {
          cid: number;
          name: string;
          type: string;
        }
        console.log(
          "🔍 DEBUG: Table columns:",
          (tableInfo as TableColumnInfo[])
            .map((col) => `${col.cid}: ${col.name} (${col.type})`)
            .join(", ")
        );
      } catch (err) {
        console.log("🔍 DEBUG: Could not get table info:", err);
      }

      try {
        await db.run(sql, params);
        console.log("✅ DEBUG: INSERT executed successfully");
      } catch (dbError: unknown) {
        console.error("❌ DEBUG: Database error details:");
        if (dbError && typeof dbError === "object") {
          const error = dbError as { code?: unknown; errno?: unknown; message?: unknown };
          console.error("  - Error code:", error.code);
          console.error("  - Error errno:", error.errno);
          console.error("  - Error message:", error.message);
        }
        console.error("  - SQL:", sql);
        console.error("  - Params length:", params.length);
        console.error("  - First 5 params:", params.slice(0, 5));
        console.error("  - Last 5 params:", params.slice(-5));
        throw dbError;
      }

      // Create n8n workflow for this strategy
      try {
        // Use internal Docker service name for n8n workflows to call back to API
        const apiUrl = appConfig.n8n.apiServerUrl;
        console.log(`📝 Creating n8n workflow for new strategy:`, {
          strategyId: id,
          strategyName: req.name,
          apiUrl,
        });
        
        const workflow = await n8nClient.createStrategyWorkflow(
          id,
          req.name,
          req.frequency,
          apiUrl
        );

        // Store workflow ID in database - use direct query to avoid prepared statement issues
        const now = new Date().toISOString();
        console.log("💾 Linking workflow to strategy:", {
          strategyId: id,
          workflowId: workflow.id,
        });
        await db.run("UPDATE strategies SET n8n_workflow_id = ?, updated_at = ? WHERE id = ?", [
          workflow.id,
          now,
          id,
        ]);

        console.log(`✅ n8n workflow created and linked successfully:`, {
          strategyId: id,
          workflowId: workflow.id,
          workflowName: workflow.name,
        });
      } catch (error) {
        console.error("⚠️ Failed to create n8n workflow (strategy still created):", {
          strategyId: id,
          strategyName: req.name,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue - strategy is created, workflow can be created later
      }

      // Fetch the created strategy - use direct query to avoid prepared statement issues
      console.log("🔍 DEBUG: Fetching created strategy with id:", id);
      let row: StrategyRow;
      try {
        row = (await db.get("SELECT * FROM strategies WHERE id = ?", [id])) as StrategyRow;
        console.log("🔍 DEBUG: Strategy fetched successfully, columns:", Object.keys(row || {}));
      } catch (fetchError: unknown) {
        console.error("❌ DEBUG: Error fetching strategy:", fetchError);
        if (fetchError && typeof fetchError === "object") {
          const error = fetchError as { code?: unknown; message?: unknown };
          console.error("  - Error code:", error.code);
          console.error("  - Error message:", error.message);
        }
        throw fetchError;
      }

      const strategy = dbRowToProtoStrategy(row);
      console.log("✅ Strategy created successfully:", id);

      return new CreateStrategyResponse({ strategy });
    } catch (error) {
      console.error("❌ Error creating strategy:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  },

  async listStrategies(req: ListStrategiesRequest): Promise<ListStrategiesResponse> {
    try {
      console.log("📋 Listing strategies, status filter:", req.status || "all");
      let rows: StrategyRow[];
      if (req.status) {
        rows = (await db.all("SELECT * FROM strategies WHERE status = ? ORDER BY created_at DESC", [
          strategyStatusToProtoName(req.status),
        ])) as StrategyRow[];
      } else {
        rows = (await db.all("SELECT * FROM strategies ORDER BY created_at DESC")) as StrategyRow[];
      }

      const strategies = rows.map((row) => dbRowToProtoStrategy(row));
      console.log(`✅ Found ${strategies.length} strategies`);
      return new ListStrategiesResponse({ strategies });
    } catch (error) {
      console.error("❌ Error listing strategies:", error);
      throw error;
    }
  },

  async getStrategy(req: GetStrategyRequest): Promise<GetStrategyResponse> {
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
      | StrategyRow
      | undefined;
    if (!row) {
      throw new Error(`Strategy not found: ${req.id}`);
    }
    const strategy = dbRowToProtoStrategy(row);
    return new GetStrategyResponse({ strategy });
  },

  async updateStrategy(req: UpdateStrategyRequest): Promise<UpdateStrategyResponse> {
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
    const strategy = dbRowToProtoStrategy(row);
    return new UpdateStrategyResponse({ strategy });
  },

  async deleteStrategy(req: DeleteStrategyRequest): Promise<DeleteStrategyResponse> {
    try {
      // Check if strategy exists and is stopped
      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
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

  async startStrategy(req: StartStrategyRequest): Promise<StartStrategyResponse> {
    try {
      console.log("▶️ Starting strategy:", req.id);
      const now = new Date().toISOString();

      // Use direct query instead of prepared statement
      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
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
          console.log(`✅ n8n workflow activated successfully:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
          });
        } catch (error) {
          console.error("⚠️ Failed to activate n8n workflow (strategy is still started):", {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue - strategy is started, workflow activation can be retried
        }
      } else {
        console.log(`⚠️ No n8n workflow found for strategy:`, { strategyId: req.id });
      }

      // Use direct query instead of prepared statement
      const updatedRow = (await db.get("SELECT * FROM strategies WHERE id = ?", [
        req.id,
      ])) as StrategyRow;
      const strategy = dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy started:", req.id);
      return new StartStrategyResponse({ strategy });
    } catch (error) {
      console.error("❌ Error starting strategy:", error);
      throw error;
    }
  },

  async pauseStrategy(req: PauseStrategyRequest): Promise<PauseStrategyResponse> {
    try {
      console.log("⏸️ Pausing strategy:", req.id);
      const now = new Date().toISOString();

      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
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
          console.log(`✅ n8n workflow deactivated successfully:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
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
      const strategy = dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy paused:", req.id);
      return new PauseStrategyResponse({ strategy });
    } catch (error) {
      console.error("❌ Error pausing strategy:", error);
      throw error;
    }
  },

  async stopStrategy(req: StopStrategyRequest): Promise<StopStrategyResponse> {
    try {
      console.log("⏹️ Stopping strategy:", req.id);
      const now = new Date().toISOString();

      const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [req.id])) as
        | StrategyRow
        | undefined;
      if (!row) {
        throw new Error(`Strategy not found: ${req.id}`);
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
          console.log(`✅ n8n workflow deactivated successfully:`, {
            strategyId: req.id,
            workflowId: row.n8n_workflow_id,
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
      const strategy = dbRowToProtoStrategy(updatedRow);
      console.log("✅ Strategy stopped:", req.id);
      return new StopStrategyResponse({ strategy });
    } catch (error) {
      console.error("❌ Error stopping strategy:", error);
      throw error;
    }
  },
};
