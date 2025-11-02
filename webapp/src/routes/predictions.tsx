import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import {
  PredictionAction,
  PredictionPrivacy,
  PredictionSource,
  PredictionStatus,
  RiskLevel,
  StrategyPrivacy,
} from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { fetchStockPrices } from "@/lib/stockPrice";
import { Link, createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Bot,
  CheckCircle2,
  Copy,
  Edit,
  Globe,
  Lock,
  Pencil,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

// Helper to determine prediction source
function getPredictionSource(prediction: Prediction): "AI" | "Manual" {
  const source = prediction.source;
  if (source === PredictionSource.MANUAL) return "Manual";
  if (source === PredictionSource.AI) return "AI";
  // Fallback: try to detect from technical analysis content
  if (
    prediction.technicalAnalysis &&
    prediction.technicalAnalysis !== "Manual prediction" &&
    prediction.technicalAnalysis.length > 50
  ) {
    return "Manual";
  }
  return "AI"; // Default to AI for now
}

// Helper to safely convert BigInt or number to number (for protobuf numeric fields)
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

export const Route = createFileRoute("/predictions")({
  component: PredictionsPage,
  validateSearch: (search: Record<string, unknown>) => {
    return {
      strategy: (search.strategy as string) || undefined,
      status: search.status ? (Number(search.status) as PredictionStatus) : undefined,
      action: search.action ? (Number(search.action) as PredictionAction) : undefined,
    };
  },
});

function PredictionsPage() {
  const { token, isLoading: authLoading } = useAuth();
  const navigate = useNavigate({ from: "/predictions" });
  const {
    strategy: strategyFromUrl,
    status: statusFromUrl,
    action: actionFromUrl,
  } = useSearch({
    from: "/predictions",
  });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  // Default to "all" unless there's a strategy in the URL
  const [selectedStrategy, setSelectedStrategy] = useState<string>(strategyFromUrl || "all");
  const [strategies, setStrategies] = useState<
    Array<{ id: string; name: string; privacy?: StrategyPrivacy }>
  >([]);
  const [statusFilter, setStatusFilter] = useState<PredictionStatus | "all">(
    statusFromUrl || "all"
  );
  const [actionFilter, setActionFilter] = useState<PredictionAction | "all">(
    actionFromUrl || "all"
  );
  const [triggeringStrategy, setTriggeringStrategy] = useState<string | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [dialogStrategy, setDialogStrategy] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [formData, setFormData] = useState({
    symbol: "",
    entryPrice: "",
    targetPrice: "",
    stopLossPrice: "",
    allocatedAmount: "",
    sentimentScore: "5",
    overallScore: "5",
    technicalAnalysis: "",
  });
  const [currentStockPrice, setCurrentStockPrice] = useState<number | null>(null);
  const [loadingStockPrice, setLoadingStockPrice] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPrediction, setEditingPrediction] = useState<Prediction | null>(null);
  const [updatingPrediction, setUpdatingPrediction] = useState(false);
  const [editFormData, setEditFormData] = useState({
    symbol: "",
    entryPrice: "",
    targetPrice: "",
    stopLossPrice: "",
    allocatedAmount: "",
    sentimentScore: "",
    overallScore: "",
    technicalAnalysis: "",
    timeHorizonDays: "",
    riskLevel: RiskLevel.MEDIUM,
  });
  const [editCurrentStockPrice, setEditCurrentStockPrice] = useState<number | null>(null);
  const [loadingEditStockPrice, setLoadingEditStockPrice] = useState(false);

  // Initialize filters from URL params
  useEffect(() => {
    if (strategyFromUrl) {
      setSelectedStrategy(strategyFromUrl);
    } else {
      // If no strategy in URL, default to "all"
      setSelectedStrategy("all");
    }
    if (statusFromUrl) {
      setStatusFilter(statusFromUrl);
    }
    if (actionFromUrl) {
      setActionFilter(actionFromUrl);
    }
  }, [strategyFromUrl, statusFromUrl, actionFromUrl]);

  // Load strategies and predictions on mount and when filters change
  const loadData = useCallback(async () => {
    if (!token) {
      if (!authLoading) {
        toast.error("Please log in to view predictions");
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = createClient(token);
      // Load strategies
      const strategiesResponse = await client.strategy.listStrategies({});
      const strategiesList = strategiesResponse.strategies.map((s) => ({
        id: s.id,
        name: s.name,
        privacy: s.privacy,
      }));
      setStrategies(strategiesList);

      const strategyToUse = selectedStrategy;

      // Load predictions
      if (strategyToUse === "all") {
        // Fetch predictions for all strategies
        const allPredictions: Prediction[] = [];
        for (const strategy of strategiesList) {
          try {
            const response = await client.prediction.listPredictions({
              strategyId: strategy.id,
              status: statusFilter !== "all" ? statusFilter : undefined,
            });
            allPredictions.push(...response.predictions);
          } catch (error) {
            console.error(`Failed to load predictions for strategy ${strategy.id}:`, error);
          }
        }
        // Sort by created date (newest first)
        allPredictions.sort((a, b) => {
          const aTime = a.createdAt?.seconds ? Number(a.createdAt.seconds) : 0;
          const bTime = b.createdAt?.seconds ? Number(b.createdAt.seconds) : 0;
          return bTime - aTime;
        });
        // Filter by action if needed (client-side)
        let filteredPredictions = allPredictions;
        if (actionFilter !== "all") {
          filteredPredictions = allPredictions.filter((p) => p.action === actionFilter);
        }
        setPredictions(filteredPredictions);
      } else {
        // Fetch predictions for a specific strategy
        const response = await client.prediction.listPredictions({
          strategyId: strategyToUse,
          status: statusFilter !== "all" ? statusFilter : undefined,
        });
        // Filter by action if needed (client-side)
        let filteredPredictions = response.predictions;
        if (actionFilter !== "all") {
          filteredPredictions = response.predictions.filter((p) => p.action === actionFilter);
        }
        setPredictions(filteredPredictions);
      }
    } catch (error) {
      console.error("Failed to load predictions:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedStrategy, statusFilter, actionFilter, token, authLoading]);

  useEffect(() => {
    if (!authLoading) {
      loadData();
    }
  }, [loadData, authLoading]);

  // Fetch current stock price when symbol changes
  useEffect(() => {
    const symbol = formData.symbol.trim().toUpperCase();
    if (symbol && symbol.length >= 1 && symbol.length <= 5) {
      // Debounce the API call
      const timeoutId = setTimeout(async () => {
        setLoadingStockPrice(true);
        try {
          const prices = await fetchStockPrices([symbol]);
          if (prices[symbol]) {
            setCurrentStockPrice(prices[symbol]);
          } else {
            setCurrentStockPrice(null);
          }
        } catch (error) {
          console.error("Failed to fetch stock price:", error);
          setCurrentStockPrice(null);
        } finally {
          setLoadingStockPrice(false);
        }
      }, 500); // Wait 500ms after user stops typing

      return () => clearTimeout(timeoutId);
    }
    setCurrentStockPrice(null);
  }, [formData.symbol]);

  // Fetch current prices when predictions change
  useEffect(() => {
    if (predictions.length > 0) {
      const symbols = predictions.map((p) => p.symbol).filter(Boolean);
      if (symbols.length > 0) {
        setLoadingPrices(true);
        fetchStockPrices(symbols)
          .then((prices) => {
            setCurrentPrices(prices);
            setLoadingPrices(false);
          })
          .catch((error) => {
            console.error("Failed to fetch stock prices:", error);
            setLoadingPrices(false);
          });
      }
    }
  }, [predictions]);

  // Fetch current stock price when editing symbol changes
  useEffect(() => {
    const symbol = editFormData.symbol.trim().toUpperCase();
    if (symbol && symbol.length >= 1 && symbol.length <= 5 && editDialogOpen) {
      // Debounce the API call
      const timeoutId = setTimeout(async () => {
        setLoadingEditStockPrice(true);
        try {
          const prices = await fetchStockPrices([symbol]);
          if (prices[symbol]) {
            setEditCurrentStockPrice(prices[symbol]);
          } else {
            setEditCurrentStockPrice(null);
          }
        } catch (error) {
          console.error("Failed to fetch stock price:", error);
          setEditCurrentStockPrice(null);
        } finally {
          setLoadingEditStockPrice(false);
        }
      }, 500); // Wait 500ms after user stops typing

      return () => clearTimeout(timeoutId);
    }
    setEditCurrentStockPrice(null);
  }, [editFormData.symbol, editDialogOpen]);

  async function handleTriggerPredictions(strategyId?: string) {
    const strategyToTrigger = strategyId || dialogStrategy;
    if (!strategyToTrigger || strategyToTrigger === "all") {
      toast.error("Please select a specific strategy to generate predictions");
      return;
    }

    if (!token) {
      toast.error("Please log in to trigger predictions");
      return;
    }

    setTriggeringStrategy(strategyToTrigger);
    try {
      const client = createClient(token);
      const response = await client.strategy.triggerPredictions({ id: strategyToTrigger });
      if (response.success) {
        toast.success(response.message);
        setGenerateDialogOpen(false); // Close dialog on success
        // Reload predictions after a short delay to allow n8n workflow to complete
        setTimeout(() => {
          loadData();
        }, 3000);
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

  async function handleCreatePrediction() {
    const strategyToUse = dialogStrategy || selectedStrategy;
    if (strategyToUse === "all" || !strategyToUse) {
      toast.error("Please select a specific strategy");
      return;
    }

    // Validation
    if (
      !formData.symbol ||
      !formData.entryPrice ||
      !formData.targetPrice ||
      !formData.stopLossPrice ||
      !formData.allocatedAmount
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!token) {
      toast.error("Please log in to create predictions");
      return;
    }

    setCreating(true);
    try {
      const client = createClient(token);
      await client.prediction.createPrediction({
        strategyId: strategyToUse,
        symbol: formData.symbol.toUpperCase(),
        entryPrice: Number.parseFloat(formData.entryPrice),
        targetPrice: Number.parseFloat(formData.targetPrice),
        stopLossPrice: Number.parseFloat(formData.stopLossPrice),
        allocatedAmount: Number.parseFloat(formData.allocatedAmount),
        sentimentScore: Number.parseFloat(formData.sentimentScore),
        overallScore: Number.parseFloat(formData.overallScore),
        technicalAnalysis: formData.technicalAnalysis || "Manual prediction",
        source: PredictionSource.MANUAL,
      });

      toast.success("Prediction created successfully!");
      setCreateDialogOpen(false);
      setFormData({
        symbol: "",
        entryPrice: "",
        targetPrice: "",
        stopLossPrice: "",
        allocatedAmount: "",
        sentimentScore: "5",
        overallScore: "5",
        technicalAnalysis: "",
      });
      setCurrentStockPrice(null);
      loadData();
    } catch (error) {
      console.error("Failed to create prediction:", error);
      toast.error("Failed to create prediction");
    } finally {
      setCreating(false);
    }
  }

  function openEditDialog(prediction: Prediction) {
    setEditingPrediction(prediction);
    setEditFormData({
      symbol: prediction.symbol || "",
      entryPrice: toNumber(prediction.entryPrice).toFixed(2),
      targetPrice: toNumber(prediction.targetPrice).toFixed(2),
      stopLossPrice: toNumber(prediction.stopLossPrice).toFixed(2),
      allocatedAmount: toNumber(prediction.allocatedAmount).toFixed(2),
      sentimentScore: toNumber(prediction.sentimentScore).toFixed(1),
      overallScore: toNumber(prediction.overallScore).toFixed(1),
      technicalAnalysis: prediction.technicalAnalysis || "",
      timeHorizonDays: prediction.timeHorizonDays ? String(prediction.timeHorizonDays) : "",
      riskLevel: prediction.riskLevel || RiskLevel.MEDIUM,
    });
    setEditDialogOpen(true);
  }

  async function handleUpdatePrediction() {
    if (!editingPrediction) return;

    if (
      !editFormData.symbol ||
      !editFormData.entryPrice ||
      !editFormData.targetPrice ||
      !editFormData.stopLossPrice ||
      !editFormData.allocatedAmount
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    setUpdatingPrediction(true);
    try {
      // Note: updatePrediction RPC is currently commented out in the service
      // until the proto files are regenerated. This will need to be uncommented
      // and the service regenerated before this will work.
      toast.error(
        "Update prediction feature is temporarily disabled. Please regenerate proto files."
      );
      // await predictionClient.updatePrediction({
      //   id: editingPrediction.id,
      //   symbol: editFormData.symbol.toUpperCase(),
      //   entryPrice: Number.parseFloat(editFormData.entryPrice),
      //   targetPrice: Number.parseFloat(editFormData.targetPrice),
      //   stopLossPrice: Number.parseFloat(editFormData.stopLossPrice),
      //   allocatedAmount: Number.parseFloat(editFormData.allocatedAmount),
      //   sentimentScore: editFormData.sentimentScore ? Number.parseFloat(editFormData.sentimentScore) : undefined,
      //   overallScore: editFormData.overallScore ? Number.parseFloat(editFormData.overallScore) : undefined,
      //   technicalAnalysis: editFormData.technicalAnalysis || undefined,
      //   timeHorizonDays: editFormData.timeHorizonDays ? Number.parseInt(editFormData.timeHorizonDays) : undefined,
      //   riskLevel: editFormData.riskLevel !== RiskLevel.MEDIUM ? editFormData.riskLevel : undefined,
      // } as any);

      // setEditDialogOpen(false);
      // setEditingPrediction(null);
      // loadData();
      // toast.success("Prediction updated successfully!");
    } catch (error) {
      console.error("Failed to update prediction:", error);
      toast.error("Failed to update prediction");
    } finally {
      setUpdatingPrediction(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-lg">Loading predictions...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Stock Predictions</h1>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              const strategyToUse = selectedStrategy === "all" ? "" : selectedStrategy;
              setDialogStrategy(strategyToUse);
              setCreateDialogOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            title="Create a new prediction"
          >
            <Plus className="w-5 h-5" />
            Create Prediction
          </button>
          <button
            type="button"
            onClick={() => {
              if (selectedStrategy !== "all") {
                handleTriggerPredictions(selectedStrategy);
              } else {
                setDialogStrategy("");
                setGenerateDialogOpen(true);
              }
            }}
            disabled={triggeringStrategy !== null}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Generate predictions"
          >
            {triggeringStrategy ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Generate Predictions
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters - Compact Horizontal Layout */}
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-6 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-medium text-gray-700 whitespace-nowrap">Filters:</span>

          <select
            id="strategy-filter"
            value={selectedStrategy}
            onChange={(e) => {
              const value = e.target.value;
              setSelectedStrategy(value);
              navigate({
                search: {
                  strategy: value === "all" ? undefined : value,
                  status: statusFilter === "all" ? undefined : statusFilter,
                  action: actionFilter === "all" ? undefined : actionFilter,
                },
                replace: true,
              });
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">All Strategies</option>
            {strategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.name}
              </option>
            ))}
          </select>

          <select
            id="status-filter"
            value={statusFilter === "all" ? "all" : statusFilter}
            onChange={(e) => {
              const value =
                e.target.value === "all" ? "all" : (Number(e.target.value) as PredictionStatus);
              setStatusFilter(value);
              navigate({
                search: {
                  strategy: selectedStrategy === "all" ? undefined : selectedStrategy,
                  status: value === "all" ? undefined : value,
                  action: actionFilter === "all" ? undefined : actionFilter,
                },
                replace: true,
              });
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">All Statuses</option>
            <option value={PredictionStatus.ACTIVE}>Active</option>
            <option value={PredictionStatus.HIT_TARGET}>Hit Target</option>
            <option value={PredictionStatus.HIT_STOP}>Hit Stop</option>
            <option value={PredictionStatus.EXPIRED}>Expired</option>
          </select>

          <select
            id="action-filter"
            value={actionFilter === "all" ? "all" : actionFilter}
            onChange={(e) => {
              const value =
                e.target.value === "all" ? "all" : (Number(e.target.value) as PredictionAction);
              setActionFilter(value);
              navigate({
                search: {
                  strategy: selectedStrategy === "all" ? undefined : selectedStrategy,
                  status: statusFilter === "all" ? undefined : statusFilter,
                  action: value === "all" ? undefined : value,
                },
                replace: true,
              });
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
          >
            <option value="all">All Actions</option>
            <option value={PredictionAction.PENDING}>Pending</option>
            <option value={PredictionAction.ENTERED}>Entered</option>
            <option value={PredictionAction.DISMISSED}>Dismissed</option>
          </select>
        </div>
      </div>

      {predictions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-xl font-semibold mb-2">No predictions found</h3>
          <p className="text-gray-600">
            {selectedStrategy === "all"
              ? "Create and start a strategy to generate predictions"
              : "This strategy hasn't generated any predictions yet"}
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {predictions.map((prediction) => {
            const strategy = strategies.find((s) => s.id === prediction.strategyId);
            // Strategy is "owned" if it's in the user's strategies list (since there's no user system)
            const isStrategyOwned = !!strategy;
            return (
              <PredictionCard
                key={prediction.id}
                prediction={prediction}
                onPrivacyChange={loadData}
                strategyName={strategy?.name}
                strategyPrivacy={strategy?.privacy}
                isStrategyOwned={isStrategyOwned}
                currentPrice={currentPrices[prediction.symbol]}
                isLoadingPrice={loadingPrices}
                onEdit={openEditDialog}
                strategies={strategies}
              />
            );
          })}
        </div>
      )}

      {/* Create Prediction Dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        title={
          <div className="flex items-center gap-2">
            <span>Create Manual Prediction</span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800">
              <Pencil className="w-3 h-3" />
              Manual
            </span>
          </div>
        }
        description="Manually add a stock prediction to your strategy"
        size="lg"
      >
        <div className="space-y-6">
          {/* Strategy Selector - only show if coming from "All Strategies" */}
          {selectedStrategy === "all" && (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Strategy</h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Strategy *
                </label>
                <select
                  value={dialogStrategy}
                  onChange={(e) => setDialogStrategy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="" disabled>
                    -- Select a strategy --
                  </option>
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </section>
          )}

          {/* Section 1: Stock & Entry */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Stock & Entry</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Symbol *</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) =>
                    setFormData({ ...formData, symbol: e.target.value.toUpperCase() })
                  }
                  placeholder="AAPL"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {loadingStockPrice && (
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                    Loading...
                  </div>
                )}
                {!loadingStockPrice && currentStockPrice !== null && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-xs text-blue-600 font-medium">Current:</span>
                    <span className="text-sm font-semibold text-blue-900">
                      ${currentStockPrice.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, entryPrice: currentStockPrice.toFixed(2) });
                      }}
                      className="ml-2 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      title="Use current price as entry price"
                    >
                      Use
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entry Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.entryPrice}
                  onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
                  placeholder={currentStockPrice ? currentStockPrice.toFixed(2) : "150.00"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {currentStockPrice && formData.entryPrice && (
                  <p className="text-xs mt-1">
                    {(() => {
                      const entry = Number.parseFloat(formData.entryPrice);
                      const diff = entry - currentStockPrice;
                      const diffPct = (diff / currentStockPrice) * 100;
                      if (Math.abs(diff) < 0.01) {
                        return <span className="text-gray-500">Matches current price</span>;
                      }
                      return (
                        <span className={diff > 0 ? "text-red-600" : "text-green-600"}>
                          {diff > 0 ? "+" : ""}
                          {diffPct.toFixed(2)}% vs current ({diff > 0 ? "above" : "below"})
                        </span>
                      );
                    })()}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allocated Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.allocatedAmount}
                  onChange={(e) => setFormData({ ...formData, allocatedAmount: e.target.value })}
                  placeholder="1000.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {formData.entryPrice && formData.allocatedAmount && (
                  <p className="text-xs text-gray-500 mt-1">
                    Shares:{" "}
                    {(
                      Number.parseFloat(formData.allocatedAmount) /
                      Number.parseFloat(formData.entryPrice)
                    ).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 2: Price Targets */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Price Targets</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.targetPrice}
                  onChange={(e) => setFormData({ ...formData, targetPrice: e.target.value })}
                  placeholder="165.00"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formData.entryPrice &&
                    formData.targetPrice &&
                    Number.parseFloat(formData.targetPrice) <=
                      Number.parseFloat(formData.entryPrice)
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
                {formData.entryPrice && formData.targetPrice && (
                  <p
                    className={`text-xs mt-1 ${
                      Number.parseFloat(formData.targetPrice) >
                      Number.parseFloat(formData.entryPrice)
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {Number.parseFloat(formData.targetPrice) >
                    Number.parseFloat(formData.entryPrice)
                      ? `+${(
                          ((Number.parseFloat(formData.targetPrice) -
                            Number.parseFloat(formData.entryPrice)) /
                            Number.parseFloat(formData.entryPrice)) *
                            100
                        ).toFixed(2)}% gain`
                      : "Target must be higher than entry"}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stop Loss Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.stopLossPrice}
                  onChange={(e) => setFormData({ ...formData, stopLossPrice: e.target.value })}
                  placeholder="145.00"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    formData.entryPrice &&
                    formData.stopLossPrice &&
                    Number.parseFloat(formData.stopLossPrice) >=
                      Number.parseFloat(formData.entryPrice)
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
                {formData.entryPrice && formData.stopLossPrice && (
                  <p
                    className={`text-xs mt-1 ${
                      Number.parseFloat(formData.stopLossPrice) <
                      Number.parseFloat(formData.entryPrice)
                        ? "text-red-600"
                        : "text-red-600"
                    }`}
                  >
                    {Number.parseFloat(formData.stopLossPrice) <
                    Number.parseFloat(formData.entryPrice)
                      ? `-${(
                          ((Number.parseFloat(formData.entryPrice) -
                            Number.parseFloat(formData.stopLossPrice)) /
                            Number.parseFloat(formData.entryPrice)) *
                            100
                        ).toFixed(2)}% loss`
                      : "Stop loss must be lower than entry"}
                  </p>
                )}
              </div>
            </div>

            {/* Real-time Risk/Reward Calculation */}
            {formData.entryPrice &&
              formData.targetPrice &&
              formData.stopLossPrice &&
              Number.parseFloat(formData.targetPrice) > Number.parseFloat(formData.entryPrice) &&
              Number.parseFloat(formData.stopLossPrice) <
                Number.parseFloat(formData.entryPrice) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-900 mb-1">Risk/Reward Ratio</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {(
                      (Number.parseFloat(formData.targetPrice) -
                        Number.parseFloat(formData.entryPrice)) /
                      (Number.parseFloat(formData.entryPrice) -
                        Number.parseFloat(formData.stopLossPrice))
                    ).toFixed(2)}
                    :1
                  </p>
                </div>
              )}
          </section>

          {/* Section 3: Analysis */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Analysis</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sentiment Score (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={formData.sentimentScore}
                  onChange={(e) => setFormData({ ...formData, sentimentScore: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Overall Score (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={formData.overallScore}
                  onChange={(e) => setFormData({ ...formData, overallScore: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Analysis Notes *
              </label>
              <textarea
                value={formData.technicalAnalysis}
                onChange={(e) => setFormData({ ...formData, technicalAnalysis: e.target.value })}
                placeholder="Enter your research, charts reviewed, indicators, etc."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Document your analysis, key indicators, and reasoning for this prediction
              </p>
            </div>
          </section>
        </div>

        <DialogFooter>
          <DialogButton
            variant="outline"
            onClick={() => {
              setCreateDialogOpen(false);
              setCurrentStockPrice(null);
            }}
          >
            Cancel
          </DialogButton>
          <DialogButton onClick={handleCreatePrediction} disabled={creating}>
            {creating ? "Creating..." : "Create Prediction"}
          </DialogButton>
        </DialogFooter>
      </Dialog>

      {/* Generate Predictions Dialog */}
      <Dialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        title="Generate Predictions"
        description="Select a strategy to generate AI-powered predictions for."
      >
        <div className="space-y-4 pt-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Strategy *</label>
            <select
              value={dialogStrategy}
              onChange={(e) => setDialogStrategy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="" disabled>
                -- Select a strategy --
              </option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setGenerateDialogOpen(false)}>
            Cancel
          </DialogButton>
          <DialogButton
            onClick={() => handleTriggerPredictions()}
            disabled={!dialogStrategy || triggeringStrategy !== null}
          >
            {triggeringStrategy ? "Generating..." : "Generate"}
          </DialogButton>
        </DialogFooter>
      </Dialog>

      {/* Edit Prediction Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditDialogOpen(false);
            setEditingPrediction(null);
            setEditCurrentStockPrice(null);
          }
        }}
        title={
          <div className="flex items-center gap-2">
            <span>Edit Prediction</span>
            {editingPrediction && getPredictionSource(editingPrediction) === "Manual" && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800">
                <Pencil className="w-3 h-3" />
                Manual
              </span>
            )}
          </div>
        }
        description={`Editing ${editingPrediction?.symbol || ""} prediction`}
        size="lg"
      >
        <div className="space-y-6">
          {/* Section 1: Stock & Entry */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Stock & Entry</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Symbol *</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editFormData.symbol}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, symbol: e.target.value.toUpperCase() })
                  }
                  placeholder="AAPL"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {loadingEditStockPrice && (
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                    Loading...
                  </div>
                )}
                {!loadingEditStockPrice && editCurrentStockPrice !== null && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <span className="text-xs text-blue-600 font-medium">Current:</span>
                    <span className="text-sm font-semibold text-blue-900">
                      ${editCurrentStockPrice.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditFormData({
                          ...editFormData,
                          entryPrice: editCurrentStockPrice.toFixed(2),
                        });
                      }}
                      className="ml-2 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      title="Use current price as entry price"
                    >
                      Use
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entry Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.entryPrice}
                  onChange={(e) => setEditFormData({ ...editFormData, entryPrice: e.target.value })}
                  placeholder={editCurrentStockPrice ? editCurrentStockPrice.toFixed(2) : "150.00"}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {editCurrentStockPrice && editFormData.entryPrice && (
                  <p className="text-xs mt-1">
                    {(() => {
                      const entry = Number.parseFloat(editFormData.entryPrice);
                      const diff = entry - editCurrentStockPrice;
                      const diffPct = (diff / editCurrentStockPrice) * 100;
                      if (Math.abs(diff) < 0.01) {
                        return <span className="text-gray-500">Matches current price</span>;
                      }
                      return (
                        <span className={diff > 0 ? "text-red-600" : "text-green-600"}>
                          {diff > 0 ? "+" : ""}
                          {diffPct.toFixed(2)}% vs current ({diff > 0 ? "above" : "below"})
                        </span>
                      );
                    })()}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allocated Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.allocatedAmount}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, allocatedAmount: e.target.value })
                  }
                  placeholder="1000.00"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {editFormData.entryPrice && editFormData.allocatedAmount && (
                  <p className="text-xs text-gray-500 mt-1">
                    Shares:{" "}
                    {(
                      Number.parseFloat(editFormData.allocatedAmount) /
                      Number.parseFloat(editFormData.entryPrice)
                    ).toFixed(2)}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section 2: Price Targets */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Price Targets</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Target Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.targetPrice}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, targetPrice: e.target.value })
                  }
                  placeholder="165.00"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    editFormData.entryPrice &&
                    editFormData.targetPrice &&
                    Number.parseFloat(editFormData.targetPrice) <=
                      Number.parseFloat(editFormData.entryPrice)
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
                {editFormData.entryPrice && editFormData.targetPrice && (
                  <p
                    className={`text-xs mt-1 ${
                      Number.parseFloat(editFormData.targetPrice) >
                      Number.parseFloat(editFormData.entryPrice)
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {Number.parseFloat(editFormData.targetPrice) >
                    Number.parseFloat(editFormData.entryPrice)
                      ? `+${(
                          ((Number.parseFloat(editFormData.targetPrice) -
                            Number.parseFloat(editFormData.entryPrice)) /
                            Number.parseFloat(editFormData.entryPrice)) *
                            100
                        ).toFixed(2)}% gain`
                      : "Target must be higher than entry"}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stop Loss Price *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editFormData.stopLossPrice}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, stopLossPrice: e.target.value })
                  }
                  placeholder="145.00"
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    editFormData.entryPrice &&
                    editFormData.stopLossPrice &&
                    Number.parseFloat(editFormData.stopLossPrice) >=
                      Number.parseFloat(editFormData.entryPrice)
                      ? "border-red-300 bg-red-50"
                      : "border-gray-300"
                  }`}
                />
                {editFormData.entryPrice && editFormData.stopLossPrice && (
                  <p
                    className={`text-xs mt-1 ${
                      Number.parseFloat(editFormData.stopLossPrice) <
                      Number.parseFloat(editFormData.entryPrice)
                        ? "text-red-600"
                        : "text-red-600"
                    }`}
                  >
                    {Number.parseFloat(editFormData.stopLossPrice) <
                    Number.parseFloat(editFormData.entryPrice)
                      ? `-${(
                          ((Number.parseFloat(editFormData.entryPrice) -
                            Number.parseFloat(editFormData.stopLossPrice)) /
                            Number.parseFloat(editFormData.entryPrice)) *
                            100
                        ).toFixed(2)}% loss`
                      : "Stop loss must be lower than entry"}
                  </p>
                )}
              </div>
            </div>

            {/* Real-time Risk/Reward Calculation */}
            {editFormData.entryPrice &&
              editFormData.targetPrice &&
              editFormData.stopLossPrice &&
              Number.parseFloat(editFormData.targetPrice) >
                Number.parseFloat(editFormData.entryPrice) &&
              Number.parseFloat(editFormData.stopLossPrice) <
                Number.parseFloat(editFormData.entryPrice) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-blue-900 mb-1">Risk/Reward Ratio</p>
                  <p className="text-lg font-semibold text-blue-900">
                    {(
                      (Number.parseFloat(editFormData.targetPrice) -
                        Number.parseFloat(editFormData.entryPrice)) /
                      (Number.parseFloat(editFormData.entryPrice) -
                        Number.parseFloat(editFormData.stopLossPrice))
                    ).toFixed(2)}
                    :1
                  </p>
                </div>
              )}
          </section>

          {/* Section 3: Analysis */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Analysis</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sentiment Score (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={editFormData.sentimentScore}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, sentimentScore: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Overall Score (1-10)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  step="0.1"
                  value={editFormData.overallScore}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, overallScore: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Technical Analysis Notes *
              </label>
              <textarea
                value={editFormData.technicalAnalysis}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, technicalAnalysis: e.target.value })
                }
                placeholder="Enter your research, charts reviewed, indicators, etc."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </section>
        </div>

        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setEditDialogOpen(false)}>
            Cancel
          </DialogButton>
          <DialogButton onClick={handleUpdatePrediction} disabled={updatingPrediction}>
            {updatingPrediction ? "Updating..." : "Update Prediction"}
          </DialogButton>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function PredictionCard({
  prediction,
  onPrivacyChange,
  strategyName,
  strategyPrivacy,
  isStrategyOwned,
  currentPrice,
  isLoadingPrice,
  onEdit,
  strategies,
}: {
  prediction: Prediction;
  onPrivacyChange?: () => void;
  strategyName?: string;
  strategyPrivacy?: StrategyPrivacy;
  isStrategyOwned?: boolean;
  currentPrice?: number;
  isLoadingPrice?: boolean;
  onEdit?: (prediction: Prediction) => void;
  strategies?: Array<{ id: string; name: string }>;
}) {
  const { token } = useAuth();
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isUpdatingAction, setIsUpdatingAction] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyTargetStrategy, setCopyTargetStrategy] = useState("");
  const [isCopying, setIsCopying] = useState(false);
  // Convert all numeric fields to ensure no BigInt values
  const entryPrice = toNumber(prediction.entryPrice);
  const targetPrice = toNumber(prediction.targetPrice);
  const stopLossPrice = toNumber(prediction.stopLossPrice);
  // Use fetched current price if available, otherwise fall back to stored price or entry price
  const displayCurrentPrice =
    currentPrice !== undefined
      ? currentPrice
      : toNumber(prediction.currentPrice ?? prediction.entryPrice);
  // Calculate current return based on fetched price if available
  const currentReturn =
    currentPrice !== undefined
      ? ((currentPrice - entryPrice) / entryPrice) * 100
      : toNumber(prediction.currentReturnPct ?? 0);
  const targetReturn = toNumber(prediction.targetReturnPct);
  const allocatedAmount = toNumber(prediction.allocatedAmount);
  const sentimentScore = toNumber(prediction.sentimentScore);
  const overallScore = toNumber(prediction.overallScore);
  const stopLossDollarImpact = toNumber(prediction.stopLossDollarImpact);
  const stopLossPct = toNumber(prediction.stopLossPct);

  const getStatusColor = (status: PredictionStatus) => {
    switch (status) {
      case PredictionStatus.ACTIVE:
        return "bg-blue-100 text-blue-800";
      case PredictionStatus.HIT_TARGET:
        return "bg-green-100 text-green-800";
      case PredictionStatus.HIT_STOP:
        return "bg-red-100 text-red-800";
      case PredictionStatus.EXPIRED:
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: PredictionStatus) => {
    switch (status) {
      case PredictionStatus.ACTIVE:
        return "Active";
      case PredictionStatus.HIT_TARGET:
        return "Hit Target";
      case PredictionStatus.HIT_STOP:
        return "Hit Stop Loss";
      case PredictionStatus.EXPIRED:
        return "Expired";
      default:
        return "Unknown";
    }
  };

  // Unused function - kept for potential future use
  // const _getActionColor = (action: PredictionAction) => {
  //   switch (action) {
  //     case PredictionAction.PENDING:
  //       return "bg-yellow-100 text-yellow-800";
  //     case PredictionAction.ENTERED:
  //       return "bg-green-100 text-green-800";
  //     case PredictionAction.DISMISSED:
  //       return "bg-gray-100 text-gray-800";
  //     default:
  //       return "bg-gray-100 text-gray-800";
  //   }
  // };

  const getActionLabel = (action: PredictionAction) => {
    switch (action) {
      case PredictionAction.PENDING:
        return "Pending";
      case PredictionAction.ENTERED:
        return "Entered";
      case PredictionAction.DISMISSED:
        return "Dismissed";
      default:
        return "Unspecified";
    }
  };

  const handlePrivacyToggle = async () => {
    setIsUpdatingPrivacy(true);
    try {
      if (!token) {
        toast.error("Please log in to update privacy");
        setIsUpdatingPrivacy(false);
        return;
      }

      const client = createClient(token);
      const newPrivacy =
        prediction.privacy === PredictionPrivacy.PUBLIC
          ? PredictionPrivacy.PRIVATE
          : PredictionPrivacy.PUBLIC;

      await client.prediction.updatePredictionPrivacy({
        id: prediction.id,
        privacy: newPrivacy,
      });

      toast.success(
        `Prediction is now ${newPrivacy === PredictionPrivacy.PUBLIC ? "public" : "private"}`
      );

      if (onPrivacyChange) {
        onPrivacyChange();
      }
    } catch (error) {
      console.error("Failed to update privacy:", error);
      toast.error("Failed to update privacy setting");
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const handleActionChange = async (newAction: PredictionAction) => {
    if (prediction.action === newAction) return;

    setIsUpdatingAction(true);
    try {
      if (!token) {
        toast.error("Please log in to update action");
        setIsUpdatingAction(false);
        return;
      }

      const client = createClient(token);
      await client.prediction.updatePredictionAction({
        id: prediction.id,
        action: newAction,
      });

      toast.success(`Action changed to ${getActionLabel(newAction)}`);

      if (onPrivacyChange) {
        onPrivacyChange();
      }
    } catch (error) {
      console.error("Failed to update action:", error);
      toast.error("Failed to update action");
    } finally {
      setIsUpdatingAction(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      if (!token) {
        toast.error("Please log in to delete predictions");
        setIsDeleting(false);
        return;
      }

      const client = createClient(token);
      await client.prediction.deletePrediction({ id: prediction.id });
      toast.success("Prediction deleted successfully");
      setDeleteDialogOpen(false);
      if (onPrivacyChange) {
        onPrivacyChange();
      }
    } catch (error) {
      console.error("Failed to delete prediction:", error);
      toast.error("Failed to delete prediction");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyPrediction = async () => {
    if (!copyTargetStrategy) {
      toast.error("Please select a target strategy");
      return;
    }

    setIsCopying(true);
    try {
      if (!token) {
        toast.error("Please log in to copy predictions");
        setIsCopying(false);
        return;
      }

      const client = createClient(token);
      await client.prediction.copyPrediction({
        predictionId: prediction.id,
        strategyId: copyTargetStrategy,
      });
      toast.success("Prediction copied successfully!");
      setCopyDialogOpen(false);
      setCopyTargetStrategy("");
      if (onPrivacyChange) {
        onPrivacyChange();
      }
    } catch (error) {
      console.error("Failed to copy prediction:", error);
      toast.error(error instanceof Error ? error.message : "Failed to copy prediction");
    } finally {
      setIsCopying(false);
    }
  };

  const handleSharePrediction = async () => {
    const url = `${window.location.origin}/predictions?strategy=${prediction.strategyId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast.error("Failed to copy link");
    }
  };

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg px-5 py-3.5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
      onClick={() => !detailDialogOpen && setDetailDialogOpen(true)}
    >
      <div className="flex items-center gap-6">
        {/* Symbol and Status */}
        <div className="flex items-center gap-3 min-w-[140px]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-900">{prediction.symbol}</h2>
              {(() => {
                const source = getPredictionSource(prediction);
                return (
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                      source === "AI"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-100 text-blue-700"
                    }`}
                    title={source === "AI" ? "AI Generated" : "Manual Prediction"}
                  >
                    {source === "AI" ? <Bot className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                  </span>
                );
              })()}
            </div>
            {strategyName &&
              prediction.strategyId &&
              (strategyPrivacy === StrategyPrivacy.PUBLIC || isStrategyOwned) && (
                <Link
                  to="/strategies"
                  search={{ id: prediction.strategyId }}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-gray-600 hover:text-blue-600 transition-colors flex items-center gap-1 w-fit"
                >
                  <TrendingUp className="w-3 h-3" />
                  {strategyName}
                </Link>
              )}
            {strategyName &&
              prediction.strategyId &&
              strategyPrivacy === StrategyPrivacy.PRIVATE &&
              !isStrategyOwned && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  Private Strategy
                </span>
              )}
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(prediction.status)}`}
          >
            {getStatusLabel(prediction.status)}
          </span>
        </div>

        {/* Vertical Divider */}
        <div className="h-10 w-px bg-gray-200" />

        {/* Key Price Metrics */}
        <div className="flex items-center gap-8 flex-1">
          <div className="min-w-[85px]">
            <div className="text-xs text-gray-500 mb-0.5">Entry</div>
            <div className="text-sm font-semibold text-gray-900">
              $
              {entryPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div className="min-w-[85px]">
            <div className="text-xs text-gray-500 mb-0.5">Current</div>
            <div className="text-sm font-semibold text-blue-600">
              {isLoadingPrice ? (
                <span className="text-gray-400">Loading...</span>
              ) : (
                `$${displayCurrentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
          </div>
          <div className="min-w-[85px]">
            <div className="text-xs text-gray-500 mb-0.5">Target</div>
            <div className="text-sm font-semibold text-green-600">
              $
              {targetPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div className="min-w-[100px]">
            <div className="text-xs text-gray-500 mb-0.5">Return</div>
            <div
              className={`text-sm font-bold flex items-center gap-1 ${
                currentReturn >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {currentReturn >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {currentReturn.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* Vertical Divider */}
        <div className="h-10 w-px bg-gray-200" />

        {/* Action Buttons - Better Visual Distinction */}
        <div
          className="flex items-center gap-1.5 bg-gray-50 rounded-lg p-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleActionChange(PredictionAction.PENDING)}
            disabled={isUpdatingAction || prediction.action === PredictionAction.PENDING}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
              prediction.action === PredictionAction.PENDING
                ? "bg-yellow-500 text-white shadow-lg font-bold border-2 border-yellow-600 ring-2 ring-yellow-400 ring-offset-1 scale-105"
                : "text-yellow-700 hover:bg-yellow-100 border border-transparent"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Mark as Pending"
          >
            Pending
          </button>
          <button
            type="button"
            onClick={() => handleActionChange(PredictionAction.ENTERED)}
            disabled={isUpdatingAction || prediction.action === PredictionAction.ENTERED}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              prediction.action === PredictionAction.ENTERED
                ? "bg-green-600 text-white shadow-lg font-bold border-2 border-green-700 ring-2 ring-green-400 ring-offset-1 scale-105"
                : "text-green-700 hover:bg-green-100 border border-transparent"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Mark as Entered"
          >
            <CheckCircle2 className="w-3 h-3" />
            Entered
          </button>
          <button
            type="button"
            onClick={() => handleActionChange(PredictionAction.DISMISSED)}
            disabled={isUpdatingAction || prediction.action === PredictionAction.DISMISSED}
            className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-all ${
              prediction.action === PredictionAction.DISMISSED
                ? "bg-gray-600 text-white shadow-lg font-bold border-2 border-gray-700 ring-2 ring-gray-400 ring-offset-1 scale-105"
                : "text-gray-700 hover:bg-gray-100 border border-transparent"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Mark as Dismissed"
          >
            <XCircle className="w-3 h-3" />
            Dismissed
          </button>
        </div>

        {/* Privacy Toggle - More Prominent */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handlePrivacyToggle();
          }}
          disabled={isUpdatingPrivacy}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors border text-xs font-medium ${
            prediction.privacy === PredictionPrivacy.PUBLIC
              ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          title={
            prediction.privacy === PredictionPrivacy.PUBLIC
              ? "Public - Click to make private"
              : "Private - Click to make public"
          }
        >
          {prediction.privacy === PredictionPrivacy.PUBLIC ? (
            <>
              <Globe className="w-3.5 h-3.5" />
              Public
            </>
          ) : (
            <>
              <Lock className="w-3.5 h-3.5" />
              Private
            </>
          )}
        </button>

        {/* Copy & Share Buttons - Only for public predictions */}
        {prediction.privacy === PredictionPrivacy.PUBLIC && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCopyDialogOpen(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs font-medium"
              title="Copy prediction to another strategy"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSharePrediction();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors border bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 text-xs font-medium"
              title="Share prediction link"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share
            </button>
          </>
        )}
        {/* Delete Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDeleteDialogOpen(true);
          }}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors border bg-red-50 text-red-700 border-red-200 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
          title="Delete prediction"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>

      <Dialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        title={
          <div className="flex items-center gap-2">
            <span>{prediction.symbol} - Prediction Details</span>
            {(() => {
              const source = getPredictionSource(prediction);
              return (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold ${
                    source === "AI" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {source === "AI" ? (
                    <>
                      <Bot className="w-3 h-3" />
                      AI Generated
                    </>
                  ) : (
                    <>
                      <Pencil className="w-3 h-3" />
                      Manual
                    </>
                  )}
                </span>
              );
            })()}
          </div>
        }
        description={`Created ${new Date(Number(prediction.createdAt?.seconds) * 1000).toLocaleDateString()}`}
        size="lg"
      >
        <div className="space-y-6">
          {/* Header Section with Status, Privacy, Action Buttons */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(prediction.status)}`}
                >
                  {getStatusLabel(prediction.status)}
                </span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Privacy</label>
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                    prediction.privacy === PredictionPrivacy.PUBLIC
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  {prediction.privacy === PredictionPrivacy.PUBLIC ? "Public" : "Private"}
                </span>
              </div>
              {strategyName && prediction.strategyId && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Strategy</label>
                  {strategyPrivacy === StrategyPrivacy.PUBLIC || isStrategyOwned ? (
                    <Link
                      to="/strategies"
                      search={{ id: prediction.strategyId }}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <TrendingUp className="w-3 h-3" />
                      {strategyName}
                    </Link>
                  ) : (
                    <div className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Lock className="w-3 h-3" />
                      Private
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleActionChange(PredictionAction.PENDING)}
                disabled={isUpdatingAction || prediction.action === PredictionAction.PENDING}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  prediction.action === PredictionAction.PENDING
                    ? "bg-yellow-500 text-white shadow-lg font-bold border-2 border-yellow-600 ring-2 ring-yellow-400 ring-offset-1 scale-105"
                    : "bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-transparent"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => handleActionChange(PredictionAction.ENTERED)}
                disabled={isUpdatingAction || prediction.action === PredictionAction.ENTERED}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  prediction.action === PredictionAction.ENTERED
                    ? "bg-green-600 text-white shadow-lg font-bold border-2 border-green-700 ring-2 ring-green-400 ring-offset-1 scale-105"
                    : "bg-green-50 text-green-700 hover:bg-green-100 border border-transparent"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <CheckCircle2 className="w-3 h-3" />
                Entered
              </button>
              <button
                type="button"
                onClick={() => handleActionChange(PredictionAction.DISMISSED)}
                disabled={isUpdatingAction || prediction.action === PredictionAction.DISMISSED}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  prediction.action === PredictionAction.DISMISSED
                    ? "bg-gray-600 text-white shadow-lg font-bold border-2 border-gray-700 ring-2 ring-gray-400 ring-offset-1 scale-105"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-transparent"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <XCircle className="w-3 h-3" />
                Dismissed
              </button>
            </div>
          </div>

          {/* Price Levels */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Price Levels</h4>
            <div className="space-y-2">
              {/* Target Zone */}
              <div className="flex items-center justify-between bg-green-50 border-l-4 border-green-500 p-3 rounded">
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
                  <div className="text-xs text-gray-600">Potential Gain</div>
                  <div className="text-sm font-semibold text-green-700">
                    +$
                    {((targetPrice - entryPrice) * (allocatedAmount / entryPrice)).toLocaleString(
                      "en-US",
                      { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                    )}{" "}
                    ({targetReturn.toFixed(2)}%)
                  </div>
                </div>
              </div>

              {/* Entry Zone */}
              <div className="flex items-center justify-between bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded">
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
                      isLoadingPrice
                        ? "text-gray-400"
                        : currentReturn >= 0
                          ? "text-green-600"
                          : "text-red-600"
                    }`}
                  >
                    {isLoadingPrice
                      ? "Loading..."
                      : `$${displayCurrentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </div>
                  {!isLoadingPrice && (
                    <div
                      className={`text-xs ${currentReturn >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {currentReturn >= 0 ? "+" : ""}
                      {currentReturn.toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>

              {/* Stop Loss Zone */}
              <div className="flex items-center justify-between bg-red-50 border-l-4 border-red-500 p-3 rounded">
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
                  <div className="text-xs text-gray-600">Potential Loss</div>
                  <div className="text-sm font-semibold text-red-700">
                    -$
                    {stopLossDollarImpact.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    ({stopLossPct.toFixed(2)}%)
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Position & Scores */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-3">Position</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-blue-600">Shares:</span>
                  <span className="font-semibold text-blue-900">
                    {(allocatedAmount / entryPrice).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-blue-600">Allocated:</span>
                  <span className="font-semibold text-blue-900">
                    $
                    {allocatedAmount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Scores</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Sentiment:</span>
                  <span className="font-semibold text-gray-900">
                    {sentimentScore.toFixed(1)} / 10
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Overall:</span>
                  <span className="font-semibold text-gray-900">
                    {overallScore.toFixed(1)} / 10
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Analysis Notes */}
          {prediction.technicalAnalysis &&
            (() => {
              const source = getPredictionSource(prediction);
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {source === "Manual" ? "Analysis Notes" : "Technical Analysis"}
                  </label>
                  <div
                    className={`text-sm p-3 rounded border max-h-40 overflow-y-auto whitespace-pre-wrap ${
                      source === "Manual"
                        ? "bg-blue-50 border-blue-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    {prediction.technicalAnalysis}
                  </div>
                </div>
              );
            })()}
        </div>

        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setDetailDialogOpen(false)}>
            Close
          </DialogButton>
          <DialogButton
            onClick={() => {
              if (prediction && onEdit) {
                onEdit(prediction);
                setDetailDialogOpen(false);
              }
            }}
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </DialogButton>
          <DialogButton
            variant="destructive"
            onClick={() => {
              setDetailDialogOpen(false);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </DialogButton>
        </DialogFooter>
      </Dialog>

      {/* Copy Prediction Dialog */}
      <Dialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        title="Copy Prediction"
        description={`Copy ${prediction.symbol} prediction to another strategy`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Target Strategy *
            </label>
            <select
              value={copyTargetStrategy}
              onChange={(e) => setCopyTargetStrategy(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="" disabled>
                -- Select a strategy --
              </option>
              {strategies
                ?.filter((s) => s.id !== prediction.strategyId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setCopyDialogOpen(false)}>
            Cancel
          </DialogButton>
          <DialogButton onClick={handleCopyPrediction} disabled={isCopying || !copyTargetStrategy}>
            {isCopying ? "Copying..." : "Copy Prediction"}
          </DialogButton>
        </DialogFooter>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Prediction"
        description={`Are you sure you want to delete the prediction for ${prediction.symbol}? This action cannot be undone.`}
      >
        <DialogFooter>
          <DialogButton variant="outline" onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </DialogButton>
          <DialogButton
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </DialogButton>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
