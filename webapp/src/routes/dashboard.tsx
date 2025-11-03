import {
  ActiveStrategies,
  DashboardPredictionDetailDialog,
  DashboardStats,
  RecentPredictions,
  StrategyAccountValueChart,
} from "@/components/dashboard";
import { toNumber } from "@/components/dashboard";
import { DeletePredictionDialog } from "@/components/prediction/DeletePredictionDialog";
import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import {
  type PredictionAction,
  PredictionStatus,
  StrategyStatus,
} from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import {
  type AccountValueCalculation,
  type BudgetCalculation,
  type PerformanceCalculation,
  calculateAccountValue,
  calculateBudget,
  calculatePerformance,
} from "@/lib/calculations";
import { createClient } from "@/lib/connect";
import { fetchStockPrices } from "@/lib/stockPrice";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/dashboard")({ component: App });

function App() {
  const { token } = useAuth();
  const [activeStrategiesCount, setActiveStrategiesCount] = useState(0);
  const [totalStrategiesCount, setTotalStrategiesCount] = useState(0);
  const [predictionsCount, setPredictionsCount] = useState(0);
  const [activePredictionsCount, setActivePredictionsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [allStrategies, setAllStrategies] = useState<Strategy[]>([]);
  const [activeStrategies, setActiveStrategies] = useState<Strategy[]>([]);
  const [recentPredictions, setRecentPredictions] = useState<Prediction[]>([]);
  const [triggeringStrategy, setTriggeringStrategy] = useState<string | null>(null);
  const [predictionDialogOpen, setPredictionDialogOpen] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [predictionCounts, setPredictionCounts] = useState<Record<string, number>>({});
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [isUpdatingAction, setIsUpdatingAction] = useState(false);
  const [_isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [predictionStats, setPredictionStats] = useState({
    hitTarget: 0,
    hitStop: 0,
    active: 0,
    expired: 0,
    total: 0,
  });
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);

  useEffect(() => {
    // Fetch prices for all active predictions, not just recent ones
    const activePreds = allPredictions.filter((p) => p.status === PredictionStatus.ACTIVE);
    if (activePreds.length > 0) {
      const symbols = activePreds.map((p) => p.symbol).filter(Boolean);
      if (symbols.length > 0) {
        setLoadingPrices(true);
        fetchStockPrices(symbols)
          .then((prices) => {
            setCurrentPrices(prices);
            setLoadingPrices(false);
          })
          .catch((err) => {
            console.error("Failed to fetch prices:", err);
            setLoadingPrices(false);
          });
      }
    }
  }, [allPredictions]);

  const loadDashboardData = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const client = createClient(token);
      // Load strategies
      const strategiesResponse = await client.strategy.listStrategies({});
      const strategies = strategiesResponse.strategies;
      setAllStrategies(strategies);
      setTotalStrategiesCount(strategies.length);

      // Count active strategies
      const active = strategies.filter((s) => s.status === StrategyStatus.ACTIVE);
      setActiveStrategiesCount(active.length);
      setActiveStrategies(active);

      // Budget and spending are now calculated using centralized functions

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
          const predictionsResponse = await client.prediction.listPredictions({
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
      setAllPredictions(allPredictions);
      setPredictionStats(stats);
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  async function handleTriggerPredictions(strategyId: string, strategyName: string) {
    if (!token) {
      toast.error("Please log in to trigger predictions");
      return;
    }

    setTriggeringStrategy(strategyId);
    try {
      const client = createClient(token);
      const response = await client.strategy.triggerPredictions({ id: strategyId });
      if (response.success) {
        toast.success(`Predictions triggered for ${strategyName}!`);
        await loadDashboardData();
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

  function openPredictionDialog(prediction: Prediction) {
    setSelectedPrediction(prediction);
    setPredictionDialogOpen(true);
  }

  const handleActionChange = async (newAction: PredictionAction) => {
    if (!selectedPrediction || selectedPrediction.action === newAction) return;

    setIsUpdatingAction(true);
    try {
      if (!token) {
        toast.error("Please log in to update action");
        setIsUpdatingAction(false);
        return;
      }

      const client = createClient(token);
      await client.prediction.updatePredictionAction({
        id: selectedPrediction.id,
        action: newAction,
      });

      toast.success(`Action updated`);

      // Update selectedPrediction immediately so the dialog reflects the change
      setSelectedPrediction({
        ...selectedPrediction,
        action: newAction,
      });

      // Reload dashboard data to refresh
      await loadDashboardData();
    } catch (error) {
      console.error("Failed to update action:", error);
      toast.error("Failed to update action");
    } finally {
      setIsUpdatingAction(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPrediction) return;
    setIsDeleting(true);
    try {
      if (!token) {
        toast.error("Please log in to delete predictions");
        setIsDeleting(false);
        return;
      }

      const client = createClient(token);
      await client.prediction.deletePrediction({ id: selectedPrediction.id });
      toast.success("Prediction deleted successfully");
      setDeleteDialogOpen(false);
      setPredictionDialogOpen(false);
      await loadDashboardData();
    } catch (error) {
      console.error("Failed to delete prediction:", error);
      toast.error("Failed to delete prediction");
    } finally {
      setIsDeleting(false);
    }
  };

  // Use centralized calculations - SINGLE SOURCE OF TRUTH
  const budget: BudgetCalculation = calculateBudget(allStrategies, allPredictions);
  const accountValue: AccountValueCalculation = calculateAccountValue(
    allStrategies,
    allPredictions,
    currentPrices,
    budget
  );
  const performance: PerformanceCalculation = calculatePerformance(allPredictions);

  // Format display values
  const hitRate = performance.hitRate.toFixed(1);
  const budgetRemaining = budget.remainingBudget;
  const budgetUtilization = budget.utilizationPct.toFixed(1);
  const totalExpectedReturn = allStrategies.reduce(
    (sum, s) => sum + (toNumber(s.monthlyBudget) * toNumber(s.targetReturnPct)) / 100,
    0
  );
  const avgReturn = performance.averageReturn;
  const totalRealizedReturns = performance.totalRealizedPl;

  // Find best performing prediction for display
  const closedPreds = allPredictions.filter(
    (p) =>
      p.status === PredictionStatus.HIT_TARGET ||
      p.status === PredictionStatus.HIT_STOP ||
      p.status === PredictionStatus.EXPIRED
  );
  const bestPrediction =
    closedPreds.length > 0
      ? closedPreds.reduce((best, p) => {
          const pReturn = toNumber(p.currentReturnPct ?? 0);
          const bestReturn = toNumber(best.currentReturnPct ?? 0);
          return pReturn > bestReturn ? p : best;
        })
      : null;
  const bestReturnPct = bestPrediction ? toNumber(bestPrediction.currentReturnPct ?? 0) : 0;

  const winLossRatio =
    performance.losses > 0
      ? performance.winLossRatio.toFixed(2)
      : performance.wins > 0
        ? "∞"
        : "0.00";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-6 max-w-7xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Dashboard</h1>
              <p className="text-sm text-gray-600">
                AI-powered stock trading strategies for automated investing
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/strategies"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                Manage Strategies
              </Link>
              <Link
                to="/help"
                className="inline-flex items-center gap-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
                title="Learn how values are calculated"
              >
                Help
              </Link>
              <Link
                to="/predictions"
                search={{ strategy: undefined, status: undefined, action: undefined }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                View Predictions
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Featured KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Account Value */}
          <div
            className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm"
            title={`Account Value calculation:\n- Active Positions Value = sum(entryCost * (1 + return%)) for entered & active\n- Total Account Value = Active Positions Value + Remaining Cash Budget`}
          >
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Account Value
            </div>
            <div className="text-3xl md:text-4xl font-extrabold text-gray-900">
              $
              {accountValue.totalAccountValue.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Unrealized:
              <span
                className={`ml-2 font-semibold ${
                  accountValue.totalUnrealizedPl >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {accountValue.totalUnrealizedPl >= 0 ? "+" : "-"}$
                {Math.abs(accountValue.totalUnrealizedPl).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>

          {/* Returns */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Return
            </div>
            <div
              className={`text-3xl md:text-4xl font-extrabold ${avgReturn >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {avgReturn >= 0 ? "+" : ""}
              {Number(avgReturn || 0).toFixed(2)}%
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Realized P/L:
              <span
                className={`ml-2 font-semibold ${totalRealizedReturns >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {totalRealizedReturns >= 0 ? "+" : "-"}$
                {Math.abs(Number(totalRealizedReturns || 0)).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <DashboardStats
          loading={loading}
          activeStrategiesCount={activeStrategiesCount}
          totalStrategiesCount={totalStrategiesCount}
          activePredictionsCount={activePredictionsCount}
          predictionsCount={predictionsCount}
          totalSpent={budget.totalSpent}
          totalBudget={budget.totalBudget}
          budgetUtilization={budgetUtilization}
          budgetRemaining={budgetRemaining}
          hitRate={hitRate}
          predictionStats={{
            hitTarget: predictionStats.hitTarget,
            hitStop: predictionStats.hitStop,
          }}
          totalExpectedReturn={totalExpectedReturn}
          activeReturns={accountValue.totalUnrealizedPl}
          totalPortfolioValue={accountValue.totalAccountValue}
        />

        {/* Main Content - Recent Predictions and Active Strategies Side by Side */}
        <div className="grid grid-cols-12 gap-6 mb-6">
          {/* Recent Predictions */}
          <div className="col-span-12 lg:col-span-6">
            <RecentPredictions
              loading={loading}
              recentPredictions={recentPredictions}
              currentPrices={currentPrices}
              allStrategies={allStrategies}
              onPredictionClick={openPredictionDialog}
            />
          </div>

          {/* Active Strategies */}
          <div className="col-span-12 lg:col-span-6">
            <ActiveStrategies
              activeStrategies={activeStrategies}
              predictionCounts={predictionCounts}
              triggeringStrategy={triggeringStrategy}
              onTriggerPredictions={handleTriggerPredictions}
            />
          </div>
        </div>

        {/* Performance & Metrics Section */}
        <div className="mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h3 className="text-base font-semibold text-gray-900 mb-4">Performance & Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {/* 1. Hit Rate (Win Rate) */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Hit Rate
                </div>
                <div className="text-2xl font-bold text-emerald-600">{hitRate}%</div>
                <div className="text-xs text-gray-600">
                  {performance.wins} of {performance.closedCount} closed
                </div>
              </div>

              {/* 2. Average Return */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Avg Return
                </div>
                <div
                  className={`text-2xl font-bold ${
                    avgReturn >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {avgReturn >= 0 ? "+" : ""}
                  {avgReturn.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-600">
                  {performance.closedCount > 0
                    ? `From ${performance.closedCount} closed predictions`
                    : "No closed predictions"}
                </div>
              </div>

              {/* 3. Total Realized Returns */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Realized Returns
                </div>
                <div
                  className={`text-2xl font-bold ${
                    totalRealizedReturns >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {totalRealizedReturns >= 0 ? "+" : ""}$
                  {Math.abs(totalRealizedReturns).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-gray-600">
                  {closedPreds.length > 0 ? "From all closed trades" : "No closed trades"}
                </div>
              </div>

              {/* 4. Win/Loss Ratio */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Win/Loss Ratio
                </div>
                <div className="text-2xl font-bold text-gray-900">{winLossRatio}</div>
                <div className="text-xs text-gray-600">
                  {performance.wins} wins / {performance.losses} losses
                </div>
              </div>

              {/* 5. Best Performance */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Best Return
                </div>
                {bestPrediction ? (
                  <>
                    <div className="text-2xl font-bold text-green-600">
                      {bestReturnPct >= 0 ? "+" : ""}
                      {bestReturnPct.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-600">{bestPrediction.symbol || "N/A"}</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-gray-400">—</div>
                    <div className="text-xs text-gray-500">No closed predictions</div>
                  </>
                )}
              </div>
            </div>

            {/* Additional Context Metrics */}
            {predictionStats.total > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Active Portfolio:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      $
                      {accountValue.activePositionsValue.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  {accountValue.totalUnrealizedPl !== 0 && (
                    <div>
                      <span className="text-gray-600">Unrealized:</span>
                      <span
                        className={`ml-2 font-semibold ${
                          accountValue.totalUnrealizedPl >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {accountValue.totalUnrealizedPl >= 0 ? "+" : ""}$
                        {Math.abs(accountValue.totalUnrealizedPl).toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600">Total Predictions:</span>
                    <span className="ml-2 font-semibold text-gray-900">
                      {predictionStats.total}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Expected Monthly:</span>
                    <span className="ml-2 font-semibold text-green-600">
                      $
                      {totalExpectedReturn.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Strategy Account Value Chart */}
        <div className="mb-6">
          <StrategyAccountValueChart
            strategies={allStrategies}
            predictions={allPredictions}
            currentPrices={currentPrices}
            loading={loading}
          />
        </div>
      </div>

      <DashboardPredictionDetailDialog
        open={predictionDialogOpen}
        onOpenChange={setPredictionDialogOpen}
        prediction={selectedPrediction}
        currentPrices={currentPrices}
        allStrategies={allStrategies}
        loadingPrices={loadingPrices}
        isUpdatingAction={isUpdatingAction}
        onActionChange={handleActionChange}
        onDeleteRequest={() => {
          setPredictionDialogOpen(false);
          setDeleteDialogOpen(true);
        }}
      />

      {selectedPrediction && (
        <DeletePredictionDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          prediction={selectedPrediction}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
