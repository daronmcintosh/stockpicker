import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import {
  Frequency,
  PredictionAction,
  PredictionStatus,
  RiskLevel,
  StrategyStatus,
} from "@/gen/stockpicker/v1/strategy_pb";
import { predictionClient, strategyClient } from "@/lib/connect";
import { fetchStockPrices } from "@/lib/stockPrice";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  DollarSign,
  Pencil,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/")({ component: App });

function getFrequencyLabel(frequency: Frequency): string {
  switch (frequency) {
    case Frequency.DAILY:
      return "Daily";
    case Frequency.TWICE_WEEKLY:
      return "Twice Weekly";
    case Frequency.WEEKLY:
      return "Weekly";
    case Frequency.BIWEEKLY:
      return "Biweekly";
    case Frequency.MONTHLY:
      return "Monthly";
    default:
      return "Unspecified";
  }
}

function getRiskLevelLabel(riskLevel: RiskLevel): string {
  switch (riskLevel) {
    case RiskLevel.LOW:
      return "Low";
    case RiskLevel.MEDIUM:
      return "Medium";
    case RiskLevel.HIGH:
      return "High";
    default:
      return "Unspecified";
  }
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function App() {
  const navigate = useNavigate();
  const [activeStrategiesCount, setActiveStrategiesCount] = useState(0);
  const [totalStrategiesCount, setTotalStrategiesCount] = useState(0);
  const [totalBudget, setTotalBudget] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [activePredictionsCount, setActivePredictionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [allStrategies, setAllStrategies] = useState<Strategy[]>([]);
  const [activeStrategies, setActiveStrategies] = useState<Strategy[]>([]);
  const [recentPredictions, setRecentPredictions] = useState<Prediction[]>([]);
  const [triggeringStrategy, setTriggeringStrategy] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedStrategyForDetail, setSelectedStrategyForDetail] = useState<Strategy | null>(null);
  const [predictionDialogOpen, setPredictionDialogOpen] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [predictionCounts, setPredictionCounts] = useState<Record<string, number>>({});
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [predictionStats, setPredictionStats] = useState({
    hitTarget: 0,
    hitStop: 0,
    active: 0,
    expired: 0,
    total: 0,
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (recentPredictions.length > 0) {
      const symbols = recentPredictions.map((p) => p.symbol).filter(Boolean);
      if (symbols.length > 0) {
        fetchStockPrices(symbols)
          .then((prices) => {
            setCurrentPrices(prices);
          })
          .catch((err) => console.error("Failed to fetch prices:", err));
      }
    }
  }, [recentPredictions]);

  async function loadDashboardData() {
    try {
      // Load strategies
      const strategiesResponse = await strategyClient.listStrategies({});
      const strategies = strategiesResponse.strategies;
      setAllStrategies(strategies);
      setTotalStrategiesCount(strategies.length);

      // Count active strategies
      const active = strategies.filter((s) => s.status === StrategyStatus.ACTIVE);
      setActiveStrategiesCount(active.length);
      setActiveStrategies(active);

      // Calculate total budget and spending
      const budget = strategies.reduce((sum, s) => sum + toNumber(s.monthlyBudget), 0);
      const spent = strategies.reduce((sum, s) => sum + toNumber(s.currentMonthSpent), 0);
      setTotalBudget(budget);
      setTotalSpent(spent);

      // Load predictions for all strategies
      let totalPredictions = 0;
      let activePredictions = 0;
      const counts: Record<string, number> = {};
      const allPredictions: Prediction[] = [];
      const stats = {
        hitTarget: 0,
        hitStop: 0,
        active: 0,
        expired: 0,
        total: 0,
      };

      for (const strategy of strategies) {
        try {
          const predictionsResponse = await predictionClient.listPredictions({
            strategyId: strategy.id,
          });
          const preds = predictionsResponse.predictions;
          const count = preds.length;
          totalPredictions += count;
          counts[strategy.id] = count;
          allPredictions.push(...preds);

          // Count by status
          for (const pred of preds) {
            stats.total++;
            if (pred.status === PredictionStatus.ACTIVE) {
              activePredictions++;
              stats.active++;
            } else if (pred.status === PredictionStatus.HIT_TARGET) {
              stats.hitTarget++;
            } else if (pred.status === PredictionStatus.HIT_STOP) {
              stats.hitStop++;
            } else if (pred.status === PredictionStatus.EXPIRED) {
              stats.expired++;
            }
          }
        } catch (error) {
          console.error(`Failed to load predictions for strategy ${strategy.id}:`, error);
          counts[strategy.id] = 0;
        }
      }

      // Get recent predictions (last 10, sorted by date)
      const recent = allPredictions
        .sort((a, b) => {
          const aTime = a.createdAt?.seconds ? Number(a.createdAt.seconds) : 0;
          const bTime = b.createdAt?.seconds ? Number(b.createdAt.seconds) : 0;
          return bTime - aTime;
        })
        .slice(0, 10);

      setPredictionsCount(totalPredictions);
      setActivePredictionsCount(activePredictions);
      setPredictionCounts(counts);
      setRecentPredictions(recent);
      setPredictionStats(stats);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleTriggerPredictions(strategyId: string, strategyName: string) {
    setTriggeringStrategy(strategyId);
    try {
      const response = await strategyClient.triggerPredictions({ id: strategyId });
      if (response.success) {
        toast.success(`Predictions triggered for ${strategyName}!`);
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error("Failed to trigger predictions:", error);
      toast.error("Failed to trigger predictions");
    } finally {
      setTriggeringStrategy(null);
    }
  }

  function openDetailDialog(strategy: Strategy) {
    setSelectedStrategyForDetail(strategy);
    setDetailDialogOpen(true);
  }

  function openPredictionDialog(prediction: Prediction) {
    setSelectedPrediction(prediction);
    setPredictionDialogOpen(true);
  }

  const hitRate =
    predictionStats.total > 0
      ? (
          (predictionStats.hitTarget / (predictionStats.hitTarget + predictionStats.hitStop)) *
          100
        ).toFixed(1)
      : "0.0";
  const budgetRemaining = totalBudget - totalSpent;
  const budgetUtilization = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : "0.0";

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">StockPicker Dashboard</h1>
        <p className="text-gray-600">AI-powered stock trading strategies for automated investing</p>
      </div>

      {/* Enhanced Stats Grid */}
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

      {/* Prediction Status Breakdown */}
      {!loading && predictionStats.total > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Prediction Performance</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{predictionStats.hitTarget}</div>
              <div className="text-xs text-gray-600 mt-1">Hit Target</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{predictionStats.hitStop}</div>
              <div className="text-xs text-gray-600 mt-1">Hit Stop Loss</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{predictionStats.active}</div>
              <div className="text-xs text-gray-600 mt-1">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-600">{predictionStats.expired}</div>
              <div className="text-xs text-gray-600 mt-1">Expired</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        {/* Recent Predictions */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recent Predictions</h2>
            <Link
              to="/predictions"
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
                <Link to="/strategies" className="text-sm text-blue-600 hover:text-blue-700">
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

                return (
                  <div
                    key={prediction.id}
                    onClick={() => openPredictionDialog(prediction)}
                    className="block p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="font-bold text-lg text-gray-900">{prediction.symbol}</div>
                        {(() => {
                          const source = (prediction as any).source;
                          const isManual = source === 2;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
                                isManual
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {isManual ? (
                                <Pencil className="w-3 h-3" />
                              ) : (
                                <Bot className="w-3 h-3" />
                              )}
                            </span>
                          );
                        })()}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            prediction.status === PredictionStatus.ACTIVE
                              ? "bg-blue-100 text-blue-800"
                              : prediction.status === PredictionStatus.HIT_TARGET
                                ? "bg-green-100 text-green-800"
                                : prediction.status === PredictionStatus.HIT_STOP
                                  ? "bg-red-100 text-red-800"
                                  : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {prediction.status === PredictionStatus.ACTIVE
                            ? "Active"
                            : prediction.status === PredictionStatus.HIT_TARGET
                              ? "Hit Target"
                              : prediction.status === PredictionStatus.HIT_STOP
                                ? "Hit Stop"
                                : "Expired"}
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

        {/* Quick Actions */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-bold mb-2">Strategies</h2>
            <p className="text-sm opacity-90 mb-4">
              Create and manage AI-powered trading strategies
            </p>
            <Link
              to="/strategies"
              className="inline-block bg-white text-blue-600 px-4 py-2 rounded-lg font-semibold hover:bg-blue-50 transition-colors text-sm"
            >
              Manage Strategies
            </Link>
          </div>

          <div className="bg-gradient-to-br from-green-600 to-green-700 text-white rounded-lg p-6 shadow-lg">
            <h2 className="text-xl font-bold mb-2">Predictions</h2>
            <p className="text-sm opacity-90 mb-4">View and manage stock predictions</p>
            <Link
              to="/predictions"
              className="inline-block bg-white text-green-600 px-4 py-2 rounded-lg font-semibold hover:bg-green-50 transition-colors text-sm"
            >
              View Predictions
            </Link>
          </div>
        </div>
      </div>

      {/* Active Strategies - More Compact */}
      {activeStrategies.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Active Strategies</h2>
            <Link
              to="/strategies"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {activeStrategies.map((strategy) => (
              <div
                key={strategy.id}
                onClick={() => openDetailDialog(strategy)}
                className="p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-base font-bold text-gray-900 truncate">
                        {strategy.name}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">
                        Active
                      </span>
                    </div>
                    {strategy.description && (
                      <p className="text-sm text-gray-600 truncate mb-2">{strategy.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{predictionCounts[strategy.id] ?? 0} predictions</span>
                      <span>•</span>
                      <span>${toNumber(strategy.monthlyBudget).toLocaleString()}/mo</span>
                      <span>•</span>
                      <span>{getFrequencyLabel(strategy.frequency)}</span>
                      <span>•</span>
                      <span>{getRiskLevelLabel(strategy.riskLevel)} risk</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTriggerPredictions(strategy.id, strategy.name);
                    }}
                    disabled={triggeringStrategy === strategy.id}
                    className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                  >
                    {triggeringStrategy === strategy.id ? (
                      <>
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        title="Strategy Details"
        description={selectedStrategyForDetail?.name || ""}
      >
        {selectedStrategyForDetail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
                <StatusBadge status={selectedStrategyForDetail.status} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Predictions</label>
                <div className="text-lg font-semibold">
                  {predictionCounts[selectedStrategyForDetail.id] ?? 0}
                </div>
              </div>
            </div>

            {selectedStrategyForDetail.description && (
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
                <div className="text-sm">{selectedStrategyForDetail.description}</div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Custom Prompt</label>
              <div className="text-sm bg-gray-50 p-3 rounded border border-gray-200 max-h-40 overflow-y-auto">
                {selectedStrategyForDetail.customPrompt || "No custom prompt"}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Monthly Budget
                </label>
                <div className="text-lg font-semibold">
                  $
                  {Number(selectedStrategyForDetail.monthlyBudget).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Spent This Month
                </label>
                <div className="text-lg font-semibold">
                  $
                  {Number(selectedStrategyForDetail.currentMonthSpent).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Time Horizon</label>
                <div className="text-sm">{selectedStrategyForDetail.timeHorizon}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Target Return
                </label>
                <div className="text-sm">
                  {Number(selectedStrategyForDetail.targetReturnPct).toFixed(2)}% ($
                  {(
                    (Number(selectedStrategyForDetail.monthlyBudget) *
                      Number(selectedStrategyForDetail.targetReturnPct)) /
                    100
                  ).toFixed(2)}
                  )
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Frequency</label>
                <div className="text-sm">
                  {getFrequencyLabel(selectedStrategyForDetail.frequency)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Risk Level</label>
                <div className="text-sm">
                  {getRiskLevelLabel(selectedStrategyForDetail.riskLevel)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Trades Per Month
                </label>
                <div className="text-sm">{selectedStrategyForDetail.tradesPerMonth}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Per Trade Budget
                </label>
                <div className="text-sm">
                  ${Number(selectedStrategyForDetail.perTradeBudget).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Per Stock Allocation
                </label>
                <div className="text-sm">
                  ${Number(selectedStrategyForDetail.perStockAllocation).toFixed(2)}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Portfolio Size
                </label>
                <div className="text-sm">
                  {selectedStrategyForDetail.uniqueStocksCount} /{" "}
                  {selectedStrategyForDetail.maxUniqueStocks} stocks
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
                <div className="text-sm">
                  {selectedStrategyForDetail.createdAt
                    ? new Date(
                        Number(selectedStrategyForDetail.createdAt.seconds) * 1000
                      ).toLocaleString()
                    : "N/A"}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
                <div className="text-sm">
                  {selectedStrategyForDetail.updatedAt
                    ? new Date(
                        Number(selectedStrategyForDetail.updatedAt.seconds) * 1000
                      ).toLocaleString()
                    : "N/A"}
                </div>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setDetailDialogOpen(false)}>
            Close
          </DialogButton>
        </DialogFooter>
      </Dialog>

      {/* Prediction Detail Dialog */}
      <Dialog
        open={predictionDialogOpen}
        onOpenChange={setPredictionDialogOpen}
        title={
          selectedPrediction ? (
            <div className="flex items-center gap-2">
              <span>{selectedPrediction.symbol} - Prediction Details</span>
              {(() => {
                const source = (selectedPrediction as any).source;
                const isManual = source === 2;
                return (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                      isManual ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {isManual ? (
                      <>
                        <Pencil className="w-3 h-3" />
                        Manual
                      </>
                    ) : (
                      <>
                        <Bot className="w-3 h-3" />
                        AI Generated
                      </>
                    )}
                  </span>
                );
              })()}
            </div>
          ) : (
            "Prediction Details"
          )
        }
        description={
          selectedPrediction?.createdAt
            ? `Created ${new Date(Number(selectedPrediction.createdAt.seconds) * 1000).toLocaleDateString()}`
            : undefined
        }
        size="lg"
      >
        {selectedPrediction &&
          (() => {
            const entryPrice = toNumber(selectedPrediction.entryPrice);
            const targetPrice = toNumber(selectedPrediction.targetPrice);
            const stopLossPrice = toNumber(selectedPrediction.stopLossPrice);
            const currentPrice =
              currentPrices[selectedPrediction.symbol] ??
              toNumber(selectedPrediction.currentPrice ?? selectedPrediction.entryPrice);
            const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
            const targetReturn = toNumber(selectedPrediction.targetReturnPct);
            const allocatedAmount = toNumber(selectedPrediction.allocatedAmount);
            const sentimentScore = toNumber(selectedPrediction.sentimentScore);
            const overallScore = toNumber(selectedPrediction.overallScore);
            const stopLossDollarImpact = toNumber(selectedPrediction.stopLossDollarImpact);
            const stopLossPct = toNumber(selectedPrediction.stopLossPct);
            const strategy = allStrategies.find((s) => s.id === selectedPrediction.strategyId);

            return (
              <div className="space-y-6">
                {/* Header Section with Status */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <span
                      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                        selectedPrediction.status === PredictionStatus.ACTIVE
                          ? "bg-blue-100 text-blue-800"
                          : selectedPrediction.status === PredictionStatus.HIT_TARGET
                            ? "bg-green-100 text-green-800"
                            : selectedPrediction.status === PredictionStatus.HIT_STOP
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {selectedPrediction.status === PredictionStatus.ACTIVE
                        ? "Active"
                        : selectedPrediction.status === PredictionStatus.HIT_TARGET
                          ? "Hit Target"
                          : selectedPrediction.status === PredictionStatus.HIT_STOP
                            ? "Hit Stop"
                            : "Expired"}
                    </span>
                  </div>
                </div>

                {strategy && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Strategy</label>
                    <Link
                      to="/strategies"
                      search={{ id: selectedPrediction.strategyId }}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <TrendingUp className="w-4 h-4" />
                      {strategy.name}
                    </Link>
                  </div>
                )}

                {/* Price Zones Visualization */}
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Price Levels</h4>
                  <div className="space-y-2">
                    {/* Target Zone */}
                    <div className="flex items-center justify-between bg-green-50 border-l-4 border-green-500 p-2 rounded">
                      <div>
                        <div className="text-xs text-gray-600">Target</div>
                        <div className="text-sm font-semibold text-green-700">
                          $
                          {targetPrice.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-600">Gain</div>
                        <div className="text-sm font-semibold text-green-700">
                          +$
                          {(
                            (targetPrice - entryPrice) *
                            (allocatedAmount / entryPrice)
                          ).toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-xs text-green-600">{targetReturn.toFixed(2)}%</div>
                      </div>
                    </div>

                    {/* Entry Zone */}
                    <div className="flex items-center justify-between bg-yellow-50 border-l-4 border-yellow-500 p-2 rounded">
                      <div>
                        <div className="text-xs text-gray-600">Entry</div>
                        <div className="text-sm font-semibold text-yellow-700">
                          $
                          {entryPrice.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-600">Current</div>
                        <div
                          className={`text-sm font-semibold ${
                            returnPct >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          $
                          {currentPrice.toLocaleString("en-US", {
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
                    </div>

                    {/* Stop Loss Zone */}
                    <div className="flex items-center justify-between bg-red-50 border-l-4 border-red-500 p-2 rounded">
                      <div>
                        <div className="text-xs text-gray-600">Stop Loss</div>
                        <div className="text-sm font-semibold text-red-700">
                          $
                          {stopLossPrice.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-600">Loss</div>
                        <div className="text-sm font-semibold text-red-700">
                          -$
                          {stopLossDollarImpact.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-xs text-red-600">{stopLossPct.toFixed(2)}%</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Position Sizing */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-blue-900 mb-3">Position Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-blue-600 mb-1">Shares</div>
                      <div className="font-semibold text-blue-900">
                        {(allocatedAmount / entryPrice).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-blue-600 mb-1">Allocated</div>
                      <div className="font-semibold text-blue-900">
                        $
                        {allocatedAmount.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Time Horizon
                    </label>
                    <div className="text-sm">
                      {selectedPrediction.timeHorizonDays && selectedPrediction.timeHorizonDays > 0
                        ? `${selectedPrediction.timeHorizonDays} days`
                        : "N/A"}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Risk Level
                    </label>
                    <div className="text-sm">
                      {selectedPrediction.riskLevel === RiskLevel.LOW
                        ? "Low"
                        : selectedPrediction.riskLevel === RiskLevel.MEDIUM
                          ? "Medium"
                          : selectedPrediction.riskLevel === RiskLevel.HIGH
                            ? "High"
                            : "Unspecified"}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Sentiment Score
                    </label>
                    <div className="text-sm">{sentimentScore.toFixed(2)} / 10</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Overall Score
                    </label>
                    <div className="text-sm">{overallScore.toFixed(2)} / 10</div>
                  </div>
                </div>

                {selectedPrediction.technicalAnalysis && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      {(() => {
                        const source = (selectedPrediction as any).source;
                        return source === 2 ? "Your Analysis Notes" : "AI Technical Analysis";
                      })()}
                    </label>
                    <div
                      className={`text-sm p-3 rounded border max-h-40 overflow-y-auto whitespace-pre-wrap ${(() => {
                        const source = (selectedPrediction as any).source;
                        return source === 2
                          ? "bg-blue-50 border-blue-200"
                          : "bg-gray-50 border-gray-200";
                      })()}`}
                    >
                      {selectedPrediction.technicalAnalysis}
                    </div>
                  </div>
                )}

                {selectedPrediction.evaluationDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Evaluation Date
                    </label>
                    <div className="text-sm">
                      {new Date(
                        Number(selectedPrediction.evaluationDate.seconds) * 1000
                      ).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setPredictionDialogOpen(false)}>
            Close
          </DialogButton>
          <DialogButton
            variant="default"
            onClick={() => {
              setPredictionDialogOpen(false);
              navigate({ to: "/predictions" });
            }}
          >
            View Full Details
          </DialogButton>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: StrategyStatus }) {
  const statusConfig = {
    [StrategyStatus.ACTIVE]: {
      label: "Active",
      className: "bg-green-100 text-green-800",
    },
    [StrategyStatus.PAUSED]: {
      label: "Paused",
      className: "bg-yellow-100 text-yellow-800",
    },
    [StrategyStatus.STOPPED]: {
      label: "Stopped",
      className: "bg-red-100 text-red-800",
    },
    [StrategyStatus.UNSPECIFIED]: {
      label: "Unknown",
      className: "bg-gray-100 text-gray-800",
    },
  };

  const config = statusConfig[status] || statusConfig[StrategyStatus.UNSPECIFIED];

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
