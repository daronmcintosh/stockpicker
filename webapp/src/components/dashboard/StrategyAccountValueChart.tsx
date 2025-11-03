import { toNumber } from "@/components/dashboard";
import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { calculateAccountValue, calculateBudget } from "@/lib/calculations";
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface StrategyAccountValueChartProps {
  strategies: Strategy[];
  predictions: Prediction[];
  currentPrices?: Record<string, number>;
  loading?: boolean;
  strategyId?: string;
  title?: string;
  showLegend?: boolean;
  showBreakdown?: boolean;
  height?: number;
}

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
];

/**
 * Calculate account value for a prediction at a given point in time
 */
function calculatePredictionValue(
  prediction: Prediction,
  asOfDate: Date,
  currentPrices?: Record<string, number>
): number {
  const createdAt = prediction.createdAt
    ? new Date(Number(prediction.createdAt.seconds) * 1000)
    : null;

  // Prediction doesn't exist yet at this date
  if (!createdAt || createdAt > asOfDate) {
    return 0;
  }

  const allocatedAmount = toNumber(prediction.allocatedAmount);

  // For active predictions, use current return
  if (prediction.status === PredictionStatus.ACTIVE) {
    let returnPct = toNumber(prediction.currentReturnPct);

    // If no stored return, calculate from current price
    if (!returnPct && currentPrices?.[prediction.symbol]) {
      const entryPrice = toNumber(prediction.entryPrice);
      const currentPrice = currentPrices[prediction.symbol];
      if (entryPrice > 0) {
        returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      }
    }

    return allocatedAmount * (1 + returnPct / 100);
  }

  // For closed predictions, use final return
  if (
    prediction.status === PredictionStatus.HIT_TARGET ||
    prediction.status === PredictionStatus.HIT_STOP ||
    prediction.status === PredictionStatus.EXPIRED
  ) {
    const returnPct = toNumber(prediction.currentReturnPct ?? 0);
    return allocatedAmount * (1 + returnPct / 100);
  }

  // For pending/dismissed predictions, just return initial amount
  return allocatedAmount;
}

/**
 * Build time series data for account values by strategy
 */
function buildTimeSeriesData(
  strategies: Strategy[],
  predictions: Prediction[],
  currentPrices?: Record<string, number>
): Array<Record<string, number | string>> {
  // Get all unique dates from prediction creation dates
  const dates = new Set<string>();
  const now = new Date();

  for (const prediction of predictions) {
    if (prediction.createdAt) {
      const createdAt = new Date(Number(prediction.createdAt.seconds) * 1000);
      // Add date at creation and today
      dates.add(createdAt.toISOString().split("T")[0]);
    }
  }

  // Always include today
  dates.add(now.toISOString().split("T")[0]);

  // Convert to sorted array
  const sortedDates = Array.from(dates).sort();

  // Build time series data
  const timeSeries: Array<Record<string, number | string>> = [];

  for (const dateStr of sortedDates) {
    const date = new Date(dateStr);
    const dataPoint: Record<string, number | string> = {
      date: dateStr,
      timestamp: date.getTime(),
    };

    // Calculate account value for each strategy at this date
    for (const strategy of strategies) {
      const strategyPredictions = predictions.filter((p) => p.strategyId === strategy.id);
      let accountValue = 0;

      for (const prediction of strategyPredictions) {
        accountValue += calculatePredictionValue(prediction, date, currentPrices);
      }

      // Use a safe key for the strategy name (replace spaces/special chars)
      const strategyKey = strategy.name.replace(/[^a-zA-Z0-9]/g, "_");
      dataPoint[strategyKey] = accountValue;
      // Also store the strategy ID for reference
      dataPoint[`${strategyKey}_id`] = strategy.id;
    }

    timeSeries.push(dataPoint);
  }

  return timeSeries;
}

export function StrategyAccountValueChart({
  strategies,
  predictions,
  currentPrices,
  loading,
  strategyId,
  title,
  showLegend = true,
  showBreakdown = true,
  height = 400,
}: StrategyAccountValueChartProps) {
  const filteredStrategies = useMemo(
    () => (strategyId ? strategies.filter((s) => s.id === strategyId) : strategies),
    [strategies, strategyId]
  );
  const filteredPredictions = useMemo(
    () => (strategyId ? predictions.filter((p) => p.strategyId === strategyId) : predictions),
    [predictions, strategyId]
  );
  const timeSeriesData = useMemo(() => {
    return buildTimeSeriesData(filteredStrategies, filteredPredictions, currentPrices);
  }, [filteredStrategies, filteredPredictions, currentPrices]);

  // Calculate current total account value using centralized calculation
  const totalAccountValue = useMemo(() => {
    const budget = calculateBudget(filteredStrategies, filteredPredictions);
    const accountValue = calculateAccountValue(
      filteredStrategies,
      filteredPredictions,
      currentPrices ?? {},
      budget
    );
    return accountValue.totalAccountValue;
  }, [filteredStrategies, filteredPredictions, currentPrices]);

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-lg text-gray-500">Loading chart data...</div>
        </div>
      </div>
    );
  }

  if (filteredStrategies.length === 0 || timeSeriesData.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Data Available</h3>
            <p className="text-gray-500">
              Create strategies and predictions to see account value over time
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-bold text-gray-900">
            {title ?? (strategyId ? "Account Value Over Time" : "Total Account Value by Strategy")}
          </h2>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              $
              {totalAccountValue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-sm text-gray-500">Total Portfolio Value</div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={timeSeriesData} margin={{ top: 10, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            stroke="#6b7280"
            fontSize={12}
            angle={-45}
            textAnchor="end"
            height={80}
            tickFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              padding: "12px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
            }}
            labelFormatter={(value) => {
              const date = new Date(value);
              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              });
            }}
            formatter={(value: number, name: string) => {
              const strategy = filteredStrategies.find(
                (s) => s.name.replace(/[^a-zA-Z0-9]/g, "_") === name
              );
              return [
                <div key="tooltip-value" className="text-sm">
                  <span className="font-semibold text-gray-900">{strategy?.name || name}: </span>
                  <span className="text-blue-600 font-semibold">
                    $
                    {value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>,
                "",
              ];
            }}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{ paddingTop: "20px" }}
              formatter={(value) => {
                const strategy = filteredStrategies.find(
                  (s) => s.name.replace(/[^a-zA-Z0-9]/g, "_") === value
                );
                return strategy?.name || value;
              }}
            />
          )}
          {filteredStrategies.map((strategy, index) => {
            const strategyKey = strategy.name.replace(/[^a-zA-Z0-9]/g, "_");
            return (
              <Line
                key={strategy.id}
                type="monotone"
                dataKey={strategyKey}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                name={strategyKey}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>

      {/* Strategy breakdown list */}
      {showBreakdown && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Current Values</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {filteredStrategies.map((strategy, index) => {
              const strategyKey = strategy.name.replace(/[^a-zA-Z0-9]/g, "_");
              const currentValue =
                timeSeriesData.length > 0
                  ? toNumber(timeSeriesData[timeSeriesData.length - 1][strategyKey] ?? 0)
                  : 0;

              // Calculate initial investment and returns
              const strategyPredictions = filteredPredictions.filter(
                (p) => p.strategyId === strategy.id
              );
              const initialInvestment = strategyPredictions.reduce(
                (sum, p) => sum + toNumber(p.allocatedAmount),
                0
              );
              const returns = currentValue - initialInvestment;
              const returnPct = initialInvestment > 0 ? (returns / initialInvestment) * 100 : 0;

              return (
                <div
                  key={strategy.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-medium text-gray-900 truncate">{strategy.name}</span>
                  </div>
                  <div className="flex items-center gap-6 ml-4">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-gray-900">
                        $
                        {currentValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                      <div
                        className={`text-xs ${returnPct >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        {returnPct >= 0 ? "+" : ""}
                        {returnPct.toFixed(2)}%
                      </div>
                    </div>
                    <div className="text-right text-xs text-gray-500 w-20">
                      {totalAccountValue > 0
                        ? ((currentValue / totalAccountValue) * 100).toFixed(1)
                        : "0.0"}
                      %
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
