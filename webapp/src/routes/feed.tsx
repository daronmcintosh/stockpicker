import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { predictionClient } from "@/lib/connect";
import { createFileRoute } from "@tanstack/react-router";
import { Clock, Target, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export const Route = createFileRoute("/feed")({
  component: FeedPage,
});

function FeedPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const loadPredictions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await predictionClient.getPublicPredictions({
        limit,
        offset,
      });
      setPredictions(response.predictions);
      setTotal(response.total);
    } catch (error) {
      console.error("Failed to load public predictions:", error);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Public Predictions Feed</h1>
        <p className="mt-2 text-gray-600">
          See what the community is predicting. {total} public predictions shared.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : predictions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">No public predictions yet.</p>
          <p className="text-gray-400 text-sm mt-2">Be the first to share a prediction!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {predictions.map((prediction) => {
            const returnPct = calculateReturn(prediction);
            const isPositive = returnPct !== null && returnPct > 0;

            return (
              <div
                key={prediction.id}
                className="bg-white rounded-lg shadow-md border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
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
          })}

          {/* Pagination */}
          {total > limit && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                {offset + 1}-{Math.min(offset + limit, total)} of {total}
              </span>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
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
