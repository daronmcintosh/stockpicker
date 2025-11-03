import { appConfig } from "../../config.js";
import type { Frequency } from "../../gen/stockpicker/v1/strategy_pb.js";
import type { N8nWorkflow } from "../n8nTypes.js";
import { frequencyToCron, frequencyToName, getCurrentApiUrl } from "./n8nHelpers.js";

/**
 * Create a workflow template for a strategy that focuses on stock analysis with multi-source data
 * The apiserver provides raw source data, workflow refines stocks with source tracing,
 * AI produces both JSON and Markdown outputs, and apiserver creates predictions + workflow run record
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
          url: `${apiUrl}/internal/strategies/${strategyId}/prepare-data`,
          method: "GET",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Content-Type",
                value: "application/json",
              },
            ],
          },
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
      // Extract Input Data - parses apiserver response with sources
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Extract input data from apiserver response
// Expected structure:
// {
//   strategy: { ... },
//   activePredictions: [...],
//   hasBudget: boolean,
//   sources: {
//     alpha_vantage: { ... },
//     polymarket: { ... },
//     reddit: { ... },
//     news: { ... },
//     earnings: { ... },
//     politics: { ... }
//   }
// }

const inputData = $json;
const response = inputData.json || inputData.body || {};

const strategy = response.strategy || {};
const activePredictions = response.activePredictions || [];
const hasBudget = response.hasBudget !== false;
const sources = response.sources || {};

// Return structured data for workflow
return [{
  json: {
    strategy: strategy,
    activePredictions: activePredictions,
    hasBudget: hasBudget,
    sources: sources,
    // Store original response for reference
    _raw_response: response
  }
}];`,
        },
        id: "extract-input-data",
        name: "Extract Input Data",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [650, 300],
      },
      // Refine Top Stocks - analyzes sources and creates stocks with source tracing
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Refine top stocks from sources with source tracing
const inputData = $json;
const sources = inputData.sources || {};
const strategy = inputData.strategy || {};

// Collect stocks from all sources with tracing
const stockMap = new Map();

// Alpha Vantage - top gainers/losers
if (sources.alpha_vantage) {
  const av = sources.alpha_vantage;
  if (av.top_gainers && Array.isArray(av.top_gainers)) {
    av.top_gainers.forEach(stock => {
      const symbol = stock.ticker || stock.symbol;
      if (!symbol) return;
      
      if (!stockMap.has(symbol)) {
        stockMap.set(symbol, {
          symbol: symbol,
          ticker: symbol,
          currentPrice: parseFloat(stock.price) || 0,
          change_percentage: stock.change_percentage || '0%',
          change_amount: parseFloat(stock.change_amount) || 0,
          volume: parseInt(stock.volume) || 0,
          source_contributions: []
        });
      }
      
      stockMap.get(symbol).source_contributions.push({
        source: 'alpha_vantage',
        reason: 'top_gainer',
        data: stock,
        signal_strength: parseFloat(stock.change_percentage?.replace('%', '')) || 0
      });
    });
  }
}

// Reddit - sentiment data
if (sources.reddit) {
  const reddit = sources.reddit;
  if (reddit.stocks && Array.isArray(reddit.stocks)) {
    reddit.stocks.forEach(stock => {
      const symbol = stock.symbol || stock.ticker;
      if (!symbol) return;
      
      if (!stockMap.has(symbol)) {
        stockMap.set(symbol, {
          symbol: symbol,
          ticker: symbol,
          currentPrice: stock.currentPrice || 0,
          source_contributions: []
        });
      }
      
      const stockData = stockMap.get(symbol);
      stockData.source_contributions.push({
        source: 'reddit',
        reason: 'sentiment',
        mentions: stock.mentions || 0,
        sentiment_score: stock.sentiment_score || 0,
        data: stock
      });
    });
  }
}

// Earnings - upcoming earnings
if (sources.earnings) {
  const earnings = sources.earnings;
  if (earnings.upcoming && Array.isArray(earnings.upcoming)) {
    earnings.upcoming.forEach(item => {
      const symbol = item.symbol || item.ticker;
      if (!symbol) return;
      
      if (!stockMap.has(symbol)) {
        stockMap.set(symbol, {
          symbol: symbol,
          ticker: symbol,
          currentPrice: item.currentPrice || 0,
          source_contributions: []
        });
      }
      
      stockMap.get(symbol).source_contributions.push({
        source: 'earnings',
        reason: 'upcoming_earnings',
        earnings_date: item.earnings_date,
        expected_move: item.expected_move,
        data: item
      });
    });
  }
}

// Polymarket - prediction markets
if (sources.polymarket) {
  const polymarket = sources.polymarket;
  if (polymarket.stocks && Array.isArray(polymarket.stocks)) {
    polymarket.stocks.forEach(stock => {
      const symbol = stock.symbol || stock.ticker;
      if (!symbol) return;
      
      if (!stockMap.has(symbol)) {
        stockMap.set(symbol, {
          symbol: symbol,
          ticker: symbol,
          currentPrice: stock.price || 0,
          source_contributions: []
        });
      }
      
      stockMap.get(symbol).source_contributions.push({
        source: 'polymarket',
        reason: 'prediction_market',
        market_odds: stock.odds,
        data: stock
      });
    });
  }
}

// News - news mentions
if (sources.news) {
  const news = sources.news;
  if (news.articles && Array.isArray(news.articles)) {
    news.articles.forEach(article => {
      const symbols = article.mentioned_symbols || [];
      symbols.forEach(symbol => {
        if (!symbol) return;
        
        if (!stockMap.has(symbol)) {
          stockMap.set(symbol, {
            symbol: symbol,
            ticker: symbol,
            source_contributions: []
          });
        }
        
        stockMap.get(symbol).source_contributions.push({
          source: 'news',
          reason: 'news_mention',
          article_title: article.title,
          sentiment: article.sentiment,
          data: article
        });
      });
    });
  }
}

// Filter and rank stocks based on strategy parameters
const riskLevel = strategy.riskLevel || 'RISK_LEVEL_MEDIUM';
const timeHorizon = strategy.timeHorizon || 'TIME_HORIZON_MEDIUM';

let refinedStocks = Array.from(stockMap.values())
  .filter(stock => {
    // Apply risk filters
    if (riskLevel === 'RISK_LEVEL_LOW') {
      // Filter out high volatility stocks
      const volatility = Math.abs(parseFloat(stock.change_percentage?.replace('%', '') || '0'));
      return volatility < 5; // Less than 5% change for low risk
    }
    return true;
  })
  .map(stock => {
    // Calculate composite score based on source contributions
    let score = 0;
    stock.source_contributions.forEach(contrib => {
      if (contrib.source === 'alpha_vantage' && contrib.signal_strength) {
        score += contrib.signal_strength * 0.3; // Weight price movement
      }
      if (contrib.source === 'reddit' && contrib.sentiment_score) {
        score += contrib.sentiment_score * 0.2; // Weight sentiment
      }
      if (contrib.source === 'earnings') {
        score += 2; // Earnings are significant
      }
      if (contrib.source === 'polymarket' && contrib.market_odds) {
        score += contrib.market_odds * 0.1; // Weight market predictions
      }
      if (contrib.source === 'news') {
        score += 0.5; // News mentions add weight
      }
    });
    
    return {
      ...stock,
      composite_score: score,
      source_count: stock.source_contributions.length
    };
  })
  .sort((a, b) => b.composite_score - a.composite_score)
  .slice(0, 50); // Take top 50 for AI analysis

return [{
  json: {
    ...inputData,
    refined_stocks: refinedStocks,
    source_tracing_enabled: true
  }
}];`,
        },
        id: "refine-top-stocks",
        name: "Refine Top Stocks",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [850, 300],
      },
      // Generate Charts - create chart URLs for each stock using chart-img.com
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Generate chart URLs for stocks using chart-img.com
const inputData = $json;
const stocks = inputData.refined_stocks || [];

// Generate chart URLs for each stock
const stocksWithCharts = stocks.map(stock => {
  const symbol = stock.symbol || stock.ticker;
  if (!symbol) return stock;
  
  // Generate chart-img.com URL
  // Format: https://chart-img.com/[SYMBOL]?type=line&period=1d
  const chartUrl = \`https://chart-img.com/\${symbol}?type=line&period=1d&theme=light\`;
  
  return {
    ...stock,
    chart: {
      url: chartUrl,
      type: 'chart-img',
      symbol: symbol
    }
  };
});

return [{
  json: {
    ...inputData,
    refined_stocks: stocksWithCharts
  }
}];`,
        },
        id: "generate-charts",
        name: "Generate Charts",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1050, 300],
      },
      // AI Stock Analysis - JSON Output (structured for apiserver)
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
          jsonBody:
            '={{ {"model": "gpt-4o-mini", "messages": [{"role": "system", "content": "You are a financial analyst AI assistant. Analyze stocks with source tracing and provide structured JSON output. Always respond with valid JSON only, no markdown formatting."}, {"role": "user", "content": "Analyze the following refined stocks and provide recommendations based on:\\n\\nStrategy Parameters:\\n- Time Horizon: " + $json.strategy.timeHorizon + "\\n- Target Return: " + $json.strategy.targetReturnPct + "%\\n- Risk Level: " + $json.strategy.riskLevel + "\\n- Per Stock Budget: $" + $json.strategy.perStockAllocation + "\\n- Custom Instructions: " + ($json.strategy.customPrompt || "None") + "\\n\\nRefined Stocks (with source tracing):\\n" + JSON.stringify($json.refined_stocks.slice(0, 50), null, 2) + "\\n\\nFor each recommended stock, provide:\\n1. symbol (string)\\n2. entry_price (number)\\n3. target_price (number)\\n4. stop_loss_price (number)\\n5. source_tracing (array) - link back to source_contributions, include source name, contribution reason, and relevant data\\n6. reasoning (string) - explain why this stock was selected based on sources\\n7. technical_analysis (JSON object)\\n8. sentiment_score (number 1-10)\\n9. overall_score (number 1-10)\\n10. analysis (string) - detailed analysis\\n\\nReturn JSON: {\\"recommendations\\": [...], \\"metadata\\": {\\"sources_used\\": [...], \\"stocks_considered\\": number, \\"refined_to\\": number}}"}], "temperature": 0.7, "response_format": {"type": "json_object"}} }}',
          options: {},
        },
        id: "ai-analysis-json",
        name: "AI Analysis (JSON)",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1250, 200],
      },
      // AI Stock Analysis - Markdown Output (human-readable for UI)
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
          jsonBody:
            '={{ {"model": "gpt-4o-mini", "messages": [{"role": "system", "content": "You are a financial analyst creating a professional markdown report. Include charts using markdown image syntax: ![Chart](URL). Use clear sections and formatting."}, {"role": "user", "content": "Create a comprehensive markdown report for stock recommendations based on:\\n\\nStrategy: " + $json.strategy.name + "\\nTime Horizon: " + $json.strategy.timeHorizon + "\\nTarget Return: " + $json.strategy.targetReturnPct + "%\\n\\nStocks with source tracing:\\n" + JSON.stringify($json.refined_stocks.slice(0, 50), null, 2) + "\\n\\nCreate a markdown report with:\\n1. Executive summary\\n2. Top recommended stocks (top 10)\\n3. For each stock: symbol, entry/target/stop-loss prices, score, reasoning, source attribution, chart image\\n4. Source attribution showing which sources contributed to each recommendation\\n5. Risk assessment\\n\\nUse markdown image syntax for charts: ![Chart Description](chart-url)"}], "temperature": 0.7}} }}',
          options: {},
        },
        id: "ai-analysis-markdown",
        name: "AI Analysis (Markdown)",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1250, 400],
      },
      // Parse JSON Output
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Parse JSON output from AI
const response = $input.item.json;
const content = response.choices?.[0]?.message?.content || response.message?.content || '';

let jsonOutput = null;
try {
  jsonOutput = JSON.parse(content);
} catch (e) {
  console.error('Error parsing JSON output:', e);
  jsonOutput = { recommendations: [], metadata: {} };
}

return [{
  json: {
    json_output: jsonOutput,
    type: 'json'
  }
}];`,
        },
        id: "parse-json-output",
        name: "Parse JSON Output",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1450, 200],
      },
      // Parse Markdown Output
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Extract markdown output from AI
const response = $input.item.json;
const markdownOutput = response.choices?.[0]?.message?.content || response.message?.content || '';

return [{
  json: {
    markdown_output: markdownOutput,
    type: 'markdown'
  }
}];`,
        },
        id: "parse-markdown-output",
        name: "Parse Markdown Output",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1450, 400],
      },
      // Combine Outputs - merge JSON and Markdown into final standardized output
      {
        parameters: {
          mode: "runOnceForAllItems",
          jsCode: `// Combine JSON and Markdown outputs into standardized format
const jsonItem = $node['Parse JSON Output'].json || {};
const markdownItem = $node['Parse Markdown Output'].json || {};

const jsonOutput = jsonItem.json_output || { recommendations: [], metadata: {} };
const markdownOutput = markdownItem.markdown_output || '# Stock Analysis Report\\n\\nNo analysis available.';

const strategyId = $node['Extract Input Data'].json.strategy.id || '';

return [{
  json: {
    json_output: jsonOutput,
    markdown_output: markdownOutput,
    strategyId: strategyId,
    timestamp: new Date().toISOString(),
    format_version: '1.0'
  }
}];`,
        },
        id: "combine-outputs",
        name: "Combine Outputs",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1650, 300],
      },
      // Create Predictions in Apiserver - sends both outputs to create predictions + workflow run
      {
        parameters: {
          url: `${apiUrl}/internal/strategies/${strategyId}/create-predictions`,
          method: "POST",
          sendHeaders: true,
          headerParameters: {
            parameters: [
              {
                name: "Content-Type",
                value: "application/json",
              },
            ],
          },
          sendBody: true,
          bodyContentType: "json",
          jsonBody: "={{ $json }}",
          options: {},
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
        },
        id: "create-predictions",
        name: "Create Predictions",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1850, 300],
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
        main: [[{ node: "Refine Top Stocks", type: "main", index: 0 }]],
      },
      "Refine Top Stocks": {
        main: [[{ node: "Generate Charts", type: "main", index: 0 }]],
      },
      "Generate Charts": {
        main: [
          [
            { node: "AI Analysis (JSON)", type: "main", index: 0 },
            { node: "AI Analysis (Markdown)", type: "main", index: 0 },
          ],
        ],
      },
      "AI Analysis (JSON)": {
        main: [[{ node: "Parse JSON Output", type: "main", index: 0 }]],
      },
      "AI Analysis (Markdown)": {
        main: [[{ node: "Parse Markdown Output", type: "main", index: 0 }]],
      },
      "Parse JSON Output": {
        main: [[{ node: "Combine Outputs", type: "main", index: 0 }]],
      },
      "Parse Markdown Output": {
        main: [[{ node: "Combine Outputs", type: "main", index: 0 }]],
      },
      "Combine Outputs": {
        main: [[{ node: "Create Predictions", type: "main", index: 0 }]],
      },
    },
    settings: {
      executionOrder: "v1",
    },
  };

  return workflow;
}
