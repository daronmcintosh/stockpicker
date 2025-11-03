import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import {
  PredictionAction,
  PredictionPrivacy,
  PredictionStatus,
  StrategyPrivacy,
} from "@/gen/stockpicker/v1/strategy_pb";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/connect";
import { Link } from "@tanstack/react-router";
import {
  Bot,
  CheckCircle2,
  Copy,
  Globe,
  Lock,
  Pencil,
  Share2,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { CopyPredictionDialog } from "./CopyPredictionDialog";
import { DeletePredictionDialog } from "./DeletePredictionDialog";
import { PredictionDetailDialog } from "./PredictionDetailDialog";
import { getPredictionSource, toNumber } from "./predictionHelpers";

interface PredictionCardProps {
  prediction: Prediction;
  onPrivacyChange?: () => void;
  strategyName?: string;
  strategyPrivacy?: StrategyPrivacy;
  isStrategyOwned?: boolean;
  currentPrice?: number;
  isLoadingPrice?: boolean;
  onEdit?: (prediction: Prediction) => void;
  strategies?: Array<{ id: string; name: string }>;
  rank?: number;
  score?: number;
}

export function PredictionCard({
  prediction,
  onPrivacyChange,
  strategyName,
  strategyPrivacy,
  isStrategyOwned,
  currentPrice,
  isLoadingPrice,
  onEdit,
  strategies,
  rank,
  score,
}: PredictionCardProps) {
  const { token } = useAuth();
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isUpdatingAction, setIsUpdatingAction] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
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
    try {
      if (!token) {
        toast.error("Please log in to delete predictions");
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

  const source = getPredictionSource(prediction);

  return (
    <>
      <div
        className="bg-white border border-gray-200 rounded-lg px-5 py-4 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
        onClick={() => !detailDialogOpen && setDetailDialogOpen(true)}
      >
        {/* Top Row: Symbol, Status, and Actions */}
        <div className="flex items-start justify-between gap-4 mb-3">
          {/* Left: Symbol and Status */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">{prediction.symbol}</h2>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                    source === "AI" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                  }`}
                  title={source === "AI" ? "AI Generated" : "Manual Prediction"}
                >
                  {source === "AI" ? <Bot className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(prediction.status)}`}
                >
                  {getStatusLabel(prediction.status)}
                </span>
              </div>
              {strategyName &&
                prediction.strategyId &&
                (strategyPrivacy === StrategyPrivacy.PUBLIC || isStrategyOwned) && (
                  <Link
                    to="/strategies/$strategyId"
                    params={{ strategyId: prediction.strategyId }}
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
          </div>

          {/* Right: Rank, Score and Action Buttons */}
          <div
            className="flex items-center gap-2 flex-wrap flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {typeof rank === "number" && (
              <span
                className="px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200"
                title="Prediction rank"
              >
                #{rank}
              </span>
            )}
            {typeof score === "number" && (
              <span
                className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200"
                title="Prediction score (0-100)"
              >
                {score.toFixed(1)}
              </span>
            )}
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
        </div>

        {/* Middle Row: Price Metrics in Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-500 mb-1">Entry Price</div>
            <div className="text-base font-semibold text-gray-900">
              $
              {entryPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Current Price</div>
            <div className="text-base font-semibold text-blue-600">
              {isLoadingPrice ? (
                <span className="text-gray-400 text-sm">Loading...</span>
              ) : (
                `$${displayCurrentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Target Price</div>
            <div className="text-base font-semibold text-green-600">
              $
              {targetPrice.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Return</div>
            <div
              className={`text-base font-bold flex items-center gap-1 ${
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

        {/* Bottom Row: Privacy and Actions */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrivacyToggle();
              }}
              disabled={isUpdatingPrivacy}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors border ${
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

            {/* Copy & Share Buttons - Only for public predictions */}
            {prediction.privacy === PredictionPrivacy.PUBLIC && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCopyDialogOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                  title="Copy prediction to another strategy"
                >
                  <Copy className="w-3 h-3" />
                  Copy
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSharePrediction();
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors border bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                  title="Share prediction link"
                >
                  <Share2 className="w-3 h-3" />
                  Share
                </button>
              </>
            )}
          </div>

          {/* Delete Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDeleteDialogOpen(true);
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors border bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            title="Delete prediction"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>

      <PredictionDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        prediction={prediction}
        strategyName={strategyName}
        strategyPrivacy={strategyPrivacy}
        isStrategyOwned={isStrategyOwned}
        currentPrice={displayCurrentPrice}
        isLoadingPrice={isLoadingPrice ?? false}
        entryPrice={entryPrice}
        targetPrice={targetPrice}
        stopLossPrice={stopLossPrice}
        currentReturn={currentReturn}
        onEdit={onEdit}
        onActionChange={handleActionChange}
        isUpdatingAction={isUpdatingAction}
      />

      <CopyPredictionDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        prediction={prediction}
        strategies={strategies?.filter((s) => s.id !== prediction.strategyId) || []}
        copyTargetStrategy={copyTargetStrategy}
        onCopyTargetStrategyChange={setCopyTargetStrategy}
        onCopy={handleCopyPrediction}
        isCopying={isCopying}
      />

      <DeletePredictionDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        prediction={prediction}
        onDelete={handleDelete}
      />
    </>
  );
}
