import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type PredictionRow, type StrategyRow, db } from "../db.js";
import { dbRowToProtoStrategy } from "../services/strategy/strategyHelpers.js";

interface InternalRequest extends IncomingMessage {
  body?: string;
}

/**
 * Parse request body as JSON
 */
async function parseBody(req: InternalRequest): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (_error) {
        reject(new Error("Invalid JSON in request body"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/**
 * GET /internal/strategies/:id/prepare-data
 * Prepares all input data for n8n workflow including multi-source stock data
 */
export async function handlePrepareData(req: InternalRequest, res: ServerResponse): Promise<void> {
  try {
    // Extract strategy ID from URL
    const urlMatch = req.url?.match(/\/internal\/strategies\/([^/]+)\/prepare-data/);
    if (!urlMatch || !urlMatch[1]) {
      sendJson(res, 400, { error: "Invalid strategy ID" });
      return;
    }
    const strategyId = urlMatch[1];

    // Get strategy from database
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [strategyId])) as
      | StrategyRow
      | undefined;

    if (!row) {
      sendJson(res, 404, { error: `Strategy not found: ${strategyId}` });
      return;
    }

    // Validate strategy is active
    if (row.status !== "STRATEGY_STATUS_ACTIVE") {
      sendJson(res, 400, {
        error: `Strategy is not active. Current status: ${row.status}`,
      });
      return;
    }

    // Convert strategy to proto format
    const strategy = await dbRowToProtoStrategy(row);

    // Get active predictions for budget calculation
    const activePredictionsRows = (await db.all(
      `SELECT * FROM predictions
       WHERE strategy_id = ?
       AND status = 'PREDICTION_STATUS_ACTIVE'
       AND action = 'entered'`,
      [strategyId]
    )) as PredictionRow[];

    const { dbRowToProtoPrediction } = await import("../services/prediction/predictionHelpers.js");
    const activePredictions = await Promise.all(
      activePredictionsRows.map((pRow) => dbRowToProtoPrediction(pRow))
    );

    // Calculate budget
    const currentMonthSpent = Number(row.current_month_spent || 0);
    const monthlyBudget = Number(row.monthly_budget || 0);
    const hasBudget = currentMonthSpent < monthlyBudget;

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

    // Return prepared data
    sendJson(res, 200, {
      strategy: {
        id: strategy.id,
        name: strategy.name,
        timeHorizon: strategy.timeHorizon,
        targetReturnPct: Number(strategy.targetReturnPct),
        riskLevel: strategy.riskLevel,
        perStockAllocation: Number(strategy.perStockAllocation),
        customPrompt: strategy.customPrompt || "",
      },
      activePredictions: activePredictions.map((p) => ({
        id: p.id,
        symbol: p.symbol,
        allocatedAmount: Number(p.allocatedAmount),
      })),
      hasBudget: hasBudget,
      sources: sources,
    });
  } catch (error) {
    console.error("❌ Error in prepare-data endpoint:", error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * POST /internal/strategies/:id/create-predictions
 * Creates predictions from workflow output and saves workflow run
 */
export async function handleCreatePredictions(
  req: InternalRequest,
  res: ServerResponse
): Promise<void> {
  try {
    // Extract strategy ID from URL
    const urlMatch = req.url?.match(/\/internal\/strategies\/([^/]+)\/create-predictions/);
    if (!urlMatch || !urlMatch[1]) {
      sendJson(res, 400, { error: "Invalid strategy ID" });
      return;
    }
    const strategyId = urlMatch[1];

    // Parse request body
    const body = await parseBody(req);
    const { json_output, markdown_output, strategyId: bodyStrategyId } = body;

    // Validate strategy ID matches
    if (bodyStrategyId !== strategyId) {
      sendJson(res, 400, { error: "Strategy ID mismatch" });
      return;
    }

    // Validate outputs
    if (!json_output || typeof json_output !== "object") {
      sendJson(res, 400, { error: "Missing or invalid json_output" });
      return;
    }
    if (!markdown_output || typeof markdown_output !== "string") {
      sendJson(res, 400, { error: "Missing or invalid markdown_output" });
      return;
    }

    // Get strategy to validate it exists
    const row = (await db.get("SELECT * FROM strategies WHERE id = ?", [strategyId])) as
      | StrategyRow
      | undefined;

    if (!row) {
      sendJson(res, 404, { error: `Strategy not found: ${strategyId}` });
      return;
    }

    // Extract recommendations from JSON output
    const jsonOutputObj = json_output as { recommendations?: Array<Record<string, unknown>> };
    const recommendations = jsonOutputObj.recommendations || [];

    if (recommendations.length === 0) {
      sendJson(res, 400, { error: "No recommendations found in json_output" });
      return;
    }

    // Create workflow run record
    const workflowRunId = randomUUID();
    const executionId = req.headers["x-n8n-execution-id"] as string | undefined;

    await db.run(
      `INSERT INTO workflow_runs (id, strategy_id, execution_id, json_output, markdown_output, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [workflowRunId, strategyId, executionId || null, JSON.stringify(json_output), markdown_output]
    );

    console.log(`✅ Created workflow run:`, {
      workflowRunId,
      strategyId,
      executionId,
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

      createdPredictions.push({
        id: predictionId,
        symbol,
        entryPrice,
        targetPrice,
        stopLossPrice,
      });

      console.log(`✅ Created prediction:`, {
        predictionId,
        symbol,
        entryPrice,
        targetPrice,
      });
    }

    // Update strategy's current_month_spent
    const totalSpent = top3.reduce((sum, _rec) => {
      return sum + Number(row.per_stock_allocation || 0);
    }, 0);
    const newSpent = Number(row.current_month_spent || 0) + totalSpent;

    await db.run(
      "UPDATE strategies SET current_month_spent = ?, updated_at = datetime('now') WHERE id = ?",
      [newSpent, strategyId]
    );

    sendJson(res, 200, {
      success: true,
      workflowRunId,
      predictionsCreated: createdPredictions.length,
      predictions: createdPredictions,
    });
  } catch (error) {
    console.error("❌ Error in create-predictions endpoint:", error);
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
}

/**
 * Route handler for internal endpoints
 */
export async function handleInternalRoute(
  req: InternalRequest,
  res: ServerResponse
): Promise<boolean> {
  // Only handle /internal/* routes
  if (!req.url?.startsWith("/internal/")) {
    return false;
  }

  // Handle specific routes
  if (req.url.match(/\/internal\/strategies\/[^/]+\/prepare-data/) && req.method === "GET") {
    await handlePrepareData(req, res);
    return true;
  }

  if (req.url.match(/\/internal\/strategies\/[^/]+\/create-predictions/) && req.method === "POST") {
    await handleCreatePredictions(req, res);
    return true;
  }

  // Unknown internal route
  sendJson(res, 404, { error: "Internal endpoint not found" });
  return true;
}
