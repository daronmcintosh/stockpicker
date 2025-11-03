import { BarChart3, CheckCircle2, DollarSign, TrendingUp } from "lucide-react";

interface DashboardStatsProps {
  loading: boolean;
  activeStrategiesCount: number;
  totalStrategiesCount: number;
  activePredictionsCount: number;
  predictionsCount: number;
  totalSpent: number;
  totalBudget: number;
  budgetUtilization: string;
  budgetRemaining: number;
  hitRate: string;
  predictionStats: {
    hitTarget: number;
    hitStop: number;
  };
  totalExpectedReturn?: number;
  activeReturns?: number;
  totalPortfolioValue?: number;
}

export function DashboardStats({
  loading,
  activeStrategiesCount,
  totalStrategiesCount,
  activePredictionsCount,
  predictionsCount,
  totalSpent,
  totalBudget,
  budgetUtilization,
  budgetRemaining,
  hitRate,
  predictionStats,
}: DashboardStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <TrendingUp className="w-6 h-6 text-blue-600" />
          <span className="text-xs font-medium text-gray-500">Strategies</span>
        </div>
        {loading ? (
          <div className="text-2xl font-bold text-gray-400">...</div>
        ) : (
          <>
            <div className="text-3xl font-bold text-blue-600 mb-1">{activeStrategiesCount}</div>
            <div className="text-sm text-gray-600">
              of {totalStrategiesCount} total
              {totalStrategiesCount > 0 && (
                <span className="ml-2 text-gray-400">
                  ({Math.round((activeStrategiesCount / totalStrategiesCount) * 100)}%)
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <BarChart3 className="w-6 h-6 text-green-600" />
          <span className="text-xs font-medium text-gray-500">Predictions</span>
        </div>
        {loading ? (
          <div className="text-2xl font-bold text-gray-400">...</div>
        ) : (
          <>
            <div className="text-3xl font-bold text-green-600 mb-1">{activePredictionsCount}</div>
            <div className="text-sm text-gray-600">
              active of {predictionsCount} total
              {predictionsCount > 0 && (
                <span className="ml-2 text-gray-400">
                  ({Math.round((activePredictionsCount / predictionsCount) * 100)}%)
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <DollarSign className="w-6 h-6 text-purple-600" />
          <span className="text-xs font-medium text-gray-500">Budget</span>
        </div>
        {loading ? (
          <div className="text-2xl font-bold text-gray-400">...</div>
        ) : (
          <>
            <div className="text-3xl font-bold text-purple-600 mb-1">
              ${totalSpent.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">
              of ${totalBudget.toLocaleString()} ({budgetUtilization}%)
              {budgetRemaining > 0 && (
                <span className="ml-2 text-green-600">
                  ${budgetRemaining.toLocaleString()} remaining
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          <span className="text-xs font-medium text-gray-500">Hit Rate</span>
        </div>
        {loading ? (
          <div className="text-2xl font-bold text-gray-400">...</div>
        ) : (
          <>
            <div className="text-3xl font-bold text-emerald-600 mb-1">{hitRate}%</div>
            <div className="text-sm text-gray-600">
              {predictionStats.hitTarget} hits /{" "}
              {predictionStats.hitTarget + predictionStats.hitStop} closed
            </div>
          </>
        )}
      </div>
    </div>
  );
}
