import type { PrepareDataForWorkflowResponse } from "../../gen/stockpicker/v1/strategy_pb.js";
import type {
  AIAgentResponse,
  MergedAIResults,
  StockRecommendation,
} from "./workflowTypes.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}

/**
 * Execute AI analysis using multiple agents in parallel
 * Replaces the n8n workflow's parallel AI agent nodes
 */
export async function executeAIAnalysis(
  preparedData: PrepareDataForWorkflowResponse,
  strategyId: string
): Promise<MergedAIResults> {
  console.log(`🤖 Starting AI analysis with multiple agents:`, { strategyId });

  // Run 3 agents in parallel (same as n8n workflow)
  const [agent1, agent2, agent3] = await Promise.allSettled([
    callOpenAIAgent("gpt-4o-mini", preparedData, strategyId, 0.7),
    callOpenAIAgent("gpt-4o", preparedData, strategyId, 0.7),
    callOpenAIAgent("gpt-4o-mini", preparedData, strategyId, 0.8),
  ]);

  // Extract successful results
  const successfulResults: AIAgentResponse[] = [];
  const agentsUsed: string[] = [];

  if (agent1.status === "fulfilled") {
    successfulResults.push(agent1.value);
    agentsUsed.push("gpt-4o-mini");
  } else {
    console.error(`❌ AI Agent 1 failed:`, agent1.reason);
  }

  if (agent2.status === "fulfilled") {
    successfulResults.push(agent2.value);
    agentsUsed.push("gpt-4o");
  } else {
    console.error(`❌ AI Agent 2 failed:`, agent2.reason);
  }

  if (agent3.status === "fulfilled") {
    successfulResults.push(agent3.value);
    agentsUsed.push("gpt-4o-mini");
  } else {
    console.error(`❌ AI Agent 3 failed:`, agent3.reason);
  }

  if (successfulResults.length === 0) {
    throw new Error("All AI agents failed. Cannot proceed with analysis.");
  }

  console.log(`✅ ${successfulResults.length}/3 AI agents succeeded`);

  // Merge results (take the best analysis, or average scores)
  const merged = mergeAIAgentResults(successfulResults, agentsUsed);

  return merged;
}

/**
 * Call a single OpenAI agent
 */
async function callOpenAIAgent(
  model: string,
  data: PrepareDataForWorkflowResponse,
  strategyId: string,
  temperature: number
): Promise<AIAgentResponse> {
  const strategy = data.strategy;
  const budget = data.budget;
  const sources = JSON.parse(data.sources || "{}");
  const activePredictions = data.activePredictions || [];

  const systemPrompt =
    "You are a professional financial AI analyst specializing in technical analysis. Analyze stock data from multiple sources and provide your top 10 stock recommendations with detailed technical analysis, source tracing, and risk assessment. Your technical analysis should be based on available data sources (price data, volume, sentiment, etc.) and include actionable chart points.";

  const userPrompt = buildUserPrompt(strategy, budget, sources, activePredictions);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI API returned empty response");
  }

  const parsed = JSON.parse(content) as AIAgentResponse;
  if (!parsed.top_stocks || !Array.isArray(parsed.top_stocks)) {
    throw new Error("Invalid AI response format: missing top_stocks array");
  }

  return parsed;
}

/**
 * Build the user prompt for OpenAI (replicates n8n workflow prompt)
 */
function buildUserPrompt(
  strategy: PrepareDataForWorkflowResponse["strategy"],
  budget: PrepareDataForWorkflowResponse["budget"],
  sources: Record<string, unknown>,
  activePredictions: PrepareDataForWorkflowResponse["activePredictions"]
): string {
  return (
    `Analyze the following multi-source stock data and provide your top 10 stock recommendations with comprehensive technical analysis:\n\n` +
    `Strategy Parameters:\n` +
    `- Strategy: ${strategy.name}\n` +
    `- Time Horizon: ${strategy.timeHorizon}\n` +
    `- Target Return: ${strategy.targetReturnPct}%\n` +
    `- Risk Level: ${strategy.riskLevel}\n` +
    `- Custom Instructions: ${strategy.customPrompt || "None"}\n\n` +
    `Budget Information:\n` +
    `- Monthly Budget: $${(budget.monthlyBudget || 0).toFixed(2)}\n` +
    `- Current Month Spent: $${(budget.currentMonthSpent || 0).toFixed(2)}\n` +
    `- Remaining Budget: $${(budget.remainingBudget || 0).toFixed(2)}\n` +
    `- Per Stock Allocation: $${(budget.perStockAllocation || 0).toFixed(2)}\n` +
    `- Available Investment Slots: ${budget.availableSlots || 0} stocks\n` +
    `- Budget Utilization: ${(budget.budgetUtilizationPct || 0).toFixed(1)}%\n` +
    `- Has Budget: ${budget.hasBudget ? "Yes" : "No"}\n` +
    `\nIMPORTANT: Only recommend stocks if remaining budget >= per stock allocation. ` +
    `Consider available_slots when selecting how many stocks to recommend. ` +
    `If available_slots is limited, prioritize highest confidence/reward opportunities.\n\n` +
    `Multi-Source Data:\n${JSON.stringify(sources, null, 2)}\n\n` +
    `Active Predictions: ${JSON.stringify(activePredictions, null, 2)}\n\n` +
    `Provide EXACTLY 10 stock recommendations in this JSON format:\n` +
    buildJSONFormatExample() +
    `\n\nIMPORTANT TECHNICAL ANALYSIS REQUIREMENTS:\n` +
    `1. Base technical analysis on actual data from sources (price, volume, change percentages)\n` +
    `2. Calculate support/resistance levels from price data where available\n` +
    `3. Include chart_points array with specific price levels for chart generation\n` +
    `4. Extract volume analysis from source data (if available)\n` +
    `5. Calculate or estimate RSI, moving averages, momentum based on price movements\n` +
    `6. Identify chart patterns (uptrend, downtrend, consolidation, breakout, etc.)\n` +
    `7. Trace technical indicators back to source data in source_tracing\n` +
    `8. Ensure all price values are numbers, not strings\n` +
    `9. Technical analysis should be actionable for chart generation\n\n` +
    `CONFIDENCE & RISK ASSESSMENT REQUIREMENTS:\n` +
    `1. confidence_level: decimal 0.0-1.0 representing confidence in recommendation (based on data quality, signal strength, source agreement)\n` +
    `2. confidence_pct: percentage 0-100 (same as confidence_level * 100)\n` +
    `3. risk_level: string - one of 'low', 'medium', 'high' based on volatility, stop loss distance, price stability\n` +
    `4. risk_score: number 1-10 where 1=very low risk, 10=very high risk\n` +
    `5. success_probability: decimal 0.0-1.0 representing probability of hitting target price based on technical analysis and signals\n` +
    `6. hit_probability_pct: percentage 0-100 (same as success_probability * 100)\n` +
    `7. Consider: data source agreement, signal strength, volume confirmation, price stability, stop loss distance\n\n` +
    `Return ONLY valid JSON, no markdown formatting. Ensure all prices are numbers, not strings.`
  );
}

/**
 * Build JSON format example (same as n8n workflow)
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
 * Merge results from multiple AI agents
 * Takes the best recommendations based on overall_score
 */
function mergeAIAgentResults(
  results: AIAgentResponse[],
  agentsUsed: string[]
): MergedAIResults {
  // Collect all stocks from all agents
  const allStocks: StockRecommendation[] = [];
  const sourcesUsed = new Set<string>();
  const stocksConsidered = new Set<string>();

  for (const result of results) {
    if (result.top_stocks) {
      allStocks.push(...result.top_stocks);
      for (const stock of result.top_stocks) {
        stocksConsidered.add(stock.symbol);
      }
    }
    if (result.metadata?.sources_used) {
      for (const source of result.metadata.sources_used) {
        sourcesUsed.add(source);
      }
    }
  }

  // Group by symbol and take the best recommendation per symbol
  const stockMap = new Map<string, StockRecommendation>();
  for (const stock of allStocks) {
    const existing = stockMap.get(stock.symbol);
    if (!existing || (stock.overall_score || 0) > (existing.overall_score || 0)) {
      stockMap.set(stock.symbol, stock);
    }
  }

  // Sort by overall_score and take top 10
  const top10 = Array.from(stockMap.values())
    .sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0))
    .slice(0, 10);

  return {
    top10Stocks: top10,
    metadata: {
      sources_used: Array.from(sourcesUsed),
      analysis_date: new Date().toISOString(),
      stocks_considered: stocksConsidered.size,
      agents_used: agentsUsed,
    },
  };
}

