import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { type PredictionRow, type StrategyRow, db } from "../../db.js";
import type {
  CreatePredictionsFromWorkflowRequest,
  CreatePredictionsFromWorkflowResponse,
  PrepareDataForWorkflowRequest,
  PrepareDataForWorkflowResponse,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import {
  ActivePredictionDataSchema,
  BudgetDataSchema,
  CreatePredictionsFromWorkflowResponseSchema,
  CreatedPredictionDataSchema,
  PrepareDataForWorkflowResponseSchema,
  StrategyDataSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { dbRowToProtoStrategy } from "./strategyHelpers.js";

/**
 * Prepare data for n8n workflow execution
 * Internal endpoint called by n8n workflows to get strategy data and sources
 */
export async function prepareDataForWorkflow(
  req: PrepareDataForWorkflowRequest,
  context: HandlerContext
): Promise<PrepareDataForWorkflowResponse> {
  let workflowRunId: string | null = null;
  try {
    const strategyId = req.id;

    // Get execution ID from headers if available (n8n may send this)
    const executionId = context.requestHeader.get("x-n8n-execution-id") || null;

    // Create or update workflow run record at workflow start
    // Check if there's an existing pending workflow run for this execution
    let existingRun: { id: string; execution_id: string | null } | undefined;
    if (executionId) {
      existingRun = (await db.get(
        "SELECT id, execution_id FROM workflow_runs WHERE strategy_id = ? AND execution_id = ? AND status IN ('pending', 'running')",
        [strategyId, executionId]
      )) as { id: string; execution_id: string | null } | undefined;
    }

    if (existingRun) {
      // Update existing workflow run to running status
      workflowRunId = existingRun.id;
      await db.run(
        "UPDATE workflow_runs SET status = 'running', updated_at = datetime('now') WHERE id = ?",
        [workflowRunId]
      );
      console.log(`🔄 Updated workflow run to running:`, {
        workflowRunId,
        strategyId,
        executionId,
      });
    } else {
      // Create new workflow run record
      workflowRunId = randomUUID();
      const inputData = JSON.stringify({
        strategy_id: strategyId,
        timestamp: new Date().toISOString(),
      });

      await db.run(
        `INSERT INTO workflow_runs (id, strategy_id, execution_id, input_data, json_output, markdown_output, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, 'running', datetime('now'), datetime('now'))`,
        [workflowRunId, strategyId, executionId, inputData]
      );
      console.log(`✅ Created workflow run at start:`, {
        workflowRunId,
        strategyId,
        executionId,
      });
    }

    // Get strategy from database
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [strategyId])) as
      | StrategyRow
      | undefined;

    if (!row) {
      throw new ConnectError(`Strategy not found: ${strategyId}`, Code.NotFound);
    }

    // Validate strategy is active
    if (row.status !== "STRATEGY_STATUS_ACTIVE") {
      throw new ConnectError(
        `Strategy is not active. Current status: ${row.status}`,
        Code.FailedPrecondition
      );
    }

    // Convert strategy to proto format for data extraction
    const strategy = await dbRowToProtoStrategy(row);

    // Get active predictions for budget calculation
    const activePredictionsRows = (await db.all(
      `SELECT * FROM predictions
       WHERE strategy_id = ?
       AND status = 'PREDICTION_STATUS_ACTIVE'
       AND action = 'entered'`,
      [strategyId]
    )) as PredictionRow[];

    const { dbRowToProtoPrediction } = await import("../prediction/predictionHelpers.js");
    const activePredictions = await Promise.all(
      activePredictionsRows.map((pRow) => dbRowToProtoPrediction(pRow))
    );

    // Calculate current_month_spent from active predictions (where action = 'entered')
    // This ensures accuracy and avoids synchronization issues
    const currentMonthSpent = activePredictionsRows.reduce(
      (sum, pRow) => sum + Number(pRow.allocated_amount || 0),
      0
    );

    // Calculate detailed budget information
    const monthlyBudget = Number(row.monthly_budget || 0);
    const perStockAllocation = Number(row.per_stock_allocation || 0);
    const remainingBudget = Math.max(0, monthlyBudget - currentMonthSpent);
    const hasBudget = remainingBudget > 0;
    const availableSlots =
      perStockAllocation > 0 ? Math.floor(remainingBudget / perStockAllocation) : 0;
    const budgetUtilizationPct = monthlyBudget > 0 ? (currentMonthSpent / monthlyBudget) * 100 : 0;

    const budgetData = create(BudgetDataSchema, {
      monthlyBudget,
      currentMonthSpent,
      remainingBudget,
      perStockAllocation,
      availableSlots,
      hasBudget,
      budgetUtilizationPct,
    });

    // Parse source configuration from strategy
    let sourceConfig: {
      enabled: Record<string, boolean>;
      reddit?: { subreddits: string[] };
      news?: { sources: string[] };
    } = {
      enabled: {
        alpha_vantage: true,
        polymarket: true,
        reddit: true,
        news: true,
        earnings: true,
        politics: true,
      },
      reddit: {
        subreddits: ["wallstreetbets", "stocks", "investing"],
      },
    };

    if (row.source_config) {
      try {
        sourceConfig = JSON.parse(row.source_config as string);
      } catch (error) {
        console.warn("⚠️ Failed to parse source_config, using defaults:", error);
      }
    }

    // TODO: Aggregate multi-source stock data based on sourceConfig
    // For now, return structure with placeholder sources
    // This will be implemented with stockDataAggregator service
    const sources: Record<string, unknown> = {};

    if (sourceConfig.enabled.alpha_vantage) {
      sources.alpha_vantage = {
        top_gainers: [], // Will be populated by stockDataAggregator
        top_losers: [],
      };
    }

    if (sourceConfig.enabled.polymarket) {
      sources.polymarket = {
        stocks: [], // Will be populated by stockDataAggregator
      };
    }

    if (sourceConfig.enabled.reddit) {
      sources.reddit = {
        stocks: [], // Will be populated by stockDataAggregator
        subreddits: sourceConfig.reddit?.subreddits || ["wallstreetbets", "stocks", "investing"],
      };
    }

    if (sourceConfig.enabled.news) {
      sources.news = {
        articles: [], // Will be populated by stockDataAggregator
      };
    }

    if (sourceConfig.enabled.earnings) {
      sources.earnings = {
        upcoming: [], // Will be populated by stockDataAggregator
      };
    }

    if (sourceConfig.enabled.politics) {
      sources.politics = {
        impacts: [], // Will be populated by stockDataAggregator
      };
    }

    // Build response
    const strategyData = create(StrategyDataSchema, {
      id: strategy.id,
      name: strategy.name,
      timeHorizon: strategy.timeHorizon,
      targetReturnPct: strategy.targetReturnPct,
      riskLevel: strategy.riskLevel,
      perStockAllocation: strategy.perStockAllocation,
      customPrompt: strategy.customPrompt || "",
    });

    const activePredictionsData = activePredictions.map((p) =>
      create(ActivePredictionDataSchema, {
        id: p.id,
        symbol: p.symbol,
        allocatedAmount: p.allocatedAmount,
      })
    );

    // Update workflow run with full input data
    if (workflowRunId) {
      const fullInputData = JSON.stringify({
        strategy: strategyData,
        activePredictions: activePredictionsData,
        budget: budgetData,
        sources,
        timestamp: new Date().toISOString(),
      });

      await db.run(
        "UPDATE workflow_runs SET input_data = ?, updated_at = datetime('now') WHERE id = ?",
        [fullInputData, workflowRunId]
      );
    }

    return create(PrepareDataForWorkflowResponseSchema, {
      strategy: strategyData,
      activePredictions: activePredictionsData,
      budget: budgetData,
      sources: JSON.stringify(sources),
    });
  } catch (error) {
    console.error("❌ Error in prepareDataForWorkflow:", error);

    // Update workflow run status to failed if we created one
    if (workflowRunId) {
      try {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await db.run(
          "UPDATE workflow_runs SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
          [errorMessage, workflowRunId]
        );
        console.log(`❌ Updated workflow run to failed:`, { workflowRunId, errorMessage });
      } catch (updateError) {
        console.error("⚠️ Failed to update workflow run status:", updateError);
      }
    }

    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(
      error instanceof Error ? error.message : "Internal server error",
      Code.Internal
    );
  }
}

/**
 * Create predictions from workflow output
 * Internal endpoint called by n8n workflows to create predictions after AI analysis
 */
export async function createPredictionsFromWorkflow(
  req: CreatePredictionsFromWorkflowRequest,
  context: HandlerContext
): Promise<CreatePredictionsFromWorkflowResponse> {
  try {
    const strategyId = req.strategyId;
    const jsonOutput = req.jsonOutput;
    const markdownOutput = req.markdownOutput;
    const executionId = req.executionId;
    const inputData = req.inputData;
    const aiAnalysis = req.aiAnalysis;

    // Parse JSON output
    let jsonOutputObj: { recommendations?: Array<Record<string, unknown>> };
    try {
      jsonOutputObj = JSON.parse(jsonOutput);
    } catch (_error) {
      throw new ConnectError("Invalid JSON in json_output", Code.InvalidArgument);
    }

    // Validate outputs
    if (!jsonOutputObj || typeof jsonOutputObj !== "object") {
      throw new ConnectError("Missing or invalid json_output", Code.InvalidArgument);
    }
    if (!markdownOutput || typeof markdownOutput !== "string") {
      throw new ConnectError("Missing or invalid markdown_output", Code.InvalidArgument);
    }

    // Get strategy to validate it exists
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [strategyId])) as
      | StrategyRow
      | undefined;

    if (!row) {
      throw new ConnectError(`Strategy not found: ${strategyId}`, Code.NotFound);
    }

    // Extract recommendations from JSON output
    const recommendations = jsonOutputObj.recommendations || [];

    if (recommendations.length === 0) {
      throw new ConnectError("No recommendations found in json_output", Code.InvalidArgument);
    }

    // Update existing workflow run or create new one if not found
    const executionIdFromHeader = context.requestHeader.get("x-n8n-execution-id") || executionId;

    // Try to find existing workflow run by execution ID
    let workflowRunId: string;
    const existingRun = executionIdFromHeader
      ? ((await db.get(
          "SELECT id FROM workflow_runs WHERE strategy_id = ? AND execution_id = ? AND status IN ('pending', 'running')",
          [strategyId, executionIdFromHeader]
        )) as { id: string } | undefined)
      : null;

    if (existingRun) {
      // Update existing workflow run
      workflowRunId = existingRun.id;
      await db.run(
        `UPDATE workflow_runs 
         SET input_data = COALESCE(?, input_data),
             ai_analysis = ?,
             json_output = ?,
             markdown_output = ?,
             status = 'completed',
             error_message = NULL,
             updated_at = datetime('now')
         WHERE id = ?`,
        [inputData || null, aiAnalysis || null, jsonOutput, markdownOutput, workflowRunId]
      );
      console.log(`✅ Updated existing workflow run:`, {
        workflowRunId,
        strategyId,
        executionId: executionIdFromHeader,
      });
    } else {
      // Create new workflow run record (fallback if not created at start)
      workflowRunId = randomUUID();
      await db.run(
        `INSERT INTO workflow_runs (id, strategy_id, execution_id, input_data, ai_analysis, json_output, markdown_output, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', datetime('now'), datetime('now'))`,
        [
          workflowRunId,
          strategyId,
          executionIdFromHeader || null,
          inputData || null,
          aiAnalysis || null,
          jsonOutput,
          markdownOutput,
        ]
      );
      console.log(`✅ Created workflow run at completion:`, {
        workflowRunId,
        strategyId,
        executionId: executionIdFromHeader,
      });
    }

    console.log(`✅ Workflow run completed:`, {
      workflowRunId,
      strategyId,
      executionId: executionIdFromHeader,
      recommendationsCount: recommendations.length,
    });

    // Create top 3 predictions
    const top3 = recommendations.slice(0, 3);
    const createdPredictions = [];

    for (const rec of top3) {
      const symbol = (rec.symbol as string)?.toUpperCase();
      const entryPrice = Number(rec.entry_price) || 0;
      const targetPrice = Number(rec.target_price) || 0;
      const stopLossPrice = Number(rec.stop_loss_price) || 0;
      const allocatedAmount = Number(row.per_stock_allocation || 0);

      if (!symbol || !entryPrice || !targetPrice || !stopLossPrice) {
        console.warn(`⚠️ Skipping invalid recommendation:`, rec);
        continue;
      }

      // Calculate derived fields
      const targetReturnPct = entryPrice > 0 ? ((targetPrice - entryPrice) / entryPrice) * 100 : 0;
      const stopLossPct = entryPrice > 0 ? ((entryPrice - stopLossPrice) / entryPrice) * 100 : 0;
      const stopLossDollarImpact =
        entryPrice > 0 ? (entryPrice - stopLossPrice) * (allocatedAmount / entryPrice) : 0;

      // Calculate evaluation date based on time horizon
      const timeHorizonMap: Record<string, number> = {
        TIME_HORIZON_SHORT: 7,
        TIME_HORIZON_MEDIUM: 30,
        TIME_HORIZON_LONG: 90,
      };
      const timeHorizonDays = timeHorizonMap[row.time_horizon] || 30;

      const evaluationDate = new Date();
      evaluationDate.setDate(evaluationDate.getDate() + timeHorizonDays);

      // Helper function to convert risk level
      function riskLevelToDbString(riskLevel: string): string {
        if (riskLevel?.includes("LOW")) return "RISK_LEVEL_LOW";
        if (riskLevel?.includes("MEDIUM")) return "RISK_LEVEL_MEDIUM";
        if (riskLevel?.includes("HIGH")) return "RISK_LEVEL_HIGH";
        return "RISK_LEVEL_UNSPECIFIED";
      }

      // Create prediction
      const predictionId = randomUUID();
      await db.run(
        `INSERT INTO predictions (
          id, strategy_id, user_id, symbol, entry_price, target_price, stop_loss_price,
          allocated_amount, target_return_pct, stop_loss_pct, stop_loss_dollar_impact,
          sentiment_score, overall_score, technical_analysis, analysis, risk_level,
          time_horizon_days, evaluation_date, source, status, action, privacy, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          predictionId,
          strategyId,
          row.user_id,
          symbol,
          entryPrice,
          targetPrice,
          stopLossPrice,
          allocatedAmount,
          targetReturnPct,
          stopLossPct,
          stopLossDollarImpact,
          Number(rec.sentiment_score) || 0,
          Number(rec.overall_score) || 0,
          JSON.stringify(rec.technical_analysis || {}),
          rec.analysis || rec.reasoning || "",
          riskLevelToDbString(row.risk_level),
          timeHorizonDays,
          evaluationDate.toISOString(),
          "PREDICTION_SOURCE_AI",
          "PREDICTION_STATUS_ACTIVE",
          "pending",
          "PREDICTION_PRIVACY_PRIVATE",
        ]
      );

      createdPredictions.push(
        create(CreatedPredictionDataSchema, {
          id: predictionId,
          symbol,
          entryPrice,
          targetPrice,
          stopLossPrice,
        })
      );

      console.log(`✅ Created prediction:`, {
        predictionId,
        symbol,
        entryPrice,
        targetPrice,
      });
    }

    // Note: current_month_spent is now calculated from active predictions
    // (where action = 'entered') instead of being stored in the database.
    // This ensures accuracy and avoids synchronization issues.

    return create(CreatePredictionsFromWorkflowResponseSchema, {
      success: true,
      workflowRunId,
      predictionsCreated: createdPredictions.length,
      predictions: createdPredictions,
    });
  } catch (error) {
    console.error("❌ Error in createPredictionsFromWorkflow:", error);

    // Try to update workflow run status to failed
    try {
      const executionIdFromHeader =
        context.requestHeader.get("x-n8n-execution-id") || req.executionId || null;
      const strategyIdForError = req.strategyId;
      if (executionIdFromHeader && strategyIdForError) {
        const existingRun = (await db.get(
          "SELECT id FROM workflow_runs WHERE strategy_id = ? AND execution_id = ? AND status IN ('pending', 'running')",
          [strategyIdForError, executionIdFromHeader]
        )) as { id: string } | undefined;

        if (existingRun) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await db.run(
            "UPDATE workflow_runs SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?",
            [errorMessage, existingRun.id]
          );
          console.log(`❌ Updated workflow run to failed:`, {
            workflowRunId: existingRun.id,
            errorMessage,
          });
        }
      }
    } catch (updateError) {
      console.error("⚠️ Failed to update workflow run status on error:", updateError);
    }

    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(
      error instanceof Error ? error.message : "Internal server error",
      Code.Internal
    );
  }
}
