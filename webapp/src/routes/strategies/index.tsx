import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import {
  Frequency,
  RiskLevel,
  StrategyPrivacy,
  StrategyStatus,
} from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient, predictionClient, strategyClient } from "@/lib/connect";
import { Link, createFileRoute, useSearch } from "@tanstack/react-router";
import {
  BarChart3,
  Copy,
  Edit,
  Globe,
  Lock,
  Pause,
  Play,
  Plus,
  Share2,
  Sparkles,
  StopCircle,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/strategies/")({
  component: StrategiesPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      id: (search.id as string) || undefined,
    };
  },
});

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

function StrategiesPage() {
  const { id: strategyIdFromUrl } = useSearch({ from: "/strategies/" });
  const { token, isLoading: authLoading } = useAuth();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [predictionCounts, setPredictionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [triggeringStrategy, setTriggeringStrategy] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedStrategyForDetail, setSelectedStrategyForDetail] = useState<Strategy | null>(null);
  const [updatingPrivacy, setUpdatingPrivacy] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [updatingStrategy, setUpdatingStrategy] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: "",
    customPrompt: "",
    timeHorizon: "",
    targetReturnPct: "",
    riskLevel: RiskLevel.MEDIUM,
    maxUniqueStocks: "",
  });

  // Load strategies on mount, but wait for auth to finish loading
  useEffect(() => {
    if (!authLoading) {
      loadStrategies();
    }
  }, [authLoading]);

  // Open detail dialog if id is in URL
  useEffect(() => {
    if (strategyIdFromUrl && strategies.length > 0) {
      const strategy = strategies.find((s) => s.id === strategyIdFromUrl);
      if (strategy) {
        openDetailDialog(strategy);
      }
    }
  }, [strategyIdFromUrl, strategies]);

  async function loadStrategies() {
    try {
      if (!token) {
        toast.error("Please log in to view strategies");
        setLoading(false);
        return;
      }

      const client = createClient(token);
      const response = await client.strategy.listStrategies({});
      console.log(`[STRATEGIES PAGE] Loaded ${response.strategies.length} strategies`);
      setStrategies(response.strategies);

      // Load prediction counts for each strategy
      const counts: Record<string, number> = {};
      for (const strategy of response.strategies) {
        try {
          const predictionsResponse = await client.prediction.listPredictions({
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

  // Helper to get authenticated clients
  function getClients() {
    if (!token) {
      throw new Error("Authentication required");
    }
    return createClient(token);
  }

  async function startStrategy(id: string) {
    try {
      await getClients().strategy.startStrategy({ id });
      toast.success("Strategy started successfully");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to start strategy:", error);
      toast.error("Failed to start strategy");
    }
  }

  async function pauseStrategy(id: string) {
    try {
      await getClients().strategy.pauseStrategy({ id });
      toast.success("Strategy paused successfully");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to pause strategy:", error);
      toast.error("Failed to pause strategy");
    }
  }

  async function stopStrategy(id: string) {
    try {
      await getClients().strategy.stopStrategy({ id });
      toast.success("Strategy stopped successfully");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to stop strategy:", error);
      toast.error("Failed to stop strategy");
    }
  }

  async function handlePrivacyToggle(id: string, currentPrivacy: StrategyPrivacy) {
    setUpdatingPrivacy(id);
    try {
      const newPrivacy =
        currentPrivacy === StrategyPrivacy.PUBLIC
          ? StrategyPrivacy.PRIVATE
          : StrategyPrivacy.PUBLIC;
      await getClients().strategy.updateStrategyPrivacy({ id, privacy: newPrivacy });
      toast.success(
        `Strategy is now ${newPrivacy === StrategyPrivacy.PUBLIC ? "public" : "private"}`
      );
      await loadStrategies();
    } catch (error) {
      console.error("Failed to update strategy privacy:", error);
      toast.error("Failed to update strategy privacy");
    } finally {
      setUpdatingPrivacy(null);
    }
  }

  async function triggerPredictions(id: string) {
    setTriggeringStrategy(id);
    try {
      const response = await getClients().strategy.triggerPredictions({ id });
      if (response.success) {
        toast.success(response.message);
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

  async function copyStrategy(id: string) {
    try {
      const _response = await getClients().strategy.copyStrategy({ strategyId: id });
      toast.success("Strategy copied successfully!");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to copy strategy:", error);
      toast.error(error instanceof Error ? error.message : "Failed to copy strategy");
    }
  }

  async function shareStrategy(id: string, _name: string) {
    const url = `${window.location.origin}/strategies?id=${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast.error("Failed to copy link");
    }
  }

  function openDeleteDialog(id: string) {
    setStrategyToDelete(id);
    setDeleteDialogOpen(true);
  }

  function openDetailDialog(strategy: Strategy) {
    setSelectedStrategyForDetail(strategy);
    setDetailDialogOpen(true);
  }

  function closeDetailDialog() {
    setDetailDialogOpen(false);
    setSelectedStrategyForDetail(null);
    // Remove id from URL when closing
    if (strategyIdFromUrl) {
      window.history.replaceState({}, "", "/strategies");
    }
  }

  function openEditDialog(strategy: Strategy) {
    setEditingStrategy(strategy);
    setEditFormData({
      name: strategy.name,
      description: strategy.description || "",
      customPrompt: strategy.customPrompt || "",
      timeHorizon: strategy.timeHorizon || "3 months",
      targetReturnPct: strategy.targetReturnPct.toString(),
      riskLevel: strategy.riskLevel,
      maxUniqueStocks: strategy.maxUniqueStocks.toString(),
    });
    setEditDialogOpen(true);
  }

  async function handleUpdateStrategy() {
    if (!editingStrategy) return;

    setUpdatingStrategy(true);
    try {
      await getClients().strategy.updateStrategy({
        id: editingStrategy.id,
        name: editFormData.name !== editingStrategy.name ? editFormData.name : undefined,
        description:
          editFormData.description !== (editingStrategy.description || "")
            ? editFormData.description
            : undefined,
        customPrompt:
          editFormData.customPrompt !== (editingStrategy.customPrompt || "")
            ? editFormData.customPrompt
            : undefined,
        timeHorizon:
          editFormData.timeHorizon !== (editingStrategy.timeHorizon || "3 months")
            ? editFormData.timeHorizon
            : undefined,
        targetReturnPct:
          Number.parseFloat(editFormData.targetReturnPct) !== editingStrategy.targetReturnPct
            ? Number.parseFloat(editFormData.targetReturnPct)
            : undefined,
        riskLevel:
          editFormData.riskLevel !== editingStrategy.riskLevel ? editFormData.riskLevel : undefined,
        maxUniqueStocks:
          Number.parseInt(editFormData.maxUniqueStocks) !== editingStrategy.maxUniqueStocks
            ? Number.parseInt(editFormData.maxUniqueStocks)
            : undefined,
      });

      toast.success("Strategy updated successfully!");
      setEditDialogOpen(false);
      setEditingStrategy(null);
      await loadStrategies();
      // If detail dialog is open, refresh it too
      if (detailDialogOpen && selectedStrategyForDetail?.id === editingStrategy.id) {
        const updated = await getClients().strategy.getStrategy({ id: editingStrategy.id });
        setSelectedStrategyForDetail(updated.strategy || null);
      }
    } catch (error) {
      console.error("Failed to update strategy:", error);
      toast.error("Failed to update strategy");
    } finally {
      setUpdatingStrategy(false);
    }
  }

  async function deleteStrategy() {
    if (!strategyToDelete) return;

    setDeleting(true);
    try {
      await getClients().strategy.deleteStrategy({ id: strategyToDelete });
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

  // Show loading state while auth is loading or strategies are loading
  if (authLoading || loading) {
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
              className="bg-white border border-gray-200 rounded-lg px-5 py-3.5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
              onClick={() => openDetailDialog(strategy)}
            >
              <div className="flex items-center gap-6">
                {/* Name, Status, and Privacy */}
                <div className="flex items-center gap-3 min-w-[200px]">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900">{strategy.name}</h2>
                      <StatusBadge status={strategy.status} />
                    </div>
                    {strategy.description && (
                      <p className="text-sm text-gray-600 line-clamp-1">{strategy.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-600">
                        {predictionCounts[strategy.id] ?? 0} prediction
                        {predictionCounts[strategy.id] !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePrivacyToggle(strategy.id, strategy.privacy);
                        }}
                        disabled={updatingPrivacy === strategy.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
                          strategy.privacy === StrategyPrivacy.PUBLIC
                            ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                            : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                        }`}
                        title={
                          strategy.privacy === StrategyPrivacy.PUBLIC
                            ? "Public - Click to make private"
                            : "Private - Click to make public"
                        }
                      >
                        {updatingPrivacy === strategy.id ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600" />
                            Updating...
                          </>
                        ) : strategy.privacy === StrategyPrivacy.PUBLIC ? (
                          <>
                            <Globe className="w-3 h-3" />
                            Public
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3" />
                            Private
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Vertical Divider */}
                <div className="h-12 w-px bg-gray-200" />

                {/* Key Metrics */}
                <div className="flex items-center gap-8 flex-1">
                  <div className="min-w-[100px]">
                    <div className="text-xs text-gray-500 mb-0.5">Monthly Budget</div>
                    <div className="text-sm font-semibold text-gray-900">
                      $
                      {Number(strategy.monthlyBudget).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="min-w-[100px]">
                    <div className="text-xs text-gray-500 mb-0.5">Spent This Month</div>
                    <div className="text-sm font-semibold text-gray-900">
                      $
                      {Number(strategy.currentMonthSpent).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                  <div className="min-w-[90px]">
                    <div className="text-xs text-gray-500 mb-0.5">Time Horizon</div>
                    <div className="text-sm font-semibold text-gray-900">
                      {strategy.timeHorizon}
                    </div>
                  </div>
                  <div className="min-w-[90px]">
                    <div className="text-xs text-gray-500 mb-0.5">Target Return</div>
                    <div className="text-sm font-semibold text-green-600">
                      {Number(strategy.targetReturnPct).toFixed(2)}%
                    </div>
                  </div>
                </div>

                {/* Vertical Divider */}
                <div className="h-12 w-px bg-gray-200" />

                {/* Action Buttons - Compact Grouped Layout */}
                <div
                  className="flex items-center gap-1.5 bg-gray-50 rounded-lg p-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(strategy.status === StrategyStatus.PAUSED ||
                    strategy.status === StrategyStatus.STOPPED) && (
                    <button
                      type="button"
                      onClick={() => startStrategy(strategy.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-green-500 text-white hover:bg-green-600 transition-colors"
                      title={strategy.status === StrategyStatus.STOPPED ? "Restart" : "Start"}
                    >
                      <Play className="w-3.5 h-3.5" />
                      {strategy.status === StrategyStatus.STOPPED ? "Restart" : "Start"}
                    </button>
                  )}
                  {strategy.status === StrategyStatus.ACTIVE && (
                    <>
                      <button
                        type="button"
                        onClick={() => triggerPredictions(strategy.id)}
                        disabled={triggeringStrategy === strategy.id}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Generate Predictions"
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
                      <button
                        type="button"
                        onClick={() => pauseStrategy(strategy.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-yellow-500 text-white hover:bg-yellow-600 transition-colors"
                        title="Pause"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    </>
                  )}
                  {strategy.status !== StrategyStatus.STOPPED && (
                    <button
                      type="button"
                      onClick={() => stopStrategy(strategy.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                      title="Stop"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      Stop
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditDialog(strategy);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors"
                    title="Edit Strategy"
                  >
                    <Edit className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  {strategy.status === StrategyStatus.STOPPED && (
                    <button
                      type="button"
                      onClick={() => openDeleteDialog(strategy.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  )}
                  <Link
                    to="/predictions"
                    search={{ strategy: strategy.id, status: undefined, action: undefined }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                    title="View Predictions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    Predictions
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyStrategy(strategy.id);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                    title="Copy Strategy"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy
                  </button>
                  {strategy.privacy === StrategyPrivacy.PUBLIC && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        shareStrategy(strategy.id, strategy.name);
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors"
                      title="Share Strategy"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Share
                    </button>
                  )}
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

      <Dialog
        open={detailDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDetailDialog();
          } else {
            setDetailDialogOpen(true);
          }
        }}
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
          <DialogButton variant="outline" onClick={closeDetailDialog}>
            Close
          </DialogButton>
          <DialogButton
            onClick={() => {
              if (selectedStrategyForDetail) {
                openEditDialog(selectedStrategyForDetail);
                closeDetailDialog();
              }
            }}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </DialogButton>
        </DialogFooter>
      </Dialog>

      {/* Edit Strategy Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditDialogOpen(false);
            setEditingStrategy(null);
          }
        }}
        title="Edit Strategy"
        description={editingStrategy?.name || ""}
        size="lg"
      >
        <div className="space-y-6">
          {/* Basic Information */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Basic Information</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Strategy Name *
              </label>
              <input
                type="text"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={editFormData.description}
                onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </section>

          {/* Trading Configuration */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
              Trading Configuration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Time Horizon *
                </label>
                <select
                  value={editFormData.timeHorizon}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, timeHorizon: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="1 week">1 Week</option>
                  <option value="2 weeks">2 Weeks</option>
                  <option value="1 month">1 Month</option>
                  <option value="3 months">3 Months</option>
                  <option value="6 months">6 Months</option>
                  <option value="1 year">1 Year</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Return (%) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="0.5"
                  value={editFormData.targetReturnPct}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, targetReturnPct: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level *</label>
                <select
                  value={editFormData.riskLevel}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      riskLevel: Number(e.target.value) as RiskLevel,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={RiskLevel.LOW}>Low (Conservative)</option>
                  <option value={RiskLevel.MEDIUM}>Medium (Balanced)</option>
                  <option value={RiskLevel.HIGH}>High (Aggressive)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Unique Stocks *
                </label>
                <input
                  type="number"
                  min="3"
                  max="50"
                  value={editFormData.maxUniqueStocks}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, maxUniqueStocks: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </section>

          {/* Advanced Settings */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Advanced Settings</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom Analysis Prompt
              </label>
              <textarea
                value={editFormData.customPrompt}
                onChange={(e) => setEditFormData({ ...editFormData, customPrompt: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Focus on AI and cloud computing stocks, avoid recent IPOs, prefer companies with positive earnings"
              />
            </div>
          </section>
        </div>

        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setEditDialogOpen(false)}>
            Cancel
          </DialogButton>
          <DialogButton onClick={handleUpdateStrategy} disabled={updatingStrategy}>
            {updatingStrategy ? "Updating..." : "Update Strategy"}
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
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
