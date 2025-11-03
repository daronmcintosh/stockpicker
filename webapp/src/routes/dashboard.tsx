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
  const [totalBudget, setTotalBudget] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);
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

  const closedPredictions = predictionStats.hitTarget + predictionStats.hitStop;
  const hitRate =
    closedPredictions > 0
      ? ((predictionStats.hitTarget / closedPredictions) * 100).toFixed(1)
      : "0.0";
  const budgetRemaining = totalBudget - totalSpent;
  const budgetUtilization = totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : "0.0";

  // Calculate additional metrics
  const totalExpectedReturn = allStrategies.reduce(
    (sum, s) => sum + (toNumber(s.monthlyBudget) * toNumber(s.targetReturnPct)) / 100,
    0
  );
  const averageHitRate =
    closedPredictions > 0
      ? ((predictionStats.hitTarget / closedPredictions) * 100).toFixed(1)
      : "0.0";
  const totalPortfolioValue = allPredictions
    .filter((p) => p.status === PredictionStatus.ACTIVE)
    .reduce((sum, p) => sum + toNumber(p.allocatedAmount), 0);
  const activeReturns = allPredictions
    .filter((p) => p.status === PredictionStatus.ACTIVE && currentPrices[p.symbol])
    .reduce((sum, p) => {
      const entry = toNumber(p.entryPrice);
      const current = currentPrices[p.symbol] ?? entry;
      const allocation = toNumber(p.allocatedAmount);
      const returnPct = (current - entry) / entry;
      return sum + allocation * returnPct;
    }, 0);

  // Calculate performance metrics from closed predictions
  const closedPreds = allPredictions.filter(
    (p) =>
      p.status === PredictionStatus.HIT_TARGET ||
      p.status === PredictionStatus.HIT_STOP ||
      p.status === PredictionStatus.EXPIRED
  );

  // Helper function to calculate return for a prediction
  const getPredictionReturn = (p: Prediction): number => {
    // Use stored currentReturnPct if available
    if (p.currentReturnPct !== undefined && p.currentReturnPct !== null) {
      return toNumber(p.currentReturnPct);
    }
    // Otherwise calculate from prices based on status
    const entry = toNumber(p.entryPrice);
    if (entry <= 0) return 0;

    let current = toNumber(p.currentPrice);
    if (!current || current === 0) {
      // Determine final price based on status
      if (p.status === PredictionStatus.HIT_TARGET) {
        current = toNumber(p.targetPrice);
      } else if (p.status === PredictionStatus.HIT_STOP) {
        current = toNumber(p.stopLossPrice);
      } else {
        current = entry; // EXPIRED - no gain/loss
      }
    }
    return ((current - entry) / entry) * 100;
  };

  // Average Return % (from closed predictions)
  const avgReturn =
    closedPreds.length > 0
      ? closedPreds.reduce((sum, p) => sum + getPredictionReturn(p), 0) / closedPreds.length
      : 0;

  // Total Realized Returns ($)
  const totalRealizedReturns = closedPreds.reduce((sum, p) => {
    const allocation = toNumber(p.allocatedAmount);
    const returnPct = getPredictionReturn(p) / 100; // Convert % to decimal
    return sum + allocation * returnPct;
  }, 0);

  // Best performing prediction (highest return %)
  const bestPrediction =
    closedPreds.length > 0
      ? closedPreds.reduce((best, p) => {
          const pReturn = getPredictionReturn(p);
          const bestReturn = getPredictionReturn(best);
          return pReturn > bestReturn ? p : best;
        })
      : null;
  const bestReturnPct = bestPrediction ? getPredictionReturn(bestPrediction) : 0;

  // Win/Loss Ratio
  const losses = predictionStats.hitStop + predictionStats.expired;
  const winLossRatio =
    losses > 0
      ? (predictionStats.hitTarget / losses).toFixed(2)
      : predictionStats.hitTarget > 0
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
        {/* Stats Grid */}
        <DashboardStats
          loading={loading}
          activeStrategiesCount={activeStrategiesCount}
          totalStrategiesCount={totalStrategiesCount}
          activePredictionsCount={activePredictionsCount}
          predictionsCount={predictionsCount}
          totalSpent={totalSpent}
          totalBudget={totalBudget}
          budgetUtilization={budgetUtilization}
          budgetRemaining={budgetRemaining}
          hitRate={hitRate}
          predictionStats={{
            hitTarget: predictionStats.hitTarget,
            hitStop: predictionStats.hitStop,
          }}
          totalExpectedReturn={totalExpectedReturn}
          activeReturns={activeReturns}
          totalPortfolioValue={totalPortfolioValue}
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
                <div className="text-2xl font-bold text-emerald-600">{averageHitRate}%</div>
                <div className="text-xs text-gray-600">
                  {predictionStats.hitTarget} of {closedPredictions} closed
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
                  {closedPreds.length > 0
                    ? `From ${closedPreds.length} closed predictions`
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
                  {predictionStats.hitTarget} wins / {losses} losses
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
                      {totalPortfolioValue.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  {activeReturns !== 0 && (
                    <div>
                      <span className="text-gray-600">Unrealized:</span>
                      <span
                        className={`ml-2 font-semibold ${
                          activeReturns >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {activeReturns >= 0 ? "+" : ""}$
                        {Math.abs(activeReturns).toLocaleString("en-US", {
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
