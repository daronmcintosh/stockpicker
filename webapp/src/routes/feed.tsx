import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionStatus, RiskLevel, StrategyPrivacy, StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { predictionClient, strategyClient } from "@/lib/connect";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Target, TrendingDown, TrendingUp, TrendingUp as StrategyIcon, DollarSign, BarChart3 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/feed")({
  component: FeedPage,
});

type FeedItem = 
  | { type: "prediction"; data: Prediction }
  | { type: "strategy"; data: Strategy };

type FilterType = "all" | "predictions" | "strategies";

function FeedPage() {
  const [allFeedItems, setAllFeedItems] = useState<FeedItem[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState(true);
  const [totalPredictions, setTotalPredictions] = useState(0);
  const [totalStrategies, setTotalStrategies] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      // Load public predictions
      const predictionsResponse = await predictionClient.getPublicPredictions({
        limit: 100, // Load more to sort properly
        offset: 0,
      });
      
      // Load all strategies and filter for public ones
      const strategiesResponse = await strategyClient.listStrategies({});
      const publicStrategies = strategiesResponse.strategies.filter(
        (s) => s.privacy === StrategyPrivacy.PUBLIC
      );

      setTotalPredictions(predictionsResponse.total);
      setTotalStrategies(publicStrategies.length);

      // Combine and sort by creation date (most recent first)
      const items: FeedItem[] = [
        ...predictionsResponse.predictions.map((p) => ({ type: "prediction" as const, data: p })),
        ...publicStrategies.map((s) => ({ type: "strategy" as const, data: s })),
      ].sort((a, b) => {
        const aTime = a.data.createdAt?.seconds ? Number(a.data.createdAt.seconds) : 0;
        const bTime = b.data.createdAt?.seconds ? Number(b.data.createdAt.seconds) : 0;
        return bTime - aTime;
      });

      setAllFeedItems(items);
    } catch (error) {
      console.error("Failed to load feed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Reset offset when filter changes
  useEffect(() => {
    setOffset(0);
  }, [filter]);

  // Filter and paginate items
  const filteredItems = allFeedItems.filter((item) => {
    if (filter === "all") return true;
    if (filter === "predictions") return item.type === "prediction";
    if (filter === "strategies") return item.type === "strategy";
    return true;
  });

  const paginatedItems = filteredItems.slice(offset, offset + limit);
  const totalFilteredItems = filteredItems.length;

  const formatDate = (timestamp: { seconds: bigint } | undefined) => {
    if (!timestamp) return "—";
    const date = new Date(Number(timestamp.seconds) * 1000);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatTime = (timestamp: { seconds: bigint } | undefined) => {
    if (!timestamp) return "—";
    const date = new Date(Number(timestamp.seconds) * 1000);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const getStatusBadge = (status: PredictionStatus) => {
    const statusMap = {
      [PredictionStatus.ACTIVE]: { label: "Active", className: "bg-blue-100 text-blue-800" },
      [PredictionStatus.HIT_TARGET]: {
        label: "Hit Target",
        className: "bg-green-100 text-green-800",
      },
      [PredictionStatus.HIT_STOP]: { label: "Hit Stop", className: "bg-red-100 text-red-800" },
      [PredictionStatus.EXPIRED]: { label: "Expired", className: "bg-gray-100 text-gray-800" },
    };
    const config = statusMap[status as keyof typeof statusMap] || { label: "Unknown", className: "bg-gray-100" };
    return (
      <span className={`px-2 py-1 text-xs rounded-full font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const calculateReturn = (prediction: Prediction) => {
    if (prediction.currentPrice && prediction.currentPrice > 0) {
      const returnPct =
        ((prediction.currentPrice - prediction.entryPrice) / prediction.entryPrice) * 100;
      return returnPct;
    }
    return null;
  };

  const getStrategyStatusBadge = (status: StrategyStatus) => {
    const statusMap = {
      [StrategyStatus.ACTIVE]: { label: "Active", className: "bg-green-100 text-green-800" },
      [StrategyStatus.PAUSED]: { label: "Paused", className: "bg-yellow-100 text-yellow-800" },
      [StrategyStatus.STOPPED]: { label: "Stopped", className: "bg-gray-100 text-gray-800" },
    };
    const config = statusMap[status as keyof typeof statusMap] || { label: "Unknown", className: "bg-gray-100" };
    return (
      <span className={`px-2 py-1 text-xs rounded-full font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getRiskLevelLabel = (riskLevel: RiskLevel) => {
    switch (riskLevel) {
      case RiskLevel.LOW: return "Low";
      case RiskLevel.MEDIUM: return "Medium";
      case RiskLevel.HIGH: return "High";
      default: return "Unspecified";
    }
  };

  const toNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Public Feed</h1>
        <p className="mt-2 text-gray-600">
          See what the community is sharing. {totalPredictions} public predictions and {totalStrategies} public strategies.
        </p>
        
        {/* Filter Buttons */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <button
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("predictions")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "predictions"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Predictions
          </button>
          <button
            onClick={() => setFilter("strategies")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "strategies"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Strategies
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {filter === "all" && "No public content yet."}
            {filter === "predictions" && "No public predictions yet."}
            {filter === "strategies" && "No public strategies yet."}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {filter === "all" && "Be the first to share a strategy or prediction!"}
            {filter === "predictions" && "Be the first to share a prediction!"}
            {filter === "strategies" && "Be the first to share a strategy!"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedItems.map((item) => {
            if (item.type === "prediction") {
              const prediction = item.data;
              const returnPct = calculateReturn(prediction);
              const isPositive = returnPct !== null && returnPct > 0;

              return (
                <div
                  key={`prediction-${prediction.id}`}
                  className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">PREDICTION</span>
                        <h3 className="text-2xl font-bold text-gray-900">{prediction.symbol}</h3>
                        {getStatusBadge(prediction.status)}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-sm text-gray-500">Entry Price</p>
                          <p className="text-lg font-semibold">${prediction.entryPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Target Price</p>
                          <p className="text-lg font-semibold text-green-600">
                            ${prediction.targetPrice.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Stop Loss</p>
                          <p className="text-lg font-semibold text-red-600">
                            ${prediction.stopLossPrice.toFixed(2)}
                          </p>
                        </div>
                        {returnPct !== null && (
                          <div>
                            <p className="text-sm text-gray-500">Current Return</p>
                            <div className="flex items-center gap-1">
                              {isPositive ? (
                                <TrendingUp className="w-5 h-5 text-green-600" />
                              ) : (
                                <TrendingDown className="w-5 h-5 text-red-600" />
                              )}
                              <p
                                className={`text-lg font-semibold ${isPositive ? "text-green-600" : "text-red-600"}`}
                              >
                                {returnPct > 0 ? "+" : ""}
                                {returnPct.toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <Target className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            Target: +{prediction.targetReturnPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingDown className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            Risk: -{prediction.stopLossPct.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Score: {prediction.overallScore}/10</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(prediction.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{formatTime(prediction.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            } else {
              const strategy = item.data;
              const monthlyBudget = toNumber(strategy.monthlyBudget);
              const currentMonthSpent = toNumber(strategy.currentMonthSpent);

              return (
                <div
                  key={`strategy-${strategy.id}`}
                  className="bg-white rounded-lg shadow-md border border-purple-200 p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded">STRATEGY</span>
                        <h3 className="text-2xl font-bold text-gray-900">{strategy.name}</h3>
                        {getStrategyStatusBadge(strategy.status)}
                      </div>

                      {strategy.description && (
                        <p className="text-gray-600 mt-2 mb-4">{strategy.description}</p>
                      )}

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-sm text-gray-500">Monthly Budget</p>
                          <p className="text-lg font-semibold">${monthlyBudget.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Spent This Month</p>
                          <p className="text-lg font-semibold text-purple-600">
                            ${currentMonthSpent.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Target Return</p>
                          <p className="text-lg font-semibold text-green-600">
                            +{toNumber(strategy.targetReturnPct).toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Risk Level</p>
                          <p className="text-lg font-semibold">{getRiskLevelLabel(strategy.riskLevel)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-sm">
                          <BarChart3 className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            Time Horizon: {toNumber(strategy.timeHorizon)} days
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            Per Stock: ${toNumber(strategy.perStockAllocation).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <StrategyIcon className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600">
                            Max Stocks: {toNumber(strategy.maxUniqueStocks)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(strategy.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{formatTime(strategy.createdAt)}</p>
                    </div>
                  </div>
                </div>
              );
            }
          })}

          {/* Pagination */}
          {totalFilteredItems > limit && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                {offset + 1}-{Math.min(offset + limit, totalFilteredItems)} of {totalFilteredItems}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= totalFilteredItems}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
