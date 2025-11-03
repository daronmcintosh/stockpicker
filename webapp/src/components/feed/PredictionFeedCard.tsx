import { UserAvatar } from "@/components/UserAvatar";
import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import { Link } from "@tanstack/react-router";
import { Clock, Copy, Share2, Target, TrendingDown, TrendingUp } from "lucide-react";
import { calculateReturn, formatDate, getStatusBadge } from "./feedHelpers";

interface PredictionFeedCardProps {
  prediction: Prediction;
  token: string | null;
  onCopy?: (prediction: Prediction) => void;
  onShare?: (prediction: Prediction) => void;
}

export function PredictionFeedCard({
  prediction,
  token,
  onCopy,
  onShare,
}: PredictionFeedCardProps) {
  const returnPct = calculateReturn(prediction);
  const isPositive = returnPct !== null && returnPct > 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border-2 border-blue-100 p-6 hover:shadow-md hover:border-blue-200 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-md">
                PREDICTION
              </span>
              <h3 className="text-2xl font-bold text-gray-900">{prediction.symbol}</h3>
              {getStatusBadge(prediction.status)}
            </div>
            {prediction.user && (
              <Link
                to="/users/$username"
                params={{ username: prediction.user.username }}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
              >
                <UserAvatar user={prediction.user} size="sm" />
                <span>{prediction.user.displayName || prediction.user.username}</span>
              </Link>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Entry Price
              </p>
              <p className="text-xl font-bold text-gray-900">${prediction.entryPrice.toFixed(2)}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Target Price
              </p>
              <p className="text-xl font-bold text-green-700">
                ${prediction.targetPrice.toFixed(2)}
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Stop Loss
              </p>
              <p className="text-xl font-bold text-red-700">
                ${prediction.stopLossPrice.toFixed(2)}
              </p>
            </div>
            {returnPct !== null ? (
              <div
                className={`border rounded-lg p-3 ${
                  isPositive ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}
              >
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Current Return
                </p>
                <div className="flex items-center gap-1">
                  {isPositive ? (
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  )}
                  <p
                    className={`text-xl font-bold ${isPositive ? "text-green-700" : "text-red-700"}`}
                  >
                    {returnPct > 0 ? "+" : ""}
                    {returnPct.toFixed(2)}%
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                  Current Return
                </p>
                <p className="text-lg font-semibold text-gray-400">—</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Target className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                Target:{" "}
                <span className="text-green-600">+{prediction.targetReturnPct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <TrendingDown className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                Risk: <span className="text-red-600">-{prediction.stopLossPct.toFixed(1)}%</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">
                Score: <span className="text-blue-600 font-bold">{prediction.overallScore}/10</span>
              </span>
            </div>
          </div>
        </div>

        <div className="ml-6 flex flex-col items-end gap-2 min-w-[120px]">
          {token && onCopy && onShare && (
            <div className="flex flex-col items-end gap-2 w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCopy(prediction);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors border border-indigo-600 shadow-sm"
                title="Copy prediction to another strategy"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(prediction);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors border border-gray-600 shadow-sm"
                title="Share prediction link"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-auto pt-2">
            <Clock className="w-3 h-3" />
            <span>{formatDate(prediction.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
