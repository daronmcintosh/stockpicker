import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrepareDataForWorkflowResponse } from "../../gen/stockpicker/v1/strategy_pb.js";
import { generateFakeAIAgentResponse } from "./fakeAIAgents.js";
import type { AIAgentResponse, MergedAIResults, StockRecommendation } from "./workflowTypes.js";

// Get template directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templatesDir = join(__dirname, "../../templates");

// Cache templates in memory (they're loaded once at module initialization)
let promptTemplateCache: string | null = null;
let jsonExampleCache: string | null = null;

/**
 * Load and cache the user prompt template from markdown file
 */
function loadPromptTemplate(): string {
  if (promptTemplateCache === null) {
    const templatePath = join(templatesDir, "ai-user-prompt.md");
    promptTemplateCache = readFileSync(templatePath, "utf-8");
  }
  return promptTemplateCache;
}

/**
 * Load and cache the JSON format example from markdown file
 */
function loadJSONFormatExample(): string {
  if (jsonExampleCache === null) {
    const templatePath = join(templatesDir, "json-format-example.md");
    const content = readFileSync(templatePath, "utf-8");
    // Extract JSON from markdown code block (remove ```json and ``` markers)
    jsonExampleCache = content
      .replace(/^```json\s*\n/, "")
      .replace(/\n```\s*$/, "")
      .trim();
  }
  return jsonExampleCache;
}

const USE_FAKE_AI_AGENTS = process.env.USE_FAKE_AI_AGENTS === "true";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!USE_FAKE_AI_AGENTS && !OPENAI_API_KEY) {
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
  _strategyId: string,
  temperature: number
): Promise<AIAgentResponse> {
  // Use fake data if enabled
  if (USE_FAKE_AI_AGENTS) {
    console.log(`🎭 Using fake AI agent data (model: ${model}, temperature: ${temperature})`);
    return generateFakeAIAgentResponse(model, temperature);
  }

  const strategy = data.strategy;
  if (!strategy) {
    throw new Error("Strategy data is required");
  }
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

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
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
 * Build the user prompt for OpenAI by loading from markdown template
 * Replaces template variables with actual values
 */
function buildUserPrompt(
  strategy: PrepareDataForWorkflowResponse["strategy"],
  budget: PrepareDataForWorkflowResponse["budget"],
  sources: Record<string, unknown>,
  activePredictions: PrepareDataForWorkflowResponse["activePredictions"]
): string {
  if (!strategy) {
    throw new Error("Strategy is required to build user prompt");
  }
  if (!budget) {
    throw new Error("Budget is required to build user prompt");
  }

  // Load template from markdown file
  let prompt = loadPromptTemplate();

  // Replace all template variables
  prompt = prompt.replace(/\{\{STRATEGY_NAME\}\}/g, strategy.name || "");
  prompt = prompt.replace(/\{\{TIME_HORIZON\}\}/g, strategy.timeHorizon || "");
  prompt = prompt.replace(/\{\{TARGET_RETURN_PCT\}\}/g, String(strategy.targetReturnPct || 0));
  // Convert risk level enum to readable string
  const riskLevelStr = String(strategy.riskLevel || "")
    .replace(/^RISK_LEVEL_/, "")
    .toLowerCase();
  prompt = prompt.replace(/\{\{RISK_LEVEL\}\}/g, riskLevelStr);
  prompt = prompt.replace(/\{\{CUSTOM_PROMPT\}\}/g, strategy.customPrompt || "None");

  prompt = prompt.replace(
    /\{\{MONTHLY_BUDGET\}\}/g,
    (budget.monthlyBudget || 0).toFixed(2)
  );
  prompt = prompt.replace(
    /\{\{CURRENT_MONTH_SPENT\}\}/g,
    (budget.currentMonthSpent || 0).toFixed(2)
  );
  prompt = prompt.replace(
    /\{\{REMAINING_BUDGET\}\}/g,
    (budget.remainingBudget || 0).toFixed(2)
  );
  prompt = prompt.replace(
    /\{\{PER_STOCK_ALLOCATION\}\}/g,
    (budget.perStockAllocation || 0).toFixed(2)
  );
  prompt = prompt.replace(/\{\{AVAILABLE_SLOTS\}\}/g, String(budget.availableSlots || 0));
  prompt = prompt.replace(
    /\{\{BUDGET_UTILIZATION_PCT\}\}/g,
    (budget.budgetUtilizationPct || 0).toFixed(1)
  );
  prompt = prompt.replace(/\{\{HAS_BUDGET\}\}/g, budget.hasBudget ? "Yes" : "No");

  prompt = prompt.replace(/\{\{SOURCES_JSON\}\}/g, JSON.stringify(sources, null, 2));
  prompt = prompt.replace(
    /\{\{ACTIVE_PREDICTIONS_JSON\}\}/g,
    JSON.stringify(activePredictions, null, 2)
  );

  // Replace JSON format example
  const jsonExample = loadJSONFormatExample();
  prompt = prompt.replace(/\{\{JSON_FORMAT_EXAMPLE\}\}/g, jsonExample);

  return prompt;
}

/**
 * Build JSON format example (loaded from markdown template)
 * @deprecated This function is kept for backward compatibility but now uses loadJSONFormatExample internally
 */
function buildJSONFormatExample(): string {
  return loadJSONFormatExample();
}

/**
 * Merge results from multiple AI agents
 * Takes the best recommendations based on overall_score
 */
function mergeAIAgentResults(results: AIAgentResponse[], agentsUsed: string[]): MergedAIResults {
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
