import { EditStrategyDialog, StrategyCard } from "@/components/strategy";
import type { EditFormData } from "@/components/strategy/EditStrategyDialog";
import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { StrategyPrivacy } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/strategies/")({
  component: StrategiesPage,
});

function StrategiesPage() {
  const { token, isLoading: authLoading } = useAuth();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [predictionCounts, setPredictionCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [strategyToDelete, setStrategyToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [triggeringStrategy, setTriggeringStrategy] = useState<string | null>(null);
  const [updatingPrivacy, setUpdatingPrivacy] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [updatingStrategy, setUpdatingStrategy] = useState(false);

  // Load strategies on mount, but wait for auth to finish loading
  useEffect(() => {
    if (!authLoading) {
      loadStrategies();
    }
  }, [authLoading]);

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
      await getClients().strategy.copyStrategy({ strategyId: id });
      toast.success("Strategy copied successfully!");
      await loadStrategies();
    } catch (error) {
      console.error("Failed to copy strategy:", error);
      toast.error(error instanceof Error ? error.message : "Failed to copy strategy");
    }
  }

  async function shareStrategy(id: string, _name: string) {
    const url = `${window.location.origin}/strategies/${id}`;
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

  const [editingSourceConfig, setEditingSourceConfig] =
    useState<Awaited<ReturnType<typeof fetchSourceConfig>>>(null);

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
    // Try to fetch source config if available
    // For now, we'll use defaults and save on update
    setEditingSourceConfig(null);
  }

  async function handleUpdateStrategy(strategy: Strategy, formData: EditFormData) {
    setUpdatingStrategy(true);
    try {
      await getClients().strategy.updateStrategy({
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
      await loadStrategies();
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
            <StrategyCard
              key={strategy.id}
              strategy={strategy}
              predictionCount={predictionCounts[strategy.id] ?? 0}
              updatingPrivacy={updatingPrivacy}
              triggeringStrategy={triggeringStrategy}
              onPrivacyToggle={handlePrivacyToggle}
              onStart={startStrategy}
              onPause={pauseStrategy}
              onStop={stopStrategy}
              onTriggerPredictions={triggerPredictions}
              onEdit={openEditDialog}
              onDelete={openDeleteDialog}
              onCopy={copyStrategy}
              onShare={shareStrategy}
            />
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
