import { appConfig } from "../../config.js";
import type { Frequency } from "../../gen/stockpicker/v1/strategy_pb.js";
import type { N8nWorkflow } from "../n8nTypes.js";
import { frequencyToCron, frequencyToName, getCurrentApiUrl } from "./n8nHelpers.js";

/**
 * Create a workflow template for a strategy that focuses on AI-powered stock analysis
 * Flow: Get Prepared Data -> AI Agent(s) Analysis -> Top 10 Stocks -> Standardized .md/.json -> Workflow Run
 */
export function createStrategyWorkflowTemplate(
  strategyId: string,
  strategyName: string,
  frequency: Frequency
): N8nWorkflow {
  const cronExpression = frequencyToCron(frequency);
  const frequencyName = frequencyToName(frequency);
  const apiUrl = getCurrentApiUrl();

  // Note: 'active' field is read-only in the API and cannot be set during creation
  // Workflow will be created as inactive by default, then activated separately when strategy starts
  const workflow: N8nWorkflow = {
    name: `Strategy: ${strategyName} (${frequencyName})`,
    nodes: [
      // Schedule Trigger (for cron-based execution) - managed by n8n
      {
        parameters: {
          triggerTimes: {
            item: [
              {
                mode: "cron",
                cronExpression: cronExpression,
              },
            ],
          },
        },
        id: "schedule-trigger",
        name: "Schedule Trigger",
        type: "n8n-nodes-base.scheduleTrigger",
        typeVersion: 1.2,
        position: [250, 300],
      },
      // Get Prepared Data from Apiserver - fetches sources, strategy, predictions, budget info
      {
        parameters: {
          url: `${apiUrl}/stockpicker.v1.StrategyService/PrepareDataForWorkflow`,
          method: "POST",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Content-Type",
                value: "application/json",
              },
              {
                name: "Connect-Protocol-Version",
                value: "1",
              },
            ],
          },
          sendBody: true,
          bodyContentType: "json",
          jsonBody: `={"id": "${strategyId}"}`,
          options: {},
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
        },
        id: "get-prepared-data",
        name: "Get Prepared Data",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [450, 300],
      },
      // Extract Input Data - parses apiserver response
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Extract input data from ConnectRPC response
const inputData = $json;
const response = inputData.json || inputData.body || {};

const strategy = response.strategy || {};
const activePredictions = response.activePredictions || response.active_predictions || [];
const hasBudget = response.hasBudget !== false;
let sources = {};
try {
  sources = typeof response.sources === 'string' ? JSON.parse(response.sources) : (response.sources || {});
} catch (e) {
  console.error('Failed to parse sources:', e);
  sources = {};
}

return [{
  json: {
    strategy: strategy,
    activePredictions: activePredictions,
    hasBudget: hasBudget,
    sources: sources,
    strategyId: "${strategyId}"
  }
}];`,
        },
        id: "extract-input-data",
        name: "Extract Input Data",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [650, 300],
      },
      // AI Agent - Primary Analysis (produces top 10 stocks with analysis)
      {
        parameters: {
          url: "https://api.openai.com/v1/chat/completions",
          method: "POST",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Content-Type",
                value: "application/json",
              },
              {
                name: "Authorization",
                value: "=Bearer {{ $env.OPENAI_API_KEY }}",
              },
            ],
          },
          sendBody: true,
          bodyContentType: "json",
          jsonBody: `={{ JSON.stringify({
            "model": "gpt-4o-mini",
            "messages": [
              {
                "role": "system",
                "content": "You are a professional financial AI analyst. Analyze stock data from multiple sources and provide your top 10 stock recommendations with detailed analysis, source tracing, and risk assessment. Always ensure your analysis is thorough and well-reasoned."
              },
              {
                "role": "user",
                "content": "Analyze the following multi-source stock data and provide your top 10 stock recommendations:\\n\\n" +
                  "Strategy Parameters:\\n" +
                  "- Strategy: " + $json.strategy.name + "\\n" +
                  "- Time Horizon: " + $json.strategy.timeHorizon + "\\n" +
                  "- Target Return: " + $json.strategy.targetReturnPct + "%\\n" +
                  "- Risk Level: " + $json.strategy.riskLevel + "\\n" +
                  "- Per Stock Budget: $" + $json.strategy.perStockAllocation + "\\n" +
                  "- Custom Instructions: " + ($json.strategy.customPrompt || "None") + "\\n\\n" +
                  "Multi-Source Data:\\n" +
                  JSON.stringify($json.sources, null, 2) + "\\n\\n" +
                  "Active Predictions: " +
                  JSON.stringify($json.activePredictions, null, 2) + "\\n\\n" +
                  "Provide EXACTLY 10 stock recommendations in this JSON format:\\n" +
                  "{\\n" +
                  '  "top_stocks": [\\n' +
                  "    {\\n" +
                  '      "symbol": "AAPL",\\n' +
                  '      "entry_price": 150.00,\\n' +
                  '      "target_price": 165.00,\\n' +
                  '      "stop_loss_price": 142.50,\\n' +
                  '      "reasoning": "Detailed explanation...",\\n' +
                  '      "source_tracing": [\\n' +
                  "        {\\n" +
                  '          "source": "alpha_vantage",\\n' +
                  '          "contribution": "Top gainer with 5% increase",\\n' +
                  '          "data": {...}\\n' +
                  "        }\\n" +
                  "      ],\\n" +
                  '      "technical_analysis": {\\n' +
                  '        "trend": "bullish",\\n' +
                  '        "support_level": 148.00,\\n' +
                  '        "resistance_level": 168.00\\n' +
                  "      },\\n" +
                  '      "sentiment_score": 7.5,\\n' +
                  '      "overall_score": 8.2,\\n' +
                  '      "analysis": "Comprehensive analysis text...",\\n' +
                  '      "risk_assessment": "Medium risk..."\\n' +
                  "    }\\n" +
                  "  ],\\n" +
                  '  "metadata": {\\n' +
                  '    "sources_used": ["alpha_vantage", "reddit", ...],\\n' +
                  '    "analysis_date": "' + new Date().toISOString() + '",\\n' +
                  '    "stocks_considered": 50\\n' +
                  "  }\\n" +
                  "}\\n\\n" +
                  "IMPORTANT: Return ONLY valid JSON, no markdown formatting. Ensure all prices are numbers, not strings."
              }
            ],
            "temperature": 0.7,
            "response_format": {"type": "json_object"}
          }) }}`,
          options: {},
        },
        id: "ai-agent-analysis",
        name: "AI Agent - Stock Analysis",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [850, 300],
      },
      // Parse AI Analysis - extract top 10 stocks
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Parse AI agent response and extract top 10 stocks
const response = $input.item.json;
const content = response.choices?.[0]?.message?.content || response.message?.content || '';

let aiAnalysis = null;
try {
  aiAnalysis = JSON.parse(content);
} catch (e) {
  console.error('Error parsing AI analysis:', e);
  aiAnalysis = { top_stocks: [], metadata: {} };
}

const top10Stocks = (aiAnalysis.top_stocks || []).slice(0, 10);

return [{
  json: {
    top10Stocks: top10Stocks,
    aiAnalysis: aiAnalysis,
    metadata: aiAnalysis.metadata || {},
    strategy: $node['Extract Input Data'].json.strategy,
    sources: $node['Extract Input Data'].json.sources,
    strategyId: "${strategyId}"
  }
}];`,
        },
        id: "parse-ai-analysis",
        name: "Parse AI Analysis",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1050, 300],
      },
      // Generate JSON Output - standardized format
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Generate standardized JSON output
const inputData = $json;
const top10 = inputData.top10Stocks || [];
const metadata = inputData.metadata || {};
const strategy = inputData.strategy || {};
const sources = inputData.sources || {};

// Standardized JSON output format
const jsonOutput = {
  format_version: "1.0",
  strategy_id: "${strategyId}",
  strategy_name: strategy.name || "",
  generated_at: new Date().toISOString(),
  recommendations: top10.map(stock => ({
    symbol: stock.symbol || "",
    entry_price: Number(stock.entry_price) || 0,
    target_price: Number(stock.target_price) || 0,
    stop_loss_price: Number(stock.stop_loss_price) || 0,
    reasoning: stock.reasoning || "",
    source_tracing: stock.source_tracing || [],
    technical_analysis: stock.technical_analysis || {},
    sentiment_score: Number(stock.sentiment_score) || 0,
    overall_score: Number(stock.overall_score) || 0,
    analysis: stock.analysis || "",
    risk_assessment: stock.risk_assessment || ""
  })),
  metadata: {
    ...metadata,
    sources_analyzed: Object.keys(sources),
    recommendations_count: top10.length,
    has_budget: true // From input data
  }
};

return [{
  json: {
    json_output: JSON.stringify(jsonOutput),
    top10Stocks: top10,
    strategyId: "${strategyId}"
  }
}];`,
        },
        id: "generate-json-output",
        name: "Generate JSON Output",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1250, 200],
      },
      // Generate Markdown Output - standardized format that matches JSON
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Generate standardized Markdown output that matches JSON recommendations
const inputData = $json;
const top10 = inputData.top10Stocks || [];
const strategy = inputData.strategy || {};
const sources = inputData.sources || {};

// Build markdown report that corresponds to JSON output
let markdown = '# Stock Analysis Report\\n\\n';
markdown += \`**Strategy:** \${strategy.name || 'N/A'}\\n\`;
markdown += \`**Time Horizon:** \${strategy.timeHorizon || 'N/A'}\\n\`;
markdown += \`**Target Return:** \${strategy.targetReturnPct || 0}%\\n\`;
markdown += \`**Risk Level:** \${strategy.riskLevel || 'N/A'}\\n\`;
markdown += \`**Generated:** \${new Date().toISOString()}\\n\\n\`;

markdown += '## Executive Summary\\n\\n';
markdown += \`This analysis identified \${top10.length} top stock recommendations based on multi-source data analysis.\\n\\n\`;

markdown += '## Top Stock Recommendations\\n\\n';

top10.forEach((stock, index) => {
  const symbol = stock.symbol || 'N/A';
  const entryPrice = Number(stock.entry_price) || 0;
  const targetPrice = Number(stock.target_price) || 0;
  const stopLossPrice = Number(stock.stop_loss_price) || 0;
  const overallScore = Number(stock.overall_score) || 0;

  markdown += \`### \${index + 1}. \${symbol}\\n\\n\`;
  markdown += \`**Entry Price:** $\${entryPrice.toFixed(2)}\\n\`;
  const targetReturnPct = ((targetPrice - entryPrice) / entryPrice) * 100;
  const stopLossPct = ((entryPrice - stopLossPrice) / entryPrice) * 100;
  markdown += \`**Target Price:** $\${targetPrice.toFixed(2)} (+\${targetReturnPct.toFixed(2)}%)\\n\`;
  markdown += \`**Stop Loss:** $\${stopLossPrice.toFixed(2)} (-\${stopLossPct.toFixed(2)}%)\\n\`;
  markdown += \`**Overall Score:** \${overallScore.toFixed(1)}/10\\n\\n\`;

  if (stock.reasoning) {
    markdown += \`**Reasoning:** \${stock.reasoning}\\n\\n\`;
  }

  if (stock.analysis) {
    markdown += \`**Analysis:** \${stock.analysis}\\n\\n\`;
  }

  // Source tracing
  if (stock.source_tracing && stock.source_tracing.length > 0) {
    markdown += '**Sources:**\\n';
    stock.source_tracing.forEach(source => {
      markdown += \`- \${source.source}: \${source.contribution || 'See data'}\\n\`;
    });
    markdown += '\\n';
  }

  // Technical analysis
  if (stock.technical_analysis) {
    markdown += '**Technical Analysis:**\\n';
    if (stock.technical_analysis.trend) {
      markdown += \`- Trend: \${stock.technical_analysis.trend}\\n\`;
    }
    if (stock.technical_analysis.support_level) {
      markdown += \`- Support Level: $\${stock.technical_analysis.support_level}\\n\`;
    }
    if (stock.technical_analysis.resistance_level) {
      markdown += \`- Resistance Level: $\${stock.technical_analysis.resistance_level}\\n\`;
    }
    markdown += '\\n';
  }

  if (stock.risk_assessment) {
    markdown += \`**Risk Assessment:** \${stock.risk_assessment}\\n\\n\`;
  }

  markdown += '---\\n\\n';
});

markdown += '## Source Attribution\\n\\n';
markdown += \`This analysis used data from: \${Object.keys(sources).join(', ') || 'No sources available'}\\n\\n\`;

markdown += '## Methodology\\n\\n';
markdown += 'Stocks were analyzed using multi-source data aggregation, AI-powered analysis, and risk assessment based on strategy parameters.\\n';

return [{
  json: {
    markdown_output: markdown,
    strategyId: "${strategyId}"
  }
}];`,
        },
        id: "generate-markdown-output",
        name: "Generate Markdown Output",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1250, 400],
      },
      // Combine Outputs - ensure JSON and Markdown are consistent
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Combine JSON and Markdown outputs, ensuring consistency
const jsonItem = $node['Generate JSON Output'].json || {};
const markdownItem = $node['Generate Markdown Output'].json || {};

const jsonOutput = jsonItem.json_output || '{}';
const markdownOutput = markdownItem.markdown_output || '# Stock Analysis Report\\n\\nNo data available.';

// Parse JSON to validate it matches markdown
let jsonObj = {};
try {
  jsonObj = JSON.parse(jsonOutput);
} catch (e) {
  console.error('Error parsing JSON output for validation:', e);
}

// Validate consistency: ensure markdown mentions all symbols from JSON
const jsonSymbols = (jsonObj.recommendations || []).map(r => r.symbol).filter(Boolean);
const markdownSymbols = markdownOutput.match(/### \\d+\\. ([A-Z]+)/g) || [];
const markdownSymbolsExtracted = markdownSymbols.map(m => m.replace(/### \\d+\\. /, ''));

// Check if all JSON symbols appear in markdown
const missingInMarkdown = jsonSymbols.filter(s => !markdownSymbolsExtracted.includes(s));
if (missingInMarkdown.length > 0) {
  console.warn('⚠️ Warning: Some JSON recommendations missing in markdown:', missingInMarkdown);
}

return [{
  json: {
    strategy_id: "${strategyId}",
    json_output: jsonOutput,
    markdown_output: markdownOutput,
    timestamp: new Date().toISOString(),
    format_version: "1.0",
    validated: missingInMarkdown.length === 0
  }
}];`,
        },
        id: "combine-outputs",
        name: "Combine & Validate Outputs",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1450, 300],
      },
      // Create Workflow Run - sends both outputs to create workflow run record
      {
        parameters: {
          url: `${apiUrl}/stockpicker.v1.StrategyService/CreatePredictionsFromWorkflow`,
          method: "POST",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Content-Type",
                value: "application/json",
              },
              {
                name: "Connect-Protocol-Version",
                value: "1",
              },
            ],
          },
          sendBody: true,
          bodyContentType: "json",
          jsonBody:
            "={{ JSON.stringify({ strategyId: $json.strategy_id, jsonOutput: $json.json_output, markdownOutput: $json.markdown_output, executionId: $execution.id }) }}",
          options: {},
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
        },
        id: "create-workflow-run",
        name: "Create Workflow Run",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1650, 300],
      },
    ],
    connections: {
      "Schedule Trigger": {
        main: [[{ node: "Get Prepared Data", type: "main", index: 0 }]],
      },
      "Get Prepared Data": {
        main: [[{ node: "Extract Input Data", type: "main", index: 0 }]],
      },
      "Extract Input Data": {
        main: [[{ node: "AI Agent - Stock Analysis", type: "main", index: 0 }]],
      },
      "AI Agent - Stock Analysis": {
        main: [[{ node: "Parse AI Analysis", type: "main", index: 0 }]],
      },
      "Parse AI Analysis": {
        main: [
          [
            { node: "Generate JSON Output", type: "main", index: 0 },
            { node: "Generate Markdown Output", type: "main", index: 0 },
          ],
        ],
      },
      "Generate JSON Output": {
        main: [[{ node: "Combine & Validate Outputs", type: "main", index: 0 }]],
      },
      "Generate Markdown Output": {
        main: [[{ node: "Combine & Validate Outputs", type: "main", index: 0 }]],
      },
      "Combine & Validate Outputs": {
        main: [[{ node: "Create Workflow Run", type: "main", index: 0 }]],
      },
    },
    settings: {
      executionOrder: "v1",
    },
  };

  return workflow;
}
