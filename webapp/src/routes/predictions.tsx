import {
  CreatePredictionDialog,
  EditPredictionDialog,
  GeneratePredictionsDialog,
  PredictionCard,
  PredictionFilters,
  toNumber,
} from "@/components/prediction";
import { scorePrediction } from "@/components/prediction/predictionHelpers";
import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import {
  type PredictionAction,
  PredictionSource,
  type PredictionStatus,
  type StrategyPrivacy,
} from "@/gen/stockpicker/v1/strategy_pb";
import { RiskLevel } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { fetchStockPrices } from "@/lib/stockPrice";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { Plus, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

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
        // Rank by score (desc)
        const ranked = [...filteredPredictions]
          .map((p) => ({ p, score: scorePrediction(p) }))
          .sort((a, b) => b.score - a.score)
          .map(({ p }) => p);
        setPredictions(ranked);
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
        const ranked = [...filteredPredictions]
          .map((p) => ({ p, score: scorePrediction(p) }))
          .sort((a, b) => b.score - a.score)
          .map(({ p }) => p);
        setPredictions(ranked);
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
        // Reload predictions after a short delay to allow background job to complete
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
      // TODO: Uncomment when proto files are regenerated
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

      {/* Filters */}
      <PredictionFilters
        selectedStrategy={selectedStrategy}
        strategies={strategies}
        statusFilter={statusFilter}
        actionFilter={actionFilter}
        onStrategyChange={setSelectedStrategy}
        onStatusChange={setStatusFilter}
        onActionChange={setActionFilter}
      />

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
          {predictions.map((prediction, idx) => {
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
                rank={idx + 1}
                score={scorePrediction(prediction)}
              />
            );
          })}
        </div>
      )}

      {/* Create Prediction Dialog */}
      <CreatePredictionDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        selectedStrategy={selectedStrategy}
        strategies={strategies}
        dialogStrategy={dialogStrategy}
        onDialogStrategyChange={setDialogStrategy}
        formData={formData}
        onFormDataChange={(data) => setFormData({ ...formData, ...data })}
        currentStockPrice={currentStockPrice}
        loadingStockPrice={loadingStockPrice}
        creating={creating}
        onCreate={handleCreatePrediction}
        onCancel={() => {
          setCreateDialogOpen(false);
          setCurrentStockPrice(null);
        }}
      />

      {/* Generate Predictions Dialog */}
      <GeneratePredictionsDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        strategies={strategies}
        dialogStrategy={dialogStrategy}
        onDialogStrategyChange={setDialogStrategy}
        triggeringStrategy={triggeringStrategy}
        onGenerate={() => handleTriggerPredictions()}
      />

      {/* Edit Prediction Dialog */}
      <EditPredictionDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editingPrediction={editingPrediction}
        editFormData={editFormData}
        onEditFormDataChange={(data) => setEditFormData({ ...editFormData, ...data })}
        editCurrentStockPrice={editCurrentStockPrice}
        loadingEditStockPrice={loadingEditStockPrice}
        updatingPrediction={updatingPrediction}
        onUpdate={handleUpdatePrediction}
        onCancel={() => {
          setEditDialogOpen(false);
          setEditingPrediction(null);
          setEditCurrentStockPrice(null);
        }}
      />
    </div>
  );
}
