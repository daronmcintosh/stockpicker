import type { StrategyRow } from "../../db.js";

/**
 * Generate base prompt for an AI model based on strategy configuration
 * This prompt serves as the foundation that gets runtime data injected during workflow execution
 *
 * NOTE: When these prompts are used during workflow execution, they are sent to AI models
 * with the following SYSTEM PROMPT:
 *
 * "You are a professional financial AI analyst specializing in technical analysis.
 * Analyze stock data from multiple sources and provide your top 10 stock recommendations
 * with detailed technical analysis, source tracing, and risk assessment. Your technical
 * analysis should be based on available data sources (price data, volume, sentiment, etc.)
 * and include actionable chart points."
 *
 * This function generates the USER PROMPT, which includes strategy-specific parameters
 * and requirements. The system prompt is defined in aiAnalysis.ts.
 */
export function generateBasePromptForModel(_model: string, strategy: StrategyRow): string {
  const riskLevelDisplay = strategy.risk_level.replace("RISK_LEVEL_", "").toLowerCase();

  // Base prompt template with static strategy inputs
  const basePrompt = `Analyze the following multi-source stock data and provide your top 10 stock recommendations with comprehensive technical analysis:\n\nStrategy Parameters:\n- Strategy: ${strategy.name}\n- Time Horizon: ${strategy.time_horizon}\n- Target Return: ${strategy.target_return_pct}%\n- Risk Level: ${riskLevelDisplay}\n${strategy.custom_prompt ? `- Custom Instructions: ${strategy.custom_prompt}\n` : "- Custom Instructions: None\n"}\nNote: Budget information, multi-source data, and active predictions will be provided at runtime.\n\nProvide EXACTLY 10 stock recommendations in this JSON format:\n${buildJSONFormatExample()}\n\nIMPORTANT TECHNICAL ANALYSIS REQUIREMENTS:\n1. Base technical analysis on actual data from sources (price, volume, change percentages)\n2. Calculate support/resistance levels from price data where available\n3. Include chart_points array with specific price levels for chart generation\n4. Extract volume analysis from source data (if available)\n5. Calculate or estimate RSI, moving averages, momentum based on price movements\n6. Identify chart patterns (uptrend, downtrend, consolidation, breakout, etc.)\n7. Trace technical indicators back to source data in source_tracing\n8. Ensure all price values are numbers, not strings\n9. Technical analysis should be actionable for chart generation\n\nCONFIDENCE & RISK ASSESSMENT REQUIREMENTS:\n1. confidence_level: decimal 0.0-1.0 representing confidence in recommendation (based on data quality, signal strength, source agreement)\n2. confidence_pct: percentage 0-100 (same as confidence_level * 100)\n3. risk_level: string - one of 'low', 'medium', 'high' based on volatility, stop loss distance, price stability\n4. risk_score: number 1-10 where 1=very low risk, 10=very high risk\n5. success_probability: decimal 0.0-1.0 representing probability of hitting target price based on technical analysis and signals\n6. hit_probability_pct: percentage 0-100 (same as success_probability * 100)\n7. Consider: data source agreement, signal strength, volume confirmation, price stability, stop loss distance\n\nReturn ONLY valid JSON, no markdown formatting. Ensure all prices are numbers, not strings.`;

  return basePrompt;
}

/**
 * Build JSON format example for AI models
 */
function buildJSONFormatExample(): string {
  return `{
  "top_stocks": [
    {
      "symbol": "AAPL",
      "entry_price": 150.00,
      "target_price": 165.00,
      "stop_loss_price": 142.50,
      "reasoning": "Detailed explanation...",
      "source_tracing": [
        {
          "source": "alpha_vantage",
          "contribution": "Top gainer with 5% increase",
          "data": {...}
        }
      ],
      "technical_analysis": {
        "trend": "bullish",
        "trend_strength": "strong",
        "support_level": 148.00,
        "resistance_level": 168.00,
        "current_price": 150.25,
        "price_change_pct": 2.5,
        "volume_analysis": "increasing",
        "volume_data": {
          "recent_volume": 1000000,
          "average_volume": 800000,
          "volume_trend": "above_average"
        },
        "price_levels": [
          {"level": 148.00, "type": "support", "strength": "strong"},
          {"level": 152.00, "type": "minor_resistance", "strength": "weak"},
          {"level": 168.00, "type": "resistance", "strength": "strong"}
        ],
        "indicators": {
          "rsi": 65.5,
          "rsi_signal": "neutral_to_bullish",
          "moving_average": {
            "sma_20": 148.50,
            "sma_50": 145.00,
            "position_vs_ma": "above_both"
          },
          "momentum": "positive"
        },
        "chart_pattern": "uptrend_continuation",
        "chart_points": [
          {"price": 148.00, "label": "Support", "type": "horizontal_line"},
          {"price": 152.00, "label": "Entry Zone", "type": "area"},
          {"price": 168.00, "label": "Target", "type": "horizontal_line"}
        ],
        "timeframe_analysis": {
          "short_term": "bullish",
          "medium_term": "bullish",
          "long_term": "neutral"
        },
        "data_sources_used": ["alpha_vantage", "reddit"],
        "analysis_notes": "Technical analysis based on price data from Alpha Vantage and sentiment from Reddit discussions"
      },
      "sentiment_score": 7.5,
      "overall_score": 8.2,
      "confidence_level": 0.75,
      "confidence_pct": 75,
      "risk_level": "medium",
      "risk_score": 5.5,
      "success_probability": 0.72,
      "hit_probability_pct": 72,
      "analysis": "Comprehensive analysis text...",
      "risk_assessment": "Medium risk with moderate confidence..."
    }
  ],
  "metadata": {
    "sources_used": ["alpha_vantage", "reddit", ...],
    "analysis_date": "${new Date().toISOString()}",
    "stocks_considered": 50
  }
}`;
}

/**
 * Inject runtime data into base prompt
 * Called during workflow execution to add budget, sources, and active predictions
 */
export function injectRuntimeDataIntoPrompt(
  basePrompt: string,
  budget: {
    monthlyBudget: number;
    currentMonthSpent: number;
    remainingBudget: number;
    perStockAllocation: number;
    availableSlots: number;
    budgetUtilizationPct: number;
    hasBudget: boolean;
  },
  sources: Record<string, unknown>,
  activePredictions: Array<{ id: string; symbol: string; allocatedAmount: number }>
): string {
  const budgetSection = `Budget Information:\n- Monthly Budget: $${budget.monthlyBudget.toFixed(2)}\n- Current Month Spent: $${budget.currentMonthSpent.toFixed(2)}\n- Remaining Budget: $${budget.remainingBudget.toFixed(2)}\n- Per Stock Allocation: $${budget.perStockAllocation.toFixed(2)}\n- Available Investment Slots: ${budget.availableSlots} stocks\n- Budget Utilization: ${budget.budgetUtilizationPct.toFixed(1)}%\n- Has Budget: ${budget.hasBudget ? "Yes" : "No"}\n\nIMPORTANT: Only recommend stocks if remaining budget >= per stock allocation. Consider available_slots when selecting how many stocks to recommend. If available_slots is limited, prioritize highest confidence/reward opportunities.\n\n`;

  const sourcesSection = `Multi-Source Data:\n${JSON.stringify(sources, null, 2)}\n\n`;
  const activePredictionsSection = `Active Predictions: ${JSON.stringify(activePredictions, null, 2)}\n\n`;

  // Insert runtime data after strategy parameters and before JSON format
  const strategyParamsEnd = basePrompt.indexOf("\nNote: Budget information");
  if (strategyParamsEnd !== -1) {
    return `${basePrompt.slice(0, strategyParamsEnd)}\n${budgetSection}${sourcesSection}${activePredictionsSection}${basePrompt.slice(strategyParamsEnd + 1)}`;
  }

  // Fallback: append if insertion point not found
  return `${basePrompt}\n\n${budgetSection}${sourcesSection}${activePredictionsSection}`;
}
