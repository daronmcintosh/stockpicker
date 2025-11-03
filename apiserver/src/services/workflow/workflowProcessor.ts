import { randomUUID } from "node:crypto";
import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { db } from "../../db.js";
import type { CreatePredictionsFromWorkflowRequest } from "../../gen/stockpicker/v1/strategy_pb.js";
import { CreatePredictionsFromWorkflowRequestSchema } from "../../gen/stockpicker/v1/strategy_pb.js";
import type { PrepareDataForWorkflowResponse } from "../../gen/stockpicker/v1/strategy_pb.js";
import { createPredictionsFromWorkflow } from "../strategy/workflowHandlers.js";
import type { MergedAIResults, WorkflowOutputs } from "./workflowTypes.js";

/**
 * Process workflow results and create predictions
 * Used by the internal workflow runner
 */
export async function processWorkflowResults(
  context: HandlerContext,
  strategyId: string,
  executionId: string,
  aiResults: MergedAIResults,
  preparedData: PrepareDataForWorkflowResponse
): Promise<void> {
  console.log(`📊 Processing workflow results:`, {
    strategyId,
    executionId,
    recommendationsCount: aiResults.top10Stocks.length,
  });

  // Generate standardized JSON and Markdown outputs
  const outputs = generateWorkflowOutputs(strategyId, aiResults, preparedData);

  // Set execution ID in header
  context.requestHeader.set("x-execution-id", executionId);

  // Call the internal endpoint used by workflow runs
  const request = create(CreatePredictionsFromWorkflowRequestSchema, {
    strategyId,
    jsonOutput: outputs.jsonOutput,
    markdownOutput: outputs.markdownOutput,
    executionId,
    inputData: outputs.inputData,
    aiAnalysis: outputs.aiAnalysis,
  });

  await createPredictionsFromWorkflow(request, context);

  console.log(`✅ Workflow results processed and predictions created:`, {
    strategyId,
    executionId,
  });
}

/**
 * Generate standardized JSON and Markdown outputs
 */
function generateWorkflowOutputs(
  strategyId: string,
  aiResults: MergedAIResults,
  preparedData: PrepareDataForWorkflowResponse
): WorkflowOutputs {
  const strategy = preparedData.strategy;
  if (!strategy) {
    throw new Error("Strategy data is required in preparedData");
  }

  const budget = preparedData.budget;
  if (!budget) {
    throw new Error("Budget data is required in preparedData");
  }

  const sources = JSON.parse(preparedData.sources || "{}");

  // Generate JSON output
  const jsonOutput = {
    format_version: "1.0",
    strategy_id: strategyId,
    strategy_name: strategy.name || "",
    generated_at: new Date().toISOString(),
    recommendations: aiResults.top10Stocks.map((stock) => ({
      symbol: stock.symbol || "",
      entry_price: Number(stock.entry_price) || 0,
      target_price: Number(stock.target_price) || 0,
      stop_loss_price: Number(stock.stop_loss_price) || 0,
      reasoning: stock.reasoning || "",
      source_tracing: stock.source_tracing || [],
      technical_analysis: stock.technical_analysis || {},
      sentiment_score: Number(stock.sentiment_score) || 0,
      overall_score: Number(stock.overall_score) || 0,
      confidence_level: Number(stock.confidence_level) || 0,
      confidence_pct: Number(stock.confidence_pct) || 0,
      risk_level: stock.risk_level || "medium",
      risk_score: Number(stock.risk_score) || 5,
      success_probability: Number(stock.success_probability) || 0,
      hit_probability_pct: Number(stock.hit_probability_pct) || 0,
      analysis: stock.analysis || "",
      risk_assessment: stock.risk_assessment || "",
    })),
    metadata: {
      ...aiResults.metadata,
      sources_analyzed: Object.keys(sources),
      recommendations_count: aiResults.top10Stocks.length,
      budget: {
        monthlyBudget: budget.monthlyBudget,
        currentMonthSpent: budget.currentMonthSpent,
        remainingBudget: budget.remainingBudget,
        perStockAllocation: budget.perStockAllocation,
        availableSlots: budget.availableSlots,
        budgetUtilizationPct: budget.budgetUtilizationPct,
        hasBudget: budget.hasBudget,
      },
    },
  };

  // Generate Markdown output (simplified version - can be enhanced)
  const markdownOutput = generateMarkdownOutput(strategyId, strategy, aiResults, sources);

  // Prepare input data and AI analysis for storage
  const inputData = JSON.stringify({
    strategy: {
      id: strategy.id,
      name: strategy.name,
      timeHorizon: strategy.timeHorizon,
      targetReturnPct: strategy.targetReturnPct,
      riskLevel: strategy.riskLevel,
      customPrompt: strategy.customPrompt,
    },
    activePredictions: preparedData.activePredictions,
    budget: budget,
    sources,
    timestamp: new Date().toISOString(),
  });

  const aiAnalysis = JSON.stringify({
    top_stocks: aiResults.top10Stocks,
    metadata: aiResults.metadata,
  });

  return {
    jsonOutput: JSON.stringify(jsonOutput),
    markdownOutput,
    inputData,
    aiAnalysis,
  };
}

/**
 * Generate Markdown output for analysis results
 */
function generateMarkdownOutput(
  _strategyId: string,
  strategy: PrepareDataForWorkflowResponse["strategy"],
  aiResults: MergedAIResults,
  sources: Record<string, unknown>
): string {
  if (!strategy) {
    throw new Error("Strategy data is required for markdown generation");
  }
  const top10 = aiResults.top10Stocks;
  let markdown = "# Stock Analysis Report\n\n";
  // Chat-style run summary (based on top recommendation and budget where possible)
  const top = top10[0];
  if (top) {
    const symbol = top.symbol || "N/A";
    const entryPrice = Number(top.entry_price) || 0;
    const targetPrice = Number(top.target_price) || 0;
    const stopLossPrice = Number(top.stop_loss_price) || 0;
    const confidence = (
      Number(top.confidence_level) ||
      Number(top.confidence_pct) / 100 ||
      0
    ).toFixed(2);
    const expectedPct =
      entryPrice > 0 ? (((targetPrice - entryPrice) / entryPrice) * 100).toFixed(0) : "0";
    markdown += "**Run Summary**\n\n";
    markdown += `- Action: BUY ${symbol} $- , 1.0x, Confidence ${confidence}\n`;
    markdown += `- Rationale: ${top.reasoning ? top.reasoning.split(". ").slice(0, 2).join(". ") : "Top-ranked setup"}\n`;
    const estVol = (top.risk_level || "medium").toString();
    markdown += `- Risk: stop $${stopLossPrice.toFixed(2)}, target $${targetPrice.toFixed(2)}, Est. Vol: ${estVol}\n`;
    markdown += `- Expected: +${expectedPct}%, Horizon: ${strategy.timeHorizon || "-"}\n`;
    markdown += `- Portfolio: Account Value [$-], Positions [-], Cash [$-]\n`;
    markdown += `- Strategy: ${strategy.name || "N/A"}, Score [${Number(top.overall_score || 0).toFixed(0)}], Rank [1/${top10.length}]\n`;
    markdown += `- Alternatives considered: ${
      top10
        .slice(1, 3)
        .map((s) => s.symbol)
        .join(", ") || "-"
    }\n`;
    markdown += `- Log: Entered [no], Dismissed [no], Notes: -\n\n`;
  }
  markdown += `**Strategy:** ${strategy.name || "N/A"}\n`;
  markdown += `**Time Horizon:** ${strategy.timeHorizon || "N/A"}\n`;
  markdown += `**Target Return:** ${strategy.targetReturnPct || 0}%\n`;
  markdown += `**Risk Level:** ${strategy.riskLevel || "N/A"}\n`;
  markdown += `**Generated:** ${new Date().toISOString()}\n\n`;

  markdown += "## Executive Summary\n\n";
  markdown += `This analysis identified ${top10.length} top stock recommendations based on multi-source data analysis.\n\n`;

  // Quick metrics summary
  const avgConfidence =
    top10.length > 0
      ? top10.reduce(
          (sum, s) => sum + (Number(s.confidence_pct) || Number(s.confidence_level) * 100 || 0),
          0
        ) / top10.length
      : 0;
  const avgHitProb =
    top10.length > 0
      ? top10.reduce(
          (sum, s) =>
            sum + (Number(s.hit_probability_pct) || Number(s.success_probability) * 100 || 0),
          0
        ) / top10.length
      : 0;
  const avgRiskScore =
    top10.length > 0
      ? top10.reduce((sum, s) => sum + (Number(s.risk_score) || 5), 0) / top10.length
      : 5;

  markdown += "**Summary Metrics:**\n";
  markdown += `- Average Confidence: ${avgConfidence.toFixed(0)}%\n`;
  markdown += `- Average Success Probability: ${avgHitProb.toFixed(0)}%\n`;
  markdown += `- Average Risk Score: ${avgRiskScore.toFixed(1)}/10\n\n`;

  markdown += "## Top Stock Recommendations\n\n";

  top10.forEach((stock, index) => {
    const symbol = stock.symbol || "N/A";
    const entryPrice = Number(stock.entry_price) || 0;
    const targetPrice = Number(stock.target_price) || 0;
    const stopLossPrice = Number(stock.stop_loss_price) || 0;
    const overallScore = Number(stock.overall_score) || 0;
    const confidencePct = Number(stock.confidence_pct) || Number(stock.confidence_level) * 100 || 0;
    const hitProbPct =
      Number(stock.hit_probability_pct) || Number(stock.success_probability) * 100 || 0;
    const riskLevel = stock.risk_level || "medium";
    const riskScore = Number(stock.risk_score) || 5;

    markdown += `### ${index + 1}. ${symbol}\n\n`;
    markdown += "**Quick Metrics:**\n";
    markdown += `- 🎯 **Confidence:** ${confidencePct.toFixed(0)}%\n`;
    markdown += `- ✅ **Success Probability:** ${hitProbPct.toFixed(0)}%\n`;
    markdown += `- ⚠️ **Risk Level:** ${riskLevel.toUpperCase()} (Score: ${riskScore.toFixed(1)}/10)\n`;
    markdown += `- ⭐ **Overall Score:** ${overallScore.toFixed(1)}/10\n\n`;

    markdown += "**Price Points:**\n";
    markdown += `- Entry Price: $${entryPrice.toFixed(2)}\n`;
    const targetReturnPct = ((targetPrice - entryPrice) / entryPrice) * 100;
    const stopLossPct = ((entryPrice - stopLossPrice) / entryPrice) * 100;
    markdown += `- Target Price: $${targetPrice.toFixed(2)} (+${targetReturnPct.toFixed(2)}%)\n`;
    markdown += `- Stop Loss: $${stopLossPrice.toFixed(2)} (-${stopLossPct.toFixed(2)}%)\n\n`;

    if (stock.reasoning) {
      markdown += `**Reasoning:** ${stock.reasoning}\n\n`;
    }
    if (stock.analysis) {
      markdown += `**Analysis:** ${stock.analysis}\n\n`;
    }

    markdown += "---\n\n";
  });

  markdown += "## Source Attribution\n\n";
  markdown += `This analysis used data from: ${Object.keys(sources).join(", ") || "No sources available"}\n\n`;

  return markdown;
}
