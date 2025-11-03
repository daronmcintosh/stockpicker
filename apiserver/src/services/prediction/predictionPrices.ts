import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import {
  type GetCurrentPricesRequest,
  type GetCurrentPricesResponse,
  GetCurrentPricesResponseSchema,
} from "../../gen/stockpicker/v1/strategy_pb.js";

export async function getCurrentPrices(
  req: GetCurrentPricesRequest,
  _context: HandlerContext
): Promise<GetCurrentPricesResponse> {
  const prices: Record<string, number> = {};
  const symbols = req.symbols || [];

  // Fetch prices for each symbol
  for (const symbol of symbols) {
    try {
      // Try Alpha Vantage first if API key is available
      const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
      if (apiKey) {
        const url = new URL("https://www.alphavantage.co/query");
        url.searchParams.set("function", "GLOBAL_QUOTE");
        url.searchParams.set("symbol", symbol);
        url.searchParams.set("apikey", apiKey);

        const response = await fetch(url.toString());
        if (response.ok) {
          interface AlphaVantageQuote {
            "Global Quote"?: {
              "05. price"?: string;
            };
          }
          const data = (await response.json()) as AlphaVantageQuote;
          const quote = data?.["Global Quote"];
          if (quote?.["05. price"]) {
            const price = Number.parseFloat(quote["05. price"]);
            if (!Number.isNaN(price)) {
              prices[symbol] = price;
              continue; // Successfully fetched, move to next symbol
            }
          }
        }
      }

      // Fallback: Try Yahoo Finance (no API key required)
      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`;
      const yahooResponse = await fetch(yahooUrl);
      if (yahooResponse.ok) {
        interface YahooFinanceChart {
          chart?: {
            result?: {
              meta?: {
                regularMarketPrice?: number;
              };
            }[];
          };
        }
        const data = (await yahooResponse.json()) as YahooFinanceChart;
        const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (price && typeof price === "number") {
          prices[symbol] = price;
          continue;
        }
      }
    } catch (error) {
      console.error(`Failed to fetch price for ${symbol}:`, error);
      // Continue to next symbol
    }

    // Add small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return create(GetCurrentPricesResponseSchema, { prices });
}
