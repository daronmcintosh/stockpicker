import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import {
  PredictionStatus,
  RiskLevel,
  StrategyPrivacy,
  StrategyStatus,
} from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  Clock,
  Copy,
  DollarSign,
  Share2,
  TrendingUp as StrategyIcon,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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

  const formatDate = (timestamp: { seconds: bigint } | undefined) => {
    if (!timestamp) return "—";
    const date = new Date(Number(timestamp.seconds) * 1000);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const _formatTime = (timestamp: { seconds: bigint } | undefined) => {
    if (!timestamp) return "—";
    const date = new Date(Number(timestamp.seconds) * 1000);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const getStatusBadge = (status: PredictionStatus) => {
    const statusMap = {
      [PredictionStatus.ACTIVE]: { label: "Active", className: "bg-blue-100 text-blue-800" },
      [PredictionStatus.HIT_TARGET]: {
        label: "Hit Target",
        className: "bg-green-100 text-green-800",
      },
      [PredictionStatus.HIT_STOP]: { label: "Hit Stop", className: "bg-red-100 text-red-800" },
      [PredictionStatus.EXPIRED]: { label: "Expired", className: "bg-gray-100 text-gray-800" },
    };
    const config = statusMap[status as keyof typeof statusMap] || {
      label: "Unknown",
      className: "bg-gray-100",
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const calculateReturn = (prediction: Prediction) => {
    if (prediction.currentPrice && prediction.currentPrice > 0) {
      const returnPct =
        ((prediction.currentPrice - prediction.entryPrice) / prediction.entryPrice) * 100;
      return returnPct;
    }
    return null;
  };

  const getStrategyStatusBadge = (status: StrategyStatus) => {
    const statusMap = {
      [StrategyStatus.ACTIVE]: { label: "Active", className: "bg-green-100 text-green-800" },
      [StrategyStatus.PAUSED]: { label: "Paused", className: "bg-yellow-100 text-yellow-800" },
      [StrategyStatus.STOPPED]: { label: "Stopped", className: "bg-gray-100 text-gray-800" },
    };
    const config = statusMap[status as keyof typeof statusMap] || {
      label: "Unknown",
      className: "bg-gray-100",
    };
    return (
      <span className={`px-2 py-1 text-xs rounded-full font-medium ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const getRiskLevelLabel = (riskLevel: RiskLevel) => {
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
  };

  const toNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

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

        {/* Filter Buttons */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="text-sm font-medium text-gray-700">Filter:</span>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "all"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("predictions")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "predictions"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Predictions
          </button>
          <button
            type="button"
            onClick={() => setFilter("strategies")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === "strategies"
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Strategies
          </button>
          {token && (
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-300">
              <span className="text-sm font-medium text-gray-700">Following:</span>
              <button
                type="button"
                onClick={() => setShowFollowing(!showFollowing)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  showFollowing ? "bg-blue-600" : "bg-gray-300"
                }`}
                role="switch"
                aria-checked={showFollowing}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    showFollowing ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}
        </div>
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
            {!showFollowing && filter === "all" && "Be the first to share a strategy or prediction!"}
            {!showFollowing && filter === "predictions" && "Be the first to share a prediction!"}
            {!showFollowing && filter === "strategies" && "Be the first to share a strategy!"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedItems.map((item) => {
            if (item.type === "prediction") {
              const prediction = item.data;
              const returnPct = calculateReturn(prediction);
              const isPositive = returnPct !== null && returnPct > 0;

              return (
                <div
                  key={`prediction-${prediction.id}`}
                  className="bg-white rounded-lg shadow-sm border-2 border-blue-100 p-6 hover:shadow-md hover:border-blue-200 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-md">
                            PREDICTION
                          </span>
                          <h3 className="text-2xl font-bold text-gray-900">{prediction.symbol}</h3>
                          {getStatusBadge(prediction.status)}
                        </div>
                        {prediction.user && (
                          <Link
                            to={`/users/${prediction.user.username}`}
                            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                          >
                            <UserAvatar user={prediction.user} size="sm" />
                            <span>{prediction.user.displayName || prediction.user.username}</span>
                          </Link>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                            Entry Price
                          </p>
                          <p className="text-xl font-bold text-gray-900">
                            ${prediction.entryPrice.toFixed(2)}
                          </p>
                        </div>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                            Target Price
                          </p>
                          <p className="text-xl font-bold text-green-700">
                            ${prediction.targetPrice.toFixed(2)}
                          </p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                            Stop Loss
                          </p>
                          <p className="text-xl font-bold text-red-700">
                            ${prediction.stopLossPrice.toFixed(2)}
                          </p>
                        </div>
                        {returnPct !== null ? (
                          <div
                            className={`border rounded-lg p-3 ${
                              isPositive
                                ? "bg-green-50 border-green-200"
                                : "bg-red-50 border-red-200"
                            }`}
                          >
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                              Current Return
                            </p>
                            <div className="flex items-center gap-1">
                              {isPositive ? (
                                <TrendingUp className="w-5 h-5 text-green-600" />
                              ) : (
                                <TrendingDown className="w-5 h-5 text-red-600" />
                              )}
                              <p
                                className={`text-xl font-bold ${isPositive ? "text-green-700" : "text-red-700"}`}
                              >
                                {returnPct > 0 ? "+" : ""}
                                {returnPct.toFixed(2)}%
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                              Current Return
                            </p>
                            <p className="text-lg font-semibold text-gray-400">—</p>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Target className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">
                            Target:{" "}
                            <span className="text-green-600">
                              +{prediction.targetReturnPct.toFixed(1)}%
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <TrendingDown className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">
                            Risk:{" "}
                            <span className="text-red-600">
                              -{prediction.stopLossPct.toFixed(1)}%
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <span className="font-medium">
                            Score:{" "}
                            <span className="text-blue-600 font-bold">
                              {prediction.overallScore}/10
                            </span>
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="ml-6 flex flex-col items-end gap-2 min-w-[120px]">
                      {token && (
                        <div className="flex flex-col items-end gap-2 w-full">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCopyPredictionTarget({
                                prediction,
                                targetStrategy: "",
                              });
                              setCopyPredictionDialogOpen(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors border border-indigo-600 shadow-sm"
                            title="Copy prediction to another strategy"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            Copy
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              sharePrediction(prediction);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors border border-gray-600 shadow-sm"
                            title="Share prediction link"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            Share
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-auto pt-2">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(prediction.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            const strategy = item.data;
            const monthlyBudget = toNumber(strategy.monthlyBudget);
            const currentMonthSpent = toNumber(strategy.currentMonthSpent);

            return (
              <div
                key={`strategy-${strategy.id}`}
                className="bg-white rounded-lg shadow-sm border-2 border-purple-100 p-6 hover:shadow-md hover:border-purple-200 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-md">
                          STRATEGY
                        </span>
                        <h3 className="text-2xl font-bold text-gray-900">{strategy.name}</h3>
                        {getStrategyStatusBadge(strategy.status)}
                      </div>
                      {strategy.user && (
                        <Link
                          to={`/users/${strategy.user.username}`}
                          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-blue-600 transition-colors"
                        >
                          <UserAvatar user={strategy.user} size="sm" />
                          <span>{strategy.user.displayName || strategy.user.username}</span>
                        </Link>
                      )}
                    </div>

                    {strategy.description && (
                      <p className="text-gray-600 text-sm mt-2 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        {strategy.description}
                      </p>
                    )}

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Monthly Budget
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          ${monthlyBudget.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Spent This Month
                        </p>
                        <p className="text-xl font-bold text-purple-700">
                          ${currentMonthSpent.toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Target Return
                        </p>
                        <p className="text-xl font-bold text-green-700">
                          +{toNumber(strategy.targetReturnPct).toFixed(1)}%
                        </p>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                          Risk Level
                        </p>
                        <p className="text-xl font-bold text-gray-900">
                          {getRiskLevelLabel(strategy.riskLevel)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t border-gray-200">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <BarChart3 className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">
                          Time Horizon:{" "}
                          <span className="text-gray-900 font-semibold">
                            {strategy.timeHorizon || "3 months"}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <DollarSign className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">
                          Per Stock:{" "}
                          <span className="text-gray-900 font-semibold">
                            ${toNumber(strategy.perStockAllocation).toLocaleString()}
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <StrategyIcon className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">
                          Max Stocks:{" "}
                          <span className="text-gray-900 font-semibold">
                            {toNumber(strategy.maxUniqueStocks)}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="ml-6 flex flex-col items-end gap-2 min-w-[120px]">
                    {token && (
                      <div className="flex flex-col items-end gap-2 w-full">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyStrategy(strategy.id);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-600 transition-colors border border-indigo-600 shadow-sm"
                          title="Copy strategy"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            shareStrategy(strategy.id, strategy.name);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-500 text-white hover:bg-gray-600 transition-colors border border-gray-600 shadow-sm"
                          title="Share strategy link"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          Share
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-xs text-gray-400 mt-auto pt-2">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(strategy.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
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
        <Dialog
          open={copyPredictionDialogOpen}
          onOpenChange={(open) => {
            if (!open) {
              setCopyPredictionDialogOpen(false);
              setCopyPredictionTarget(null);
            }
          }}
          title="Copy Prediction"
          description={`Copy ${copyPredictionTarget.prediction.symbol} prediction to another strategy`}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Target Strategy *
              </label>
              <select
                value={copyPredictionTarget.targetStrategy}
                onChange={(e) =>
                  setCopyPredictionTarget({
                    ...copyPredictionTarget,
                    targetStrategy: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="" disabled>
                  -- Select a strategy --
                </option>
                {strategies
                  .filter((s) => s.id !== copyPredictionTarget.prediction.strategyId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <DialogButton
              variant="outline"
              onClick={() => {
                setCopyPredictionDialogOpen(false);
                setCopyPredictionTarget(null);
              }}
            >
              Cancel
            </DialogButton>
            <DialogButton
              onClick={() =>
                copyPredictionTarget.targetStrategy &&
                copyPrediction(
                  copyPredictionTarget.prediction.id,
                  copyPredictionTarget.targetStrategy
                )
              }
              disabled={isCopyingPrediction || !copyPredictionTarget.targetStrategy}
            >
              {isCopyingPrediction ? "Copying..." : "Copy Prediction"}
            </DialogButton>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  );
}
