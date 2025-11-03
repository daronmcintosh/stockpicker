import { PredictionCard } from "@/components/prediction";
import { EditStrategyDialog, StatusBadge } from "@/components/strategy";
import type { EditFormData } from "@/components/strategy/EditStrategyDialog";
import { getFrequencyLabel, getRiskLevelLabel } from "@/components/strategy/strategyHelpers";
import { WorkflowRunsList } from "@/components/workflow/WorkflowRunsList";
import type { Prediction, Strategy, WorkflowRun } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionStatus, StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { fetchStockPrices } from "@/lib/stockPrice";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Edit, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

const SIDEBAR_VISIBILITY_KEY = "strategy_detail_sidebar_visible";

function useSidebarVisibility() {
  const [isVisible, setIsVisible] = useState(() => {
    // Check if we're in the browser before accessing localStorage
    if (typeof window === "undefined") {
      return true; // Default to visible on server
    }
    const stored = localStorage.getItem(SIDEBAR_VISIBILITY_KEY);
    return stored !== null ? stored === "true" : true; // Default to visible
  });

  const toggle = () => {
    const newValue = !isVisible;
    setIsVisible(newValue);
    // Only update localStorage in the browser
    if (typeof window !== "undefined") {
      localStorage.setItem(SIDEBAR_VISIBILITY_KEY, String(newValue));
    }
  };

  return [isVisible, toggle] as const;
}

export const Route = createFileRoute("/strategies/$strategyId")({
  component: StrategyDetailPage,
});

function StrategyDetailPage() {
  const { strategyId } = Route.useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [_sidebarVisible, _toggleSidebar] = useSidebarVisibility();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [predictionCount, setPredictionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingWorkflowRuns, setLoadingWorkflowRuns] = useState(false);
  const [loadingPredictions, setLoadingPredictions] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [updatingStrategy, setUpdatingStrategy] = useState(false);
  const [triggeringStrategy, setTriggeringStrategy] = useState(false);
  const [editingSourceConfig, setEditingSourceConfig] = useState<Awaited<
    ReturnType<typeof fetchSourceConfig>
  > | null>(null);

  useEffect(() => {
    if (strategyId && token) {
      loadStrategy();
    }
  }, [strategyId, token]);

  async function loadStrategy() {
    if (!strategyId || !token) return;
    setLoading(true);
    try {
      const client = createClient(token);
      const response = await client.strategy.getStrategy({ id: strategyId });
      if (response.strategy) {
        setStrategy(response.strategy);
        await loadPredictions(response.strategy.id);
        await loadPredictionCount(response.strategy.id);
        await loadWorkflowRuns(response.strategy.id);
      } else {
        toast.error("Strategy not found");
        navigate({ to: "/strategies" });
      }
    } catch (error) {
      console.error("Failed to load strategy:", error);
      toast.error("Failed to load strategy");
      navigate({ to: "/strategies" });
    } finally {
      setLoading(false);
    }
  }


  async function loadPredictions(id: string) {
    if (!id || !token) return;
    setLoadingPredictions(true);
    try {
      const client = createClient(token);
      const response = await client.prediction.listPredictions({
        strategyId: id,
      });
      const preds = response.predictions.sort((a, b) => {
        const aTime = a.createdAt?.seconds ? Number(a.createdAt.seconds) : 0;
        const bTime = b.createdAt?.seconds ? Number(b.createdAt.seconds) : 0;
        return bTime - aTime; // Most recent first
      });
      setPredictions(preds);
      setPredictionCount(response.predictions.length);

      // Fetch current prices for active predictions
      const activeSymbols = preds
        .filter((p) => p.status === PredictionStatus.ACTIVE)
        .map((p) => p.symbol)
        .filter(Boolean);
      if (activeSymbols.length > 0) {
        try {
          const prices = await fetchStockPrices(activeSymbols);
          setCurrentPrices(prices);
        } catch (error) {
          console.error("Failed to fetch stock prices:", error);
        }
      }
    } catch (error) {
      console.error("Failed to load predictions:", error);
      toast.error("Failed to load predictions");
    } finally {
      setLoadingPredictions(false);
    }
  }

  async function loadPredictionCount(_id: string) {
    // Count is now loaded as part of loadPredictions
    // This function kept for backward compatibility if needed elsewhere
  }

  async function loadWorkflowRuns(id: string) {
    if (!id || !token) return;
    setLoadingWorkflowRuns(true);
    try {
      const client = createClient(token);
      const response = await client.strategy.listWorkflowRuns({
        strategyId: id,
        limit: 50,
      });
      setWorkflowRuns(response.workflowRuns);
    } catch (error) {
      console.error("Failed to load workflow runs:", error);
      toast.error("Failed to load workflow runs");
    } finally {
      setLoadingWorkflowRuns(false);
    }
  }

  async function fetchSourceConfig(_strategyId: string) {
    // Fetch source_config from backend
    // Since it's not in the proto, we'll need to fetch it separately or extend the proto
    // For now, return null and use defaults
    // TODO: Add endpoint or extend getStrategy to return source_config
    return null;
  }

  async function openEditDialog(strategy: Strategy) {
    setEditingStrategy(strategy);
    setEditDialogOpen(true);
    setEditingSourceConfig(null);
  }

  async function handleUpdateStrategy(strategy: Strategy, formData: EditFormData) {
    if (!token) return;
    setUpdatingStrategy(true);
    try {
      const client = createClient(token);
      await client.strategy.updateStrategy({
        id: strategy.id,
        name: formData.name !== strategy.name ? formData.name : undefined,
        description:
          formData.description !== (strategy.description || "") ? formData.description : undefined,
        customPrompt:
          formData.customPrompt !== (strategy.customPrompt || "")
            ? formData.customPrompt
            : undefined,
        timeHorizon:
          formData.timeHorizon !== (strategy.timeHorizon || "3 months")
            ? formData.timeHorizon
            : undefined,
        targetReturnPct:
          Number.parseFloat(formData.targetReturnPct) !== strategy.targetReturnPct
            ? Number.parseFloat(formData.targetReturnPct)
            : undefined,
        riskLevel: formData.riskLevel !== strategy.riskLevel ? formData.riskLevel : undefined,
        maxUniqueStocks:
          Number.parseInt(formData.maxUniqueStocks) !== strategy.maxUniqueStocks
            ? Number.parseInt(formData.maxUniqueStocks)
            : undefined,
        sourceConfig: formData.sourceConfig ? JSON.stringify(formData.sourceConfig) : undefined,
      } as never);

      toast.success("Strategy updated successfully!");
      setEditDialogOpen(false);
      setEditingStrategy(null);
      await loadStrategy();
    } catch (error) {
      console.error("Failed to update strategy:", error);
      toast.error("Failed to update strategy");
    } finally {
      setUpdatingStrategy(false);
    }
  }

  async function triggerPredictions() {
    if (!token || !strategy) return;
    setTriggeringStrategy(true);
    try {
      const client = createClient(token);
      const response = await client.strategy.triggerPredictions({ id: strategy.id });
      if (response.success) {
        toast.success(response.message);
        // Reload strategy data to refresh predictions, count, and workflow runs
        await loadStrategy();
      } else {
        toast.error(response.message);
      }
    } catch (error) {
      console.error("Failed to trigger predictions:", error);
      toast.error("Failed to trigger predictions");
    } finally {
      setTriggeringStrategy(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-lg">Loading strategy...</div>
        </div>
      </div>
    );
  }

  if (!strategy) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-4 max-w-7xl">
          {/* Header with back button */}
          <div className="mb-4">
            <Link
              to="/strategies"
              className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Strategies
            </Link>
          </div>

          {/* Title and Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{strategy.name}</h1>
                <div className="flex items-center gap-3">
                  <StatusBadge status={strategy.status} />
                  <span className="text-sm text-gray-600">
                    {predictionCount} prediction{predictionCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-sm text-gray-400">?</span>
                  <span className="text-sm text-gray-600">
                    {strategy.createdAt
                      ? new Date(Number(strategy.createdAt.seconds) * 1000).toLocaleDateString()
                      : "Unknown date"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {strategy.status === StrategyStatus.ACTIVE && (
                <button
                  type="button"
                  onClick={triggerPredictions}
                  disabled={triggeringStrategy}
                  className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {triggeringStrategy ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Predictions
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => openEditDialog(strategy)}
                className="inline-flex items-center gap-2 bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="grid grid-cols-12 gap-6">
          {/* Main Content - Predictions and Workflow Runs */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* Predictions Section */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Predictions</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Stock predictions generated by this strategy
                  </p>
                </div>
                {predictionCount > 20 && (
                  <Link
                    to="/predictions"
                    search={{ strategy: strategy.id, status: undefined, action: undefined }}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View All ({predictionCount})
                  </Link>
                )}
              </div>
              <div className="p-6">
                {loadingPredictions ? (
                  <div className="text-sm text-gray-500 py-4">Loading predictions...</div>
                ) : predictions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p className="mb-2">No predictions yet</p>
                    <p className="text-sm">
                      {strategy.status === StrategyStatus.ACTIVE
                        ? "Click 'Generate Predictions' to create your first predictions"
                        : "Start the strategy and generate predictions to see them here"}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {predictions.slice(0, 10).map((prediction) => (
                      <PredictionCard
                        key={prediction.id}
                        prediction={prediction}
                        strategyName={strategy.name}
                        currentPrice={currentPrices[prediction.symbol]}
                        isLoadingPrice={false}
                      />
                    ))}
                    {predictions.length > 10 && (
                      <div className="text-center pt-4">
                        <Link
                          to="/predictions"
                          search={{ strategy: strategy.id, status: undefined, action: undefined }}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          View {predictions.length - 10} more predictions ?
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Workflow Runs Section */}
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Workflow Runs</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Execution history and results for this strategy
                </p>
              </div>
              <div className="p-6">
                <WorkflowRunsList workflowRuns={workflowRuns} loading={loadingWorkflowRuns} />
              </div>
            </div>

          </div>

          {/* Sidebar - Strategy Details */}
          <div className="col-span-12 lg:col-span-4">
            <div className="space-y-4">
              {/* Quick Stats */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Status</span>
                    <StatusBadge status={strategy.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Predictions</span>
                    <span className="text-sm font-semibold text-gray-900">{predictionCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Monthly Budget</span>
                    <span className="text-sm font-semibold text-gray-900">
                      $
                      {Number(strategy.monthlyBudget).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Spent This Month</span>
                    <span className="text-sm font-semibold text-gray-900">
                      $
                      {Number(strategy.currentMonthSpent).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div className="pt-3 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">Target Return</span>
                      <span className="text-sm font-semibold text-green-600">
                        {Number(strategy.targetReturnPct).toFixed(2)}%
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      $
                      {(
                        (Number(strategy.monthlyBudget) * Number(strategy.targetReturnPct)) /
                        100
                      ).toFixed(2)}{" "}
                      expected monthly
                    </div>
                  </div>
                </div>
              </div>

              {/* Strategy Configuration */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Configuration</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Time Horizon
                    </label>
                    <div className="text-sm text-gray-900">{strategy.timeHorizon}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Risk Level
                    </label>
                    <div className="text-sm text-gray-900">
                      {getRiskLevelLabel(strategy.riskLevel)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Frequency
                    </label>
                    <div className="text-sm text-gray-900">
                      {getFrequencyLabel(strategy.frequency)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Trades Per Month
                    </label>
                    <div className="text-sm text-gray-900">{strategy.tradesPerMonth}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Per Trade Budget
                    </label>
                    <div className="text-sm text-gray-900">
                      ${Number(strategy.perTradeBudget).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Per Stock Allocation
                    </label>
                    <div className="text-sm text-gray-900">
                      ${Number(strategy.perStockAllocation).toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Portfolio Size
                    </label>
                    <div className="text-sm text-gray-900">
                      {strategy.uniqueStocksCount} / {strategy.maxUniqueStocks} stocks
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Description</h3>
                {strategy.description ? (
                  <p className="text-sm text-gray-700 leading-relaxed">{strategy.description}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">No description provided</p>
                )}
              </div>

              {/* Custom Prompt */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Custom Prompt</h3>
                {strategy.customPrompt ? (
                  <div className="text-sm bg-gray-50 p-3 rounded border border-gray-200 max-h-48 overflow-y-auto text-gray-800 font-mono text-xs">
                    {strategy.customPrompt}
                  </div>
                ) : (
                  <div className="text-sm bg-gray-50 p-3 rounded border border-gray-200 text-gray-400 italic font-mono text-xs">
                    No custom prompt configured
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Metadata</h3>
                <div className="space-y-2 text-xs text-gray-600">
                  <div className="flex items-center justify-between">
                    <span>Created</span>
                    <span className="font-mono">
                      {strategy.createdAt
                        ? new Date(Number(strategy.createdAt.seconds) * 1000).toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Last Updated</span>
                    <span className="font-mono">
                      {strategy.updatedAt
                        ? new Date(Number(strategy.updatedAt.seconds) * 1000).toLocaleString()
                        : "N/A"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <EditStrategyDialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditDialogOpen(false);
            setEditingStrategy(null);
            setEditingSourceConfig(null);
          }
        }}
        strategy={editingStrategy}
        onUpdate={handleUpdateStrategy}
        updating={updatingStrategy}
        sourceConfig={editingSourceConfig || undefined}
      />
    </div>
  );
}
