import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionSource, PredictionStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Bot, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { getPredictionSource, getStatusColor, getStatusLabel, toNumber } from "./dashboardHelpers";

interface RecentPredictionsProps {
  loading: boolean;
  recentPredictions: Prediction[];
  currentPrices: Record<string, number>;
  allStrategies: Strategy[];
  onPredictionClick: (prediction: Prediction) => void;
}

export function RecentPredictions({
  loading,
  recentPredictions,
  currentPrices,
  allStrategies,
  onPredictionClick,
}: RecentPredictionsProps) {
  return (
    <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="p-5 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recent Predictions</h2>
        <Link
          to="/predictions"
          search={{ strategy: undefined, status: undefined, action: undefined }}
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View All <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="divide-y divide-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading predictions...</div>
        ) : recentPredictions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="mb-2">No predictions yet</p>
            <Link
              to="/strategies"
              search={{ id: undefined }}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Create a strategy to get started
            </Link>
          </div>
        ) : (
          recentPredictions.map((prediction) => {
            const entryPrice = toNumber(prediction.entryPrice);
            const currentPrice =
              currentPrices[prediction.symbol] ??
              toNumber(prediction.currentPrice ?? prediction.entryPrice);
            const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
            const strategy = allStrategies.find((s) => s.id === prediction.strategyId);
            const source = prediction.source;
            const isManual = source === PredictionSource.MANUAL;

            return (
              <div
                key={prediction.id}
                onClick={() => onPredictionClick(prediction)}
                className="block p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="font-bold text-lg text-gray-900">{prediction.symbol}</div>
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                        isManual ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {isManual ? <Pencil className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(prediction.status)}`}
                    >
                      {getStatusLabel(prediction.status)}
                    </span>
                    {strategy && (
                      <span className="text-xs text-gray-500 truncate">{strategy.name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-6 ml-4">
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Entry</div>
                      <div className="text-sm font-semibold">${entryPrice.toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Current</div>
                      <div
                        className={`text-sm font-semibold ${
                          returnPct >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        ${currentPrice.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-right min-w-[70px]">
                      <div className="text-xs text-gray-500">Return</div>
                      <div
                        className={`text-sm font-bold flex items-center gap-1 ${
                          returnPct >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {returnPct >= 0 ? (
                          <TrendingUp className="w-3 h-3" />
                        ) : (
                          <TrendingDown className="w-3 h-3" />
                        )}
                        {returnPct >= 0 ? "+" : ""}
                        {returnPct.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
