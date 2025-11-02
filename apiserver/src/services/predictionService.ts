import { randomUUID } from "node:crypto";
import { Timestamp } from "@bufbuild/protobuf";
import { type PredictionRow, db } from "../db.js";
import { PredictionService } from "../gen/stockpicker/v1/strategy_connect.js";
import {
  type CreatePredictionRequest,
  CreatePredictionResponse,
  type GetPredictionRequest,
  GetPredictionResponse,
  type GetPredictionsBySymbolRequest,
  GetPredictionsBySymbolResponse,
  type ListPredictionsRequest,
  ListPredictionsResponse,
  Prediction,
  PredictionAction,
  PredictionStatus,
  RiskLevel,
  type UpdatePredictionActionRequest,
  UpdatePredictionActionResponse,
} from "../gen/stockpicker/v1/strategy_pb.js";

// Helper to convert DB row to proto Prediction message
function dbRowToProtoPrediction(row: PredictionRow): Prediction {
  const prediction = new Prediction({
    id: row.id,
    strategyId: row.strategy_id,
    symbol: row.symbol,
    entryPrice: row.entry_price,
    allocatedAmount: row.allocated_amount,
    timeHorizonDays: row.time_horizon_days ?? 0,
    targetReturnPct: row.target_return_pct,
    targetPrice: row.target_price,
    stopLossPct: row.stop_loss_pct,
    stopLossPrice: row.stop_loss_price,
    stopLossDollarImpact: row.stop_loss_dollar_impact,
    riskLevel: RiskLevel[row.risk_level as keyof typeof RiskLevel] ?? RiskLevel.UNSPECIFIED,
    technicalAnalysis: row.technical_analysis || "",
    sentimentScore: row.sentiment_score,
    overallScore: row.overall_score,
    action: mapActionToEnum(row.action),
    status:
      PredictionStatus[row.status as keyof typeof PredictionStatus] ?? PredictionStatus.UNSPECIFIED,
    createdAt: Timestamp.fromDate(new Date(row.created_at)),
  });

  // Optional fields
  if (row.evaluation_date) {
    prediction.evaluationDate = Timestamp.fromDate(new Date(row.evaluation_date));
  }
  if (row.current_price !== null) {
    prediction.currentPrice = row.current_price;
  }
  if (row.current_return_pct !== null) {
    prediction.currentReturnPct = row.current_return_pct;
  }
  if (row.closed_at) {
    prediction.closedAt = Timestamp.fromDate(new Date(row.closed_at));
  }
  if (row.closed_reason) {
    prediction.closedReason = row.closed_reason;
  }

  return prediction;
}

// Helper to map database action string to enum
function mapActionToEnum(action: string): PredictionAction {
  switch (action) {
    case "pending":
      return PredictionAction.PENDING;
    case "entered":
      return PredictionAction.ENTERED;
    case "dismissed":
      return PredictionAction.DISMISSED;
    default:
      return PredictionAction.UNSPECIFIED;
  }
}

// Helper to map enum to database action string
function mapEnumToAction(action: PredictionAction): string {
  switch (action) {
    case PredictionAction.PENDING:
      return "pending";
    case PredictionAction.ENTERED:
      return "entered";
    case PredictionAction.DISMISSED:
      return "dismissed";
    default:
      return "pending";
  }
}

// Helper to calculate stop loss dollar impact
function calculateStopLossImpact(
  entryPrice: number,
  stopLossPrice: number,
  allocatedAmount: number
): number {
  const priceDiff = entryPrice - stopLossPrice;
  const shares = allocatedAmount / entryPrice;
  return priceDiff * shares;
}

// Helper to calculate target return percentage if not provided
function calculateTargetReturnPct(entryPrice: number, targetPrice: number): number {
  return ((targetPrice - entryPrice) / entryPrice) * 100;
}

// Helper to calculate stop loss percentage if not provided
function calculateStopLossPct(entryPrice: number, stopLossPrice: number): number {
  return ((entryPrice - stopLossPrice) / entryPrice) * 100;
}

// Helper to map proto RiskLevel to database string
function riskLevelToDbString(riskLevel: RiskLevel): string {
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

// Prediction service implementation
export const predictionServiceImpl = {
  async createPrediction(req: CreatePredictionRequest): Promise<CreatePredictionResponse> {
    try {
      console.log("📝 Creating prediction:", {
        strategyId: req.strategyId,
        symbol: req.symbol,
        entryPrice: req.entryPrice,
        allocatedAmount: req.allocatedAmount,
      });

      const id = randomUUID();
      const now = new Date().toISOString();

      // Calculate derived fields if not provided
      const targetReturnPct =
        req.targetReturnPct ?? calculateTargetReturnPct(req.entryPrice, req.targetPrice);
      const stopLossPct =
        req.stopLossPct ?? calculateStopLossPct(req.entryPrice, req.stopLossPrice);
      const stopLossDollarImpact = calculateStopLossImpact(
        req.entryPrice,
        req.stopLossPrice,
        req.allocatedAmount
      );
      const riskLevelStr = req.riskLevel
        ? riskLevelToDbString(req.riskLevel)
        : "RISK_LEVEL_UNSPECIFIED";

      // Calculate evaluation date if time horizon is provided
      let evaluationDate: string | null = null;
      if (req.timeHorizonDays) {
        const evalDate = new Date();
        evalDate.setDate(evalDate.getDate() + req.timeHorizonDays);
        evaluationDate = evalDate.toISOString().split("T")[0];
      }

      const predictionData = {
        id,
        strategy_id: req.strategyId,
        symbol: req.symbol,
        entry_price: req.entryPrice,
        allocated_amount: req.allocatedAmount,
        time_horizon_days: req.timeHorizonDays ?? null,
        evaluation_date: evaluationDate,
        target_return_pct: targetReturnPct,
        target_price: req.targetPrice,
        stop_loss_pct: stopLossPct,
        stop_loss_price: req.stopLossPrice,
        stop_loss_dollar_impact: stopLossDollarImpact,
        risk_level: riskLevelStr,
        technical_analysis: req.technicalAnalysis || "",
        sentiment_score: req.sentimentScore,
        overall_score: req.overallScore,
        action: "pending", // Default to pending
        status: "PREDICTION_STATUS_ACTIVE",
        current_price: null,
        current_return_pct: null,
        closed_at: null,
        closed_reason: null,
        created_at: now,
      };

      console.log("💾 Inserting prediction data:", predictionData);

      // Use direct query instead of prepared statement
      await db.run(
        `
        INSERT INTO predictions (
          id, strategy_id, symbol, entry_price, allocated_amount, time_horizon_days,
          evaluation_date, target_return_pct, target_price, stop_loss_pct,
          stop_loss_price, stop_loss_dollar_impact, risk_level, technical_analysis,
          sentiment_score, overall_score, action, status, current_price, current_return_pct,
          closed_at, closed_reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [
          predictionData.id,
          predictionData.strategy_id,
          predictionData.symbol,
          predictionData.entry_price,
          predictionData.allocated_amount,
          predictionData.time_horizon_days,
          predictionData.evaluation_date,
          predictionData.target_return_pct,
          predictionData.target_price,
          predictionData.stop_loss_pct,
          predictionData.stop_loss_price,
          predictionData.stop_loss_dollar_impact,
          predictionData.risk_level,
          predictionData.technical_analysis,
          predictionData.sentiment_score,
          predictionData.overall_score,
          predictionData.action,
          predictionData.status,
          predictionData.current_price,
          predictionData.current_return_pct,
          predictionData.closed_at,
          predictionData.closed_reason,
          predictionData.created_at,
        ]
      );

      const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [id])) as PredictionRow;
      const prediction = dbRowToProtoPrediction(row);

      console.log("✅ Prediction created successfully:", id);

      return new CreatePredictionResponse({ prediction });
    } catch (error) {
      console.error("❌ Error creating prediction:", error);
      if (error instanceof Error) {
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
      }
      throw error;
    }
  },

  async listPredictions(req: ListPredictionsRequest): Promise<ListPredictionsResponse> {
    let rows: PredictionRow[];
    if (req.status) {
      const statusStr = PredictionStatus[req.status] || "PREDICTION_STATUS_ACTIVE";
      rows = (await db.all(
        "SELECT * FROM predictions WHERE strategy_id = ? AND status = ? ORDER BY created_at DESC",
        [req.strategyId, statusStr]
      )) as PredictionRow[];
    } else {
      rows = (await db.all(
        "SELECT * FROM predictions WHERE strategy_id = ? ORDER BY created_at DESC",
        [req.strategyId]
      )) as PredictionRow[];
    }

    const predictions = rows.map((row) => dbRowToProtoPrediction(row));
    return new ListPredictionsResponse({ predictions });
  },

  async getPrediction(req: GetPredictionRequest): Promise<GetPredictionResponse> {
    const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
      | PredictionRow
      | undefined;
    if (!row) {
      throw new Error(`Prediction not found: ${req.id}`);
    }
    const prediction = dbRowToProtoPrediction(row);
    return new GetPredictionResponse({ prediction });
  },

  async getPredictionsBySymbol(
    req: GetPredictionsBySymbolRequest
  ): Promise<GetPredictionsBySymbolResponse> {
    let rows: PredictionRow[];
    if (req.strategyId) {
      // Filter by both symbol and strategy
      rows = (await db.all(
        "SELECT * FROM predictions WHERE symbol = ? AND strategy_id = ? ORDER BY created_at DESC",
        [req.symbol, req.strategyId]
      )) as PredictionRow[];
    } else {
      rows = (await db.all("SELECT * FROM predictions WHERE symbol = ? ORDER BY created_at DESC", [
        req.symbol,
      ])) as PredictionRow[];
    }

    const predictions = rows.map((row) => dbRowToProtoPrediction(row));
    return new GetPredictionsBySymbolResponse({ predictions });
  },

  async updatePredictionAction(
    req: UpdatePredictionActionRequest
  ): Promise<UpdatePredictionActionResponse> {
    const actionStr = mapEnumToAction(req.action);
    await db.run("UPDATE predictions SET action = ? WHERE id = ?", [actionStr, req.id]);

    const row = (await db.get("SELECT * FROM predictions WHERE id = ?", [req.id])) as
      | PredictionRow
      | undefined;
    if (!row) {
      throw new Error(`Prediction not found: ${req.id}`);
    }

    const prediction = dbRowToProtoPrediction(row);
    return new UpdatePredictionActionResponse({ prediction });
  },
};
