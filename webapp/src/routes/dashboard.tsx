import {
  ActiveStrategies,
  DashboardPredictionDetailDialog,
  DashboardStats,
  PredictionPerformanceBreakdown,
  RecentPredictions,
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

  useEffect(() => {
    if (recentPredictions.length > 0) {
      const symbols = recentPredictions.map((p) => p.symbol).filter(Boolean);
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
  }, [recentPredictions]);

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

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">StockPicker Dashboard</h1>
        <p className="text-gray-600">AI-powered stock trading strategies for automated investing</p>
      </div>

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
      />

      <PredictionPerformanceBreakdown predictionStats={predictionStats} />

      <div className="grid gap-6 lg:grid-cols-3 mb-6">
        <RecentPredictions
          loading={loading}
          recentPredictions={recentPredictions}
          currentPrices={currentPrices}
          allStrategies={allStrategies}
          onPredictionClick={openPredictionDialog}
        />

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
              search={{ strategy: undefined, status: undefined, action: undefined }}
              className="inline-block bg-white text-green-600 px-4 py-2 rounded-lg font-semibold hover:bg-green-50 transition-colors text-sm"
            >
              View Predictions
            </Link>
          </div>
        </div>
      </div>

      <ActiveStrategies
        activeStrategies={activeStrategies}
        predictionCounts={predictionCounts}
        triggeringStrategy={triggeringStrategy}
        onTriggerPredictions={handleTriggerPredictions}
      />

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
