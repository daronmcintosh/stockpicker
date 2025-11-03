import { UserAvatar } from "@/components/UserAvatar";
import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Clock,
  Copy,
  DollarSign,
  Share2,
  TrendingUp as StrategyIcon,
} from "lucide-react";
import { formatDate, getRiskLevelLabel, getStrategyStatusBadge, toNumber } from "./feedHelpers";

interface StrategyFeedCardProps {
  strategy: Strategy;
  token: string | null;
  onCopy?: (id: string) => void;
  onShare?: (id: string, name: string) => void;
}

export function StrategyFeedCard({ strategy, token, onCopy, onShare }: StrategyFeedCardProps) {
  const monthlyBudget = toNumber(strategy.monthlyBudget);
  const currentMonthSpent = toNumber(strategy.currentMonthSpent);

  return (
    <div className="bg-white rounded-lg shadow-sm border-2 border-purple-100 p-6 hover:shadow-md hover:border-purple-200 transition-all">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-md">
                STRATEGY
              </span>
              <h3 className="text-2xl font-bold text-gray-900">{strategy.name}</h3>
              {getStrategyStatusBadge(strategy.status)}
            </div>
            {strategy.user && (
              <Link
                to="/users/$username"
                params={{ username: strategy.user.username }}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
              >
                <UserAvatar user={strategy.user} size="sm" />
                <span>{strategy.user.displayName || strategy.user.username}</span>
              </Link>
            )}
          </div>

          {strategy.description && (
            <p className="text-gray-600 text-sm mt-2 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
              {strategy.description}
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Monthly Budget
              </p>
              <p className="text-xl font-bold text-gray-900">${monthlyBudget.toLocaleString()}</p>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Spent This Month
              </p>
              <p className="text-xl font-bold text-purple-700">
                ${currentMonthSpent.toLocaleString()}
              </p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Target Return
              </p>
              <p className="text-xl font-bold text-green-700">
                +{toNumber(strategy.targetReturnPct).toFixed(1)}%
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                Risk Level
              </p>
              <p className="text-xl font-bold text-gray-900">
                {getRiskLevelLabel(strategy.riskLevel)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <BarChart3 className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                Time Horizon:{" "}
                <span className="text-gray-900 font-semibold">
                  {strategy.timeHorizon || "3 months"}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <DollarSign className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                Per Stock:{" "}
                <span className="text-gray-900 font-semibold">
                  ${toNumber(strategy.perStockAllocation).toLocaleString()}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <StrategyIcon className="w-4 h-4 text-gray-400" />
              <span className="font-medium">
                Max Stocks:{" "}
                <span className="text-gray-900 font-semibold">
                  {toNumber(strategy.maxUniqueStocks)}
                </span>
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
                  onCopy(strategy.id);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors border border-indigo-600 shadow-sm"
                title="Copy strategy"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(strategy.id, strategy.name);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors border border-gray-600 shadow-sm"
                title="Share strategy link"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>
          )}
          <div className="flex items-center gap-1 text-xs text-gray-400 mt-auto pt-2">
            <Clock className="w-3 h-3" />
            <span>{formatDate(strategy.createdAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
