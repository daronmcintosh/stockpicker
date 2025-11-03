import type { AIAgentResponse, StockRecommendation } from "./workflowTypes.js";

/**
 * Generate fake AI agent response for testing
 * Used when USE_FAKE_AI_AGENTS environment variable is set to "true"
 */
export function generateFakeAIAgentResponse(model: string, temperature: number): AIAgentResponse {
  // Generate different stock sets for each agent to test merging
  // Agent 1: Tech stocks
  // Agent 2: Mixed sectors
  // Agent 3: Growth stocks
  const agentStocks: Record<string, string[]> = {
    "gpt-4o-mini-temp-0.7": [
      "AAPL",
      "MSFT",
      "GOOGL",
      "AMZN",
      "NVDA",
      "META",
      "TSLA",
      "NFLX",
      "AMD",
      "INTC",
    ],
    "gpt-4o-temp-0.7": ["JPM", "BAC", "WMT", "JNJ", "PG", "V", "MA", "DIS", "HD", "NKE"],
    "gpt-4o-mini-temp-0.8": [
      "CRM",
      "NOW",
      "ZM",
      "DOCU",
      "SNOW",
      "PLTR",
      "RBLX",
      "UPST",
      "AFRM",
      "COIN",
    ],
  };

  const key = `${model}-temp-${temperature}`;
  const symbols = agentStocks[key] || agentStocks["gpt-4o-mini-temp-0.7"];

  const topStocks: StockRecommendation[] = symbols.map((symbol, index) => {
    const basePrice = 50 + Math.random() * 450; // Random price between 50-500
    const entryPrice = Math.round(basePrice * 100) / 100;
    const targetReturnPct = 8 + index * 1.5; // Varying target returns 8-23.5%
    const targetPrice = Math.round(entryPrice * (1 + targetReturnPct / 100) * 100) / 100;
    const stopLossPct = 5 + index * 0.5; // Varying stop loss 5-9.5%
    const stopLossPrice = Math.round(entryPrice * (1 - stopLossPct / 100) * 100) / 100;
    const overallScore = 7 + index * 0.25; // Scores from 7.0 to 9.25
    const confidence = 0.6 + index * 0.035; // Confidence from 0.6 to 0.95
    const riskLevels = ["low", "medium", "high"];
    const riskLevel = riskLevels[index % 3];

    return {
      symbol,
      entry_price: entryPrice,
      target_price: targetPrice,
      stop_loss_price: stopLossPrice,
      reasoning: `Strong technical setup with ${targetReturnPct.toFixed(1)}% upside potential. Showing bullish momentum with volume confirmation.`,
      source_tracing: [
        {
          source: "alpha_vantage",
          contribution: `Price momentum indicator showing ${(index + 3) * 5}% increase`,
          data: { price_change: (index + 3) * 5 },
        },
        {
          source: "reddit",
          contribution: "Positive sentiment trending in trading discussions",
          data: { sentiment_score: 7 + index * 0.2 },
        },
      ],
      technical_analysis: {
        trend: index % 2 === 0 ? "bullish" : "strong_bullish",
        trend_strength: index < 5 ? "strong" : "moderate",
        support_level: Math.round(entryPrice * 0.95 * 100) / 100,
        resistance_level: Math.round(entryPrice * 1.15 * 100) / 100,
        current_price: entryPrice,
        price_change_pct: (index + 2) * 2.5,
        volume_analysis: index < 5 ? "increasing" : "stable",
        volume_data: {
          recent_volume: 1000000 + index * 100000,
          average_volume: 800000 + index * 80000,
          volume_trend: index < 5 ? "above_average" : "average",
        },
        price_levels: [
          {
            level: Math.round(entryPrice * 0.95 * 100) / 100,
            type: "support",
            strength: "strong",
          },
          {
            level: Math.round(entryPrice * 1.05 * 100) / 100,
            type: "minor_resistance",
            strength: "weak",
          },
          {
            level: targetPrice,
            type: "resistance",
            strength: "moderate",
          },
        ],
        indicators: {
          rsi: 50 + index * 3,
          rsi_signal: index < 5 ? "neutral_to_bullish" : "bullish",
          moving_average: {
            sma_20: Math.round(entryPrice * 0.98 * 100) / 100,
            sma_50: Math.round(entryPrice * 0.95 * 100) / 100,
            position_vs_ma: "above_both",
          },
          momentum: index % 2 === 0 ? "positive" : "strong_positive",
        },
        chart_pattern: index < 3 ? "uptrend_continuation" : "breakout_pattern",
        chart_points: [
          {
            price: Math.round(entryPrice * 0.95 * 100) / 100,
            label: "Support",
            type: "horizontal_line",
          },
          {
            price: entryPrice,
            label: "Entry Zone",
            type: "area",
          },
          {
            price: targetPrice,
            label: "Target",
            type: "horizontal_line",
          },
        ],
        timeframe_analysis: {
          short_term: "bullish",
          medium_term: index < 5 ? "bullish" : "neutral",
          long_term: "neutral",
        },
        data_sources_used: ["alpha_vantage", "reddit"],
        analysis_notes: `Technical analysis based on price data from Alpha Vantage and sentiment from Reddit discussions. ${symbol} shows strong momentum with favorable risk/reward ratio.`,
      },
      sentiment_score: 6.5 + index * 0.15,
      overall_score: overallScore,
      confidence_level: confidence,
      confidence_pct: Math.round(confidence * 100),
      risk_level: riskLevel,
      risk_score:
        riskLevel === "low"
          ? 3 + index * 0.2
          : riskLevel === "medium"
            ? 5 + index * 0.2
            : 7 + index * 0.2,
      success_probability: confidence * 0.9, // Slightly lower than confidence
      hit_probability_pct: Math.round(confidence * 0.9 * 100),
      analysis: `${symbol} presents an attractive opportunity with ${targetReturnPct.toFixed(1)}% potential upside. The stock is trading above key moving averages with increasing volume, indicating strong institutional interest. Technical indicators suggest continuation of the current trend with a favorable risk/reward setup.`,
      risk_assessment:
        riskLevel === "low"
          ? "Low risk trade with strong technical foundation and clear support levels. Suitable for conservative investors."
          : riskLevel === "medium"
            ? "Medium risk opportunity with balanced risk/reward profile. Monitor key support levels closely."
            : "Higher risk trade with potential for significant gains. Requires active monitoring and strict stop-loss discipline.",
    };
  });

  return {
    top_stocks: topStocks,
    metadata: {
      sources_used: ["alpha_vantage", "reddit", "technical_indicators"],
      analysis_date: new Date().toISOString(),
      stocks_considered: 50,
    },
  };
}
