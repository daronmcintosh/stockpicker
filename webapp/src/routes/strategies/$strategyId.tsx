import { StrategyAccountValueChart } from "@/components/dashboard";
import { PredictionCard } from "@/components/prediction";
import { EditStrategyDialog, StatusBadge } from "@/components/strategy";
import type { EditFormData } from "@/components/strategy/EditStrategyDialog";
import { getFrequencyLabel, getRiskLevelLabel } from "@/components/strategy/strategyHelpers";
import { WorkflowRunsList } from "@/components/workflow/WorkflowRunsList";
import type { Prediction, Strategy, WorkflowRun } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionStatus, StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { getModelById } from "@/lib/aiModels";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { fetchStockPrices } from "@/lib/stockPrice";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Bot, ChevronDown, ChevronUp, Edit, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useEffect } from "react";
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

  // Parse AI models from strategy
  const enabledAIModels = useMemo(() => {
    if (!strategy?.aiAgents) return [];
    try {
      const modelIds = JSON.parse(strategy.aiAgents) as string[];
      return modelIds
        .map((id) => getModelById(id))
        .filter((model): model is NonNullable<typeof model> => model !== undefined);
    } catch {
      return [];
    }
  }, [strategy?.aiAgents]);
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
  const [configExpanded, setConfigExpanded] = useState(false);

  // Client-side pagination for Predictions
  const PRED_PAGE_SIZE = 5;
  const [predPage, setPredPage] = useState(1);
  const predTotal = predictions.length;
  const predTotalPages = Math.max(1, Math.ceil(predTotal / PRED_PAGE_SIZE));
  const pagedPredictions = useMemo(() => {
    const start = (predPage - 1) * PRED_PAGE_SIZE;
    return predictions.slice(start, start + PRED_PAGE_SIZE);
  }, [predictions, predPage]);

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
        {/* KPI Cards and Key Metadata at Top */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Status Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Status</div>
            <div className="flex items-center gap-2">
              <StatusBadge status={strategy.status} />
            </div>
          </div>

          {/* Predictions Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Total Predictions</div>
            <div className="text-2xl font-bold text-gray-900">{predictionCount}</div>
          </div>

          {/* Monthly Budget Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Monthly Budget</div>
            <div className="text-2xl font-bold text-gray-900">
              $
              {Number(strategy.monthlyBudget).toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Spent: $
              {Number(strategy.currentMonthSpent).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>

          {/* Target Return Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-1">Target Return</div>
            <div className="text-2xl font-bold text-green-600">
              {Number(strategy.targetReturnPct).toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              $
              {((Number(strategy.monthlyBudget) * Number(strategy.targetReturnPct)) / 100).toFixed(
                2
              )}{" "}
              expected
            </div>
          </div>
        </div>

        {/* Key Metadata Bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-1">Time Horizon</div>
              <div className="font-medium text-gray-900">{strategy.timeHorizon}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Risk Level</div>
              <div className="font-medium text-gray-900">
                {getRiskLevelLabel(strategy.riskLevel)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Frequency</div>
              <div className="font-medium text-gray-900">
                {getFrequencyLabel(strategy.frequency)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">AI Models</div>
              <div className="font-medium text-gray-900">{enabledAIModels.length}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Portfolio Size</div>
              <div className="font-medium text-gray-900">
                {strategy.uniqueStocksCount} / {strategy.maxUniqueStocks}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Per Stock</div>
              <div className="font-medium text-gray-900">
                ${Number(strategy.perStockAllocation).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Expandable Configuration */}
          <button
            type="button"
            onClick={() => setConfigExpanded(!configExpanded)}
            className="mt-4 w-full flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <span className="font-medium">View Full Configuration</span>
            {configExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {configExpanded && (
            <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* AI Models */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">AI Models</div>
                {enabledAIModels.length > 0 ? (
                  <div className="space-y-1">
                    {enabledAIModels.map((model) => (
                      <div key={model.id} className="flex items-center gap-2 text-xs text-gray-700">
                        <Bot className="w-3 h-3 text-purple-600" />
                        <span>{model.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No AI models configured</p>
                )}
              </div>

              {/* Budget Details */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Budget Details</div>
                <div className="space-y-1 text-xs text-gray-700">
                  <div>Predictions Per Month: {strategy.tradesPerMonth}</div>
                  <div>Per Prediction Budget: ${Number(strategy.perTradeBudget).toFixed(2)}</div>
                  <div>Per Stock Allocation: ${Number(strategy.perStockAllocation).toFixed(2)}</div>
                </div>
              </div>

              {/* Description & Custom Prompt */}
              <div className="sm:col-span-2 lg:col-span-1">
                {strategy.description && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">Description</div>
                    <p className="text-xs text-gray-700">{strategy.description}</p>
                  </div>
                )}
                {strategy.customPrompt && (
                  <div>
                    <div className="text-xs font-medium text-gray-500 mb-1">Custom Prompt</div>
                    <div className="text-xs text-gray-700 bg-gray-50 p-2 rounded border border-gray-200 font-mono max-h-24 overflow-y-auto">
                      {strategy.customPrompt}
                    </div>
                  </div>
                )}
              </div>

              {/* Metadata */}
              <div>
                <div className="text-xs font-medium text-gray-500 mb-2">Metadata</div>
                <div className="space-y-1 text-xs text-gray-600">
                  <div>
                    Created:{" "}
                    {strategy.createdAt
                      ? new Date(Number(strategy.createdAt.seconds) * 1000).toLocaleDateString()
                      : "N/A"}
                  </div>
                  <div>
                    Updated:{" "}
                    {strategy.updatedAt
                      ? new Date(Number(strategy.updatedAt.seconds) * 1000).toLocaleDateString()
                      : "N/A"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Strategy Account Value Chart */}
        <div className="mb-6">
          <StrategyAccountValueChart
            strategies={[strategy]}
            predictions={predictions}
            currentPrices={currentPrices}
            strategyId={strategy.id}
            title="Account Value Over Time"
            showLegend={false}
            showBreakdown={true}
            height={320}
          />
        </div>

        {/* Predictions and Workflow Runs Tables - Side by Side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Predictions Section */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Predictions</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Stock predictions generated by this strategy
                </p>
              </div>
              {predictionCount > 10 && (
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
                  {pagedPredictions.map((prediction) => (
                    <PredictionCard
                      key={prediction.id}
                      prediction={prediction}
                      strategyName={strategy.name}
                      currentPrice={currentPrices[prediction.symbol]}
                      isLoadingPrice={false}
                      onPrivacyChange={async () => {
                        // Reload strategy and predictions after privacy change, deletion, or action change
                        // This updates Quick Stats (budget, spent amounts) and prediction count
                        if (strategy.id) {
                          await loadStrategy(); // Reloads strategy with updated budget/spent
                          await loadPredictions(strategy.id);
                          await loadPredictionCount(strategy.id);
                        }
                      }}
                      strategyPrivacy={strategy.privacy}
                      isStrategyOwned={true}
                    />
                  ))}
                  {predTotal > PRED_PAGE_SIZE && (
                    <div className="pt-4 flex items-center justify-between text-sm">
                      <div className="text-gray-600">
                        Showing {(predPage - 1) * PRED_PAGE_SIZE + 1}-
                        {Math.min(predPage * PRED_PAGE_SIZE, predTotal)} of {predTotal}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPredPage((p) => Math.max(1, p - 1))}
                          disabled={predPage <= 1}
                          className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          Prev
                        </button>
                        <span className="text-gray-600">
                          Page {predPage} / {predTotalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPredPage((p) => Math.min(predTotalPages, p + 1))}
                          disabled={predPage >= predTotalPages}
                          className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                        >
                          Next
                        </button>
                      </div>
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
              <p className="text-sm text-gray-500 mt-1">Execution history and results</p>
            </div>
            <div className="p-6">
              <WorkflowRunsList workflowRuns={workflowRuns} loading={loadingWorkflowRuns} />
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
