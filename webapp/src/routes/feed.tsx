import { FeedFilters, PredictionFeedCard, StrategyFeedCard } from "@/components/feed";
import { CopyPredictionDialog } from "@/components/prediction/CopyPredictionDialog";
import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { StrategyPrivacy } from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";

export const Route = createFileRoute("/feed")({
  component: FeedPage,
});

type FeedItem = { type: "prediction"; data: Prediction } | { type: "strategy"; data: Strategy };

type FilterType = "all" | "predictions" | "strategies";
type FeedScope = "public" | "following";

function FeedPage() {
  const { token } = useAuth();
  const [allFeedItems, setAllFeedItems] = useState<FeedItem[]>([]);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showFollowing, setShowFollowing] = useState(false);
  const [scope, setScope] = useState<FeedScope>("public");
  const [loading, setLoading] = useState(true);
  const [totalPredictions, setTotalPredictions] = useState(0);
  const [totalStrategies, setTotalStrategies] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [copyPredictionDialogOpen, setCopyPredictionDialogOpen] = useState(false);
  const [copyPredictionTarget, setCopyPredictionTarget] = useState<{
    prediction: Prediction;
    targetStrategy: string;
  } | null>(null);
  const [isCopyingPrediction, setIsCopyingPrediction] = useState(false);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    try {
      // Use authenticated client if available (for better data access)
      const client = token ? createClient(token) : createClient();

      if (scope === "following" && !token) {
        // Can't load following feed without auth
        setLoading(false);
        return;
      }

      // Load user's strategies for copy functionality
      if (token) {
        try {
          const strategiesResponse = await client.strategy.listStrategies({});
          setStrategies(strategiesResponse.strategies);
        } catch (error) {
          console.error("Failed to load strategies:", error);
        }
      }

      if (scope === "following") {
        // Load following feed - predictions and strategies from followed users
        try {
          // Get list of users we're following
          const followingResponse = await client.strategy.listFollowing({});
          const followingUserIds = new Set(followingResponse.users.map((u) => u.id));

          // Load all strategies and filter for public ones from followed users
          const strategiesResponse = await client.strategy.listStrategies({});
          const followingStrategies = strategiesResponse.strategies.filter(
            (s) =>
              s.privacy === StrategyPrivacy.PUBLIC && s.user?.id && followingUserIds.has(s.user.id)
          );

          // For predictions, we'll need to load and filter (public predictions from followed users)
          // Note: This is a simplified approach - in production you might want a dedicated endpoint
          const predictionsResponse = await client.prediction.getPublicPredictions({
            limit: 100,
            offset: 0,
          });
          const followingPredictions = predictionsResponse.predictions.filter(
            (p) => p.user?.id && followingUserIds.has(p.user.id)
          );

          setTotalPredictions(followingPredictions.length);
          setTotalStrategies(followingStrategies.length);

          // Combine and sort by creation date (most recent first)
          const items: FeedItem[] = [
            ...followingPredictions.map((p) => ({ type: "prediction" as const, data: p })),
            ...followingStrategies.map((s) => ({ type: "strategy" as const, data: s })),
          ].sort((a, b) => {
            const aTime = a.data.createdAt?.seconds ? Number(a.data.createdAt.seconds) : 0;
            const bTime = b.data.createdAt?.seconds ? Number(b.data.createdAt.seconds) : 0;
            return bTime - aTime;
          });

          setAllFeedItems(items);
        } catch (error) {
          console.error("Failed to load following feed:", error);
          toast.error("Failed to load following feed");
        }
      } else {
        // Load public feed
        // Load public predictions
        const predictionsResponse = await client.prediction.getPublicPredictions({
          limit: 100, // Load more to sort properly
          offset: 0,
        });

        // Load all strategies and filter for public ones
        const strategiesResponse = await client.strategy.listStrategies({});
        const publicStrategies = strategiesResponse.strategies.filter(
          (s) => s.privacy === StrategyPrivacy.PUBLIC
        );

        setTotalPredictions(predictionsResponse.total);
        setTotalStrategies(publicStrategies.length);

        // Combine and sort by creation date (most recent first)
        const items: FeedItem[] = [
          ...predictionsResponse.predictions.map((p) => ({ type: "prediction" as const, data: p })),
          ...publicStrategies.map((s) => ({ type: "strategy" as const, data: s })),
        ].sort((a, b) => {
          const aTime = a.data.createdAt?.seconds ? Number(a.data.createdAt.seconds) : 0;
          const bTime = b.data.createdAt?.seconds ? Number(b.data.createdAt.seconds) : 0;
          return bTime - aTime;
        });

        setAllFeedItems(items);
      }
    } catch (error) {
      console.error("Failed to load feed:", error);
    } finally {
      setLoading(false);
    }
  }, [token, scope]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  // Update scope when following toggle changes
  useEffect(() => {
    if (showFollowing && token) {
      setScope("following");
    } else {
      setScope("public");
    }
  }, [showFollowing, token]);

  // Reset offset when filter changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: we intentionally want to reset offset when filter changes
  useEffect(() => {
    setOffset(0);
  }, [filter]);

  // Filter and paginate items
  const filteredItems = allFeedItems.filter((item) => {
    if (filter === "all") return true;
    if (filter === "predictions") return item.type === "prediction";
    if (filter === "strategies") return item.type === "strategy";
    return true;
  });

  const paginatedItems = filteredItems.slice(offset, offset + limit);
  const totalFilteredItems = filteredItems.length;

  async function copyStrategy(id: string) {
    if (!token) {
      toast.error("Please log in to copy strategies");
      return;
    }
    try {
      const client = createClient(token);
      await client.strategy.copyStrategy({ strategyId: id });
      toast.success("Strategy copied successfully!");
      await loadFeed();
    } catch (error) {
      console.error("Failed to copy strategy:", error);
      toast.error(error instanceof Error ? error.message : "Failed to copy strategy");
    }
  }

  async function copyPrediction(predictionId: string, targetStrategyId: string) {
    if (!token) {
      toast.error("Please log in to copy predictions");
      return;
    }
    setIsCopyingPrediction(true);
    try {
      const client = createClient(token);
      await client.prediction.copyPrediction({
        predictionId,
        strategyId: targetStrategyId,
      });
      toast.success("Prediction copied successfully!");
      setCopyPredictionDialogOpen(false);
      setCopyPredictionTarget(null);
      await loadFeed();
    } catch (error) {
      console.error("Failed to copy prediction:", error);
      toast.error(error instanceof Error ? error.message : "Failed to copy prediction");
    } finally {
      setIsCopyingPrediction(false);
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

  async function sharePrediction(prediction: Prediction) {
    const url = `${window.location.origin}/predictions?strategy=${prediction.strategyId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    } catch (error) {
      console.error("Failed to copy link:", error);
      toast.error("Failed to copy link");
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {showFollowing ? "Following Feed" : "Public Feed"}
        </h1>
        <p className="mt-2 text-gray-600">
          {showFollowing ? (
            <>
              See what users you're following are sharing.{" "}
              {filter === "all" &&
                `${totalPredictions} ${totalPredictions === 1 ? "prediction" : "predictions"} and ${totalStrategies} ${totalStrategies === 1 ? "strategy" : "strategies"}.`}
              {filter === "predictions" &&
                `${totalPredictions} ${totalPredictions === 1 ? "prediction" : "predictions"}.`}
              {filter === "strategies" &&
                `${totalStrategies} ${totalStrategies === 1 ? "strategy" : "strategies"}.`}
            </>
          ) : (
            <>
              See what the community is sharing.{" "}
              {filter === "all" &&
                `${totalPredictions} public ${totalPredictions === 1 ? "prediction" : "predictions"} and ${totalStrategies} public ${totalStrategies === 1 ? "strategy" : "strategies"}.`}
              {filter === "predictions" &&
                `${totalPredictions} public ${totalPredictions === 1 ? "prediction" : "predictions"}.`}
              {filter === "strategies" &&
                `${totalStrategies} public ${totalStrategies === 1 ? "strategy" : "strategies"}.`}
            </>
          )}
        </p>

        <FeedFilters
          filter={filter}
          onFilterChange={setFilter}
          showFollowing={showFollowing}
          onFollowingToggle={() => setShowFollowing(!showFollowing)}
          hasToken={!!token}
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
        </div>
      ) : paginatedItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            {showFollowing
              ? "No content from followed users yet."
              : filter === "all" && "No public content yet."}
            {!showFollowing && filter === "predictions" && "No public predictions yet."}
            {!showFollowing && filter === "strategies" && "No public strategies yet."}
          </p>
          <p className="text-gray-400 text-sm mt-2">
            {showFollowing && "Start following users to see their content here!"}
            {!showFollowing &&
              filter === "all" &&
              "Be the first to share a strategy or prediction!"}
            {!showFollowing && filter === "predictions" && "Be the first to share a prediction!"}
            {!showFollowing && filter === "strategies" && "Be the first to share a strategy!"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedItems.map((item) => {
            if (item.type === "prediction") {
              return (
                <PredictionFeedCard
                  key={`prediction-${item.data.id}`}
                  prediction={item.data}
                  token={token}
                  onCopy={(prediction) => {
                    setCopyPredictionTarget({
                      prediction,
                      targetStrategy: "",
                    });
                    setCopyPredictionDialogOpen(true);
                  }}
                  onShare={sharePrediction}
                />
              );
            }
            return (
              <StrategyFeedCard
                key={`strategy-${item.data.id}`}
                strategy={item.data}
                token={token}
                onCopy={copyStrategy}
                onShare={shareStrategy}
              />
            );
          })}

          {/* Pagination */}
          {totalFilteredItems > limit && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <button
                type="button"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                {offset + 1}-{Math.min(offset + limit, totalFilteredItems)} of {totalFilteredItems}
              </span>
              <button
                type="button"
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= totalFilteredItems}
                className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Copy Prediction Dialog */}
      {copyPredictionTarget && (
        <CopyPredictionDialog
          open={copyPredictionDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCopyPredictionDialogOpen(false);
              setCopyPredictionTarget(null);
            }
          }}
          prediction={copyPredictionTarget.prediction}
          strategies={strategies
            .filter((s) => s.id !== copyPredictionTarget.prediction.strategyId)
            .map((s) => ({ id: s.id, name: s.name }))}
          copyTargetStrategy={copyPredictionTarget.targetStrategy}
          onCopyTargetStrategyChange={(strategy) =>
            setCopyPredictionTarget({
              ...copyPredictionTarget,
              targetStrategy: strategy,
            })
          }
          onCopy={async () => {
            if (copyPredictionTarget.targetStrategy) {
              await copyPrediction(
                copyPredictionTarget.prediction.id,
                copyPredictionTarget.targetStrategy
              );
            }
          }}
          isCopying={isCopyingPrediction}
        />
      )}
    </div>
  );
}
