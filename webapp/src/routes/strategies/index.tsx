import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { predictionClient, strategyClient } from "@/lib/connect";
import { Link, createFileRoute } from "@tanstack/react-router";
import { BarChart3, Pause, Play, Plus, StopCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/strategies/")({
  component: StrategiesPage,
});

function StrategiesPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [predictionCounts, setPredictionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Load strategies on mount
  useEffect(() => {
    loadStrategies();
  }, []);

  async function loadStrategies() {
    try {
      const response = await strategyClient.listStrategies({});
      setStrategies(response.strategies);

      // Load prediction counts for each strategy
      const counts: Record<string, number> = {};
      for (const strategy of response.strategies) {
        try {
          const predictionsResponse = await predictionClient.listPredictions({
            strategyId: strategy.id,
          });
          counts[strategy.id] = predictionsResponse.predictions.length;
        } catch (error) {
          console.error(`Failed to load predictions for strategy ${strategy.id}:`, error);
          counts[strategy.id] = 0;
        }
      }
      setPredictionCounts(counts);
    } catch (error) {
      console.error("Failed to load strategies:", error);
      toast.error("Failed to load strategies");
    } finally {
      setLoading(false);
    }
  }

  async function startStrategy(id: string) {
    try {
      await strategyClient.startStrategy({ id });
      toast.success("Strategy started successfully");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to start strategy:", error);
      toast.error("Failed to start strategy");
    }
  }

  async function pauseStrategy(id: string) {
    try {
      await strategyClient.pauseStrategy({ id });
      toast.success("Strategy paused successfully");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to pause strategy:", error);
      toast.error("Failed to pause strategy");
    }
  }

  async function stopStrategy(id: string) {
    try {
      await strategyClient.stopStrategy({ id });
      toast.success("Strategy stopped successfully");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to stop strategy:", error);
      toast.error("Failed to stop strategy");
    }
  }

  function openDeleteDialog(id: string) {
    setStrategyToDelete(id);
    setDeleteDialogOpen(true);
  }

  async function deleteStrategy() {
    if (!strategyToDelete) return;

    setDeleting(true);
    try {
      await strategyClient.deleteStrategy({ id: strategyToDelete });
      toast.success("Strategy deleted successfully");
      setDeleteDialogOpen(false);
      setStrategyToDelete(null);
      await loadStrategies();
    } catch (error) {
      console.error("Failed to delete strategy:", error);
      toast.error("Failed to delete strategy");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading strategies...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Trading Strategies</h1>
        <a
          href="/strategies/new"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Create Strategy
        </a>
      </div>

      {strategies.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-xl font-semibold mb-2">No strategies yet</h3>
          <p className="text-gray-600 mb-6">Create your first trading strategy to get started</p>
          <a
            href="/strategies/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Your First Strategy
          </a>
        </div>
      ) : (
        <div className="grid gap-6">
          {strategies.map((strategy) => (
            <div
              key={strategy.id}
              className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold mb-2">{strategy.name}</h2>
                  {strategy.description && (
                    <p className="text-gray-600 mb-2">{strategy.description}</p>
                  )}
                  <div className="flex items-center gap-2">
                    <StatusBadge status={strategy.status} />
                    <span className="text-sm text-gray-600">
                      {predictionCounts[strategy.id] ?? 0} prediction
                      {predictionCounts[strategy.id] !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {(strategy.status === StrategyStatus.PAUSED ||
                    strategy.status === StrategyStatus.STOPPED) && (
                    <button
                      type="button"
                      onClick={() => startStrategy(strategy.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                      title={strategy.status === StrategyStatus.STOPPED ? "Restart" : "Start"}
                    >
                      <Play className="w-4 h-4" />
                      {strategy.status === StrategyStatus.STOPPED ? "Restart" : "Start"}
                    </button>
                  )}
                  {strategy.status === StrategyStatus.ACTIVE && (
                    <button
                      type="button"
                      onClick={() => pauseStrategy(strategy.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                      title="Pause"
                    >
                      <Pause className="w-4 h-4" />
                      Pause
                    </button>
                  )}
                  {strategy.status !== StrategyStatus.STOPPED && (
                    <button
                      type="button"
                      onClick={() => stopStrategy(strategy.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
                      title="Stop"
                    >
                      <StopCircle className="w-4 h-4" />
                      Stop
                    </button>
                  )}
                  {strategy.status === StrategyStatus.STOPPED && (
                    <button
                      type="button"
                      onClick={() => openDeleteDialog(strategy.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  )}
                  <Link
                    to="/predictions"
                    search={{ strategy: strategy.id, status: undefined }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    title="View Predictions"
                  >
                    <BarChart3 className="w-4 h-4" />
                    Predictions
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">Monthly Budget</div>
                  <div className="font-semibold">${strategy.monthlyBudget}</div>
                </div>
                <div>
                  <div className="text-gray-500">Spent This Month</div>
                  <div className="font-semibold">${strategy.currentMonthSpent}</div>
                </div>
                <div>
                  <div className="text-gray-500">Time Horizon</div>
                  <div className="font-semibold">{strategy.timeHorizon}</div>
                </div>
                <div>
                  <div className="text-gray-500">Target Return</div>
                  <div className="font-semibold">{strategy.targetReturnPct}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Strategy"
        description="Are you sure you want to delete this strategy? This action cannot be undone."
      >
        <DialogFooter>
          <DialogButton
            variant="outline"
            onClick={() => {
              setDeleteDialogOpen(false);
              setStrategyToDelete(null);
            }}
            disabled={deleting}
          >
            Cancel
          </DialogButton>
          <DialogButton variant="destructive" onClick={deleteStrategy} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete Strategy"}
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
