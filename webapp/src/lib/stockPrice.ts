/**
 * Stock price fetching utility
 * Fetches current stock prices from the backend API
 */

import { predictionClient } from "./connect";

/**
 * Fetch current prices for multiple symbols using the backend API
 * The backend handles API rate limiting and caching
 */
export async function fetchStockPrices(symbols: string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) {
    return {};
  }

  try {
    const uniqueSymbols = [...new Set(symbols)].filter(Boolean);
    if (uniqueSymbols.length === 0) {
      return {};
    }

    const response = await predictionClient.getCurrentPrices({
      symbols: uniqueSymbols,
    });

    return response.prices || {};
  } catch (error) {
    console.error("Failed to fetch stock prices:", error);
    return {};
  }
}
