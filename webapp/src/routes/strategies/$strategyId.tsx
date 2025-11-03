import { EditStrategyDialog, StatusBadge } from "@/components/strategy";
import type { EditFormData } from "@/components/strategy/EditStrategyDialog";
import { getFrequencyLabel, getRiskLevelLabel } from "@/components/strategy/strategyHelpers";
import { WorkflowRunsList } from "@/components/workflow/WorkflowRunsList";
import type { Strategy, WorkflowRun } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Edit } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/strategies/$strategyId")({
  component: StrategyDetailPage,
});

function StrategyDetailPage() {
  const { strategyId } = Route.useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([]);
  const [predictionCount, setPredictionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingWorkflowRuns, setLoadingWorkflowRuns] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [updatingStrategy, setUpdatingStrategy] = useState(false);
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

  async function loadPredictionCount(id: string) {
    if (!token) return;
    try {
      const client = createClient(token);
      const response = await client.prediction.listPredictions({ strategyId: id });
      setPredictionCount(response.predictions.length);
    } catch (error) {
      console.error("Failed to load prediction count:", error);
      setPredictionCount(0);
    }
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
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Header with back button */}
      <div className="mb-6">
        <Link
          to="/strategies"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Strategies
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">{strategy.name}</h1>
            <div className="flex items-center gap-3">
              <StatusBadge status={strategy.status} />
              <span className="text-gray-600">{predictionCount} predictions</span>
            </div>
          </div>
          <button
            onClick={() => openEditDialog(strategy)}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Edit Strategy
          </button>
        </div>
      </div>

      {/* Strategy Details */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
              <StatusBadge status={strategy.status} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Predictions</label>
              <div className="text-lg font-semibold">{predictionCount}</div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
            <div className="text-sm">{strategy.description || "No description"}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Custom Prompt</label>
            <div className="text-sm bg-gray-50 p-3 rounded border border-gray-200 max-h-40 overflow-y-auto">
              {strategy.customPrompt || "No custom prompt"}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Monthly Budget</label>
              <div className="text-lg font-semibold">
                $
                {Number(strategy.monthlyBudget).toLocaleString("en-US", {
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
                {Number(strategy.currentMonthSpent).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Time Horizon</label>
              <div className="text-sm">{strategy.timeHorizon}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Target Return</label>
              <div className="text-sm">
                {Number(strategy.targetReturnPct).toFixed(2)}% ($
                {(
                  (Number(strategy.monthlyBudget) * Number(strategy.targetReturnPct)) /
                  100
                ).toFixed(2)}
                )
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Frequency</label>
              <div className="text-sm">{getFrequencyLabel(strategy.frequency)}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Risk Level</label>
              <div className="text-sm">{getRiskLevelLabel(strategy.riskLevel)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Trades Per Month
              </label>
              <div className="text-sm">{strategy.tradesPerMonth}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Per Trade Budget
              </label>
              <div className="text-sm">${Number(strategy.perTradeBudget).toFixed(2)}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Per Stock Allocation
              </label>
              <div className="text-sm">${Number(strategy.perStockAllocation).toFixed(2)}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Portfolio Size</label>
              <div className="text-sm">
                {strategy.uniqueStocksCount} / {strategy.maxUniqueStocks} stocks
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
              <div className="text-sm">
                {strategy.createdAt
                  ? new Date(Number(strategy.createdAt.seconds) * 1000).toLocaleString()
                  : "N/A"}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
              <div className="text-sm">
                {strategy.updatedAt
                  ? new Date(Number(strategy.updatedAt.seconds) * 1000).toLocaleString()
                  : "N/A"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Runs Section */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <label className="block text-lg font-semibold text-gray-900 mb-4">Workflow Runs</label>
        <WorkflowRunsList workflowRuns={workflowRuns} loading={loadingWorkflowRuns} />
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
