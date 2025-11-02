import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { predictionClient, strategyClient } from "@/lib/connect";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/predictions")({
  component: PredictionsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      strategy: (search.strategy as string) || undefined,
      status: search.status ? (Number(search.status) as PredictionStatus) : undefined,
    };
  },
});

function PredictionsPage() {
  const navigate = useNavigate({ from: "/predictions" });
  const { strategy: strategyFromUrl, status: statusFromUrl } = useSearch({
    from: "/predictions",
  });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStrategy, setSelectedStrategy] = useState<string>(strategyFromUrl || "all");
  const [strategies, setStrategies] = useState<Array<{ id: string; name: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<PredictionStatus | "all">(
    statusFromUrl || "all"
  );

  // Initialize filters from URL params
  useEffect(() => {
    if (strategyFromUrl) {
      setSelectedStrategy(strategyFromUrl);
    }
    if (statusFromUrl) {
      setStatusFilter(statusFromUrl);
    }
  }, [strategyFromUrl, statusFromUrl]);

  // Load strategies and predictions on mount and when filters change
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Load strategies
      const strategiesResponse = await strategyClient.listStrategies({});
      const strategiesList = strategiesResponse.strategies.map((s) => ({
        id: s.id,
        name: s.name,
      }));
      setStrategies(strategiesList);

      // Load predictions
      if (selectedStrategy === "all") {
        // Fetch predictions for all strategies
        const allPredictions: Prediction[] = [];
        for (const strategy of strategiesList) {
          try {
            const response = await predictionClient.listPredictions({
              strategyId: strategy.id,
              status: statusFilter !== "all" ? statusFilter : undefined,
            });
            allPredictions.push(...response.predictions);
          } catch (error) {
            console.error(`Failed to load predictions for strategy ${strategy.id}:`, error);
          }
        }
        // Sort by created date (newest first)
        allPredictions.sort((a, b) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        });
        setPredictions(allPredictions);
      } else {
        const response = await predictionClient.listPredictions({
          strategyId: selectedStrategy,
          status: statusFilter !== "all" ? statusFilter : undefined,
        });
        setPredictions(response.predictions);
      }
    } catch (error) {
      console.error("Failed to load predictions:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading predictions...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Stock Predictions</h1>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="strategy-filter"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Filter by Strategy
            </label>
            <select
              id="strategy-filter"
              value={selectedStrategy}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedStrategy(value);
                navigate({
                  search: {
                    strategy: value === "all" ? undefined : value,
                    status: statusFilter === "all" ? undefined : statusFilter,
                  },
                  replace: true,
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Strategies</option>
              {strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status-filter" className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Status
            </label>
            <select
              id="status-filter"
              value={statusFilter === "all" ? "all" : statusFilter}
              onChange={(e) => {
                const value =
                  e.target.value === "all" ? "all" : (Number(e.target.value) as PredictionStatus);
                setStatusFilter(value);
                navigate({
                  search: {
                    strategy: selectedStrategy === "all" ? undefined : selectedStrategy,
                    status: value === "all" ? undefined : value,
                  },
                  replace: true,
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value={PredictionStatus.ACTIVE}>Active</option>
              <option value={PredictionStatus.HIT_TARGET}>Hit Target</option>
              <option value={PredictionStatus.HIT_STOP}>Hit Stop Loss</option>
              <option value={PredictionStatus.EXPIRED}>Expired</option>
            </select>
          </div>
        </div>
      </div>

      {predictions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-xl font-semibold mb-2">No predictions found</h3>
          <p className="text-gray-600">
            {selectedStrategy === "all"
              ? "Create and start a strategy to generate predictions"
              : "This strategy hasn't generated any predictions yet"}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {predictions.map((prediction) => (
            <PredictionCard key={prediction.id} prediction={prediction} />
          ))}
        </div>
      )}
    </div>
  );
}

function PredictionCard({ prediction }: { prediction: Prediction }) {
  const currentPrice = prediction.currentPrice ?? prediction.entryPrice;
  const currentReturn = prediction.currentReturnPct ?? 0;
  const targetReturn = prediction.targetReturnPct;
  const entryPrice = prediction.entryPrice;
  const targetPrice = prediction.targetPrice;
  const stopLossPrice = prediction.stopLossPrice;

  const getStatusColor = (status: PredictionStatus) => {
    switch (status) {
      case PredictionStatus.ACTIVE:
        return "bg-blue-100 text-blue-800";
      case PredictionStatus.HIT_TARGET:
        return "bg-green-100 text-green-800";
      case PredictionStatus.HIT_STOP:
        return "bg-red-100 text-red-800";
      case PredictionStatus.EXPIRED:
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: PredictionStatus) => {
    switch (status) {
      case PredictionStatus.ACTIVE:
        return "Active";
      case PredictionStatus.HIT_TARGET:
        return "Hit Target";
      case PredictionStatus.HIT_STOP:
        return "Hit Stop Loss";
      case PredictionStatus.EXPIRED:
        return "Expired";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold">{prediction.symbol}</h2>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(prediction.status)}`}
            >
              {getStatusLabel(prediction.status)}
            </span>
          </div>
          {prediction.closedReason && (
            <p className="text-sm text-gray-600 mb-2">Closed: {prediction.closedReason}</p>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-500 mb-1">Current Return</div>
          <div
            className={`text-2xl font-bold flex items-center gap-1 ${
              currentReturn >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {currentReturn >= 0 ? (
              <TrendingUp className="w-5 h-5" />
            ) : (
              <TrendingDown className="w-5 h-5" />
            )}
            {currentReturn.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-sm text-gray-500">Entry Price</div>
          <div className="font-semibold">${entryPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Current Price</div>
          <div className="font-semibold">${currentPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Target Price</div>
          <div className="font-semibold text-green-600">${targetPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Stop Loss</div>
          <div className="font-semibold text-red-600">${stopLossPrice.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-gray-500">Allocated Amount</div>
          <div className="font-semibold">${prediction.allocatedAmount.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-gray-500">Target Return</div>
          <div className="font-semibold">{targetReturn.toFixed(2)}%</div>
        </div>
        <div>
          <div className="text-gray-500">Sentiment Score</div>
          <div className="font-semibold">{prediction.sentimentScore.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-gray-500">Overall Score</div>
          <div className="font-semibold">{prediction.overallScore.toFixed(2)}</div>
        </div>
      </div>

      {prediction.createdAt && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
          Created: {new Date(prediction.createdAt.seconds * 1000).toLocaleString()}
          {prediction.evaluationDate &&
            ` • Evaluation: ${new Date(prediction.evaluationDate.seconds * 1000).toLocaleDateString()}`}
        </div>
      )}
    </div>
  );
}
