import type { PrepareDataForWorkflowResponse } from "../../gen/stockpicker/v1/strategy_pb.js";

/**
 * Execution context for workflow runs
 */
export interface WorkflowExecutionContext {
  executionId: string;
  strategyId: string;
  timestamp: string;
}

/**
 * AI agent response structure
 */
export interface AIAgentResponse {
  top_stocks: StockRecommendation[];
  metadata?: {
    sources_used?: string[];
    analysis_date?: string;
    stocks_considered?: number;
  };
}

/**
 * Stock recommendation from AI analysis
 */
export interface StockRecommendation {
  symbol: string;
  entry_price: number;
  target_price: number;
  stop_loss_price: number;
  reasoning?: string;
  source_tracing?: Array<{
    source: string;
    contribution: string;
    data?: unknown;
  }>;
  technical_analysis?: {
    trend?: string;
    trend_strength?: string;
    support_level?: number;
    resistance_level?: number;
    current_price?: number;
    price_change_pct?: number;
    volume_analysis?: string;
    volume_data?: {
      recent_volume?: number;
      average_volume?: number;
      volume_trend?: string;
    };
    price_levels?: Array<{
      level: number;
      type: string;
      strength: string;
    }>;
    indicators?: {
      rsi?: number;
      rsi_signal?: string;
      moving_average?: {
        sma_20?: number;
        sma_50?: number;
        position_vs_ma?: string;
      };
      momentum?: string;
    };
    chart_pattern?: string;
    chart_points?: Array<{
      price: number;
      label: string;
      type: string;
    }>;
    timeframe_analysis?: {
      short_term?: string;
      medium_term?: string;
      long_term?: string;
    };
    data_sources_used?: string[];
    analysis_notes?: string;
  };
  sentiment_score?: number;
  overall_score?: number;
  confidence_level?: number;
  confidence_pct?: number;
  risk_level?: string;
  risk_score?: number;
  success_probability?: number;
  hit_probability_pct?: number;
  analysis?: string;
  risk_assessment?: string;
}

/**
 * Merged AI results from multiple agents
 */
export interface MergedAIResults {
  top10Stocks: StockRecommendation[];
  metadata: {
    sources_used?: string[];
    analysis_date: string;
    stocks_considered?: number;
    agents_used?: string[];
  };
}

/**
 * Workflow output formats
 */
export interface WorkflowOutputs {
  jsonOutput: string;
  markdownOutput: string;
  aiAnalysis: string;
  inputData: string;
}

