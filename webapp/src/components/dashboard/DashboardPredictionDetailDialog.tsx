import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import {
  PredictionAction,
  PredictionPrivacy,
  PredictionStatus,
  StrategyPrivacy,
} from "@/gen/stockpicker/v1/strategy_pb";
import { Link, useNavigate } from "@tanstack/react-router";
import { Bot, CheckCircle2, Eye, Lock, Pencil, Trash2, TrendingUp, XCircle } from "lucide-react";
import { getPredictionSource, getStatusColor, getStatusLabel, toNumber } from "./dashboardHelpers";

interface DashboardPredictionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prediction: Prediction | null;
  currentPrices: Record<string, number>;
  allStrategies: Strategy[];
  loadingPrices: boolean;
  isUpdatingAction: boolean;
  onActionChange: (newAction: PredictionAction) => Promise<void>;
  onDeleteRequest: () => void;
}

export function DashboardPredictionDetailDialog({
  open,
  onOpenChange,
  prediction,
  currentPrices,
  allStrategies,
  loadingPrices,
  isUpdatingAction,
  onActionChange,
  onDeleteRequest,
}: DashboardPredictionDetailDialogProps) {
  const navigate = useNavigate();

  if (!prediction) {
    return null;
  }

  const entryPrice = toNumber(prediction.entryPrice);
  const targetPrice = toNumber(prediction.targetPrice);
  const stopLossPrice = toNumber(prediction.stopLossPrice);
  const displayCurrentPrice =
    currentPrices[prediction.symbol] !== undefined
      ? currentPrices[prediction.symbol]
      : toNumber(prediction.currentPrice ?? prediction.entryPrice);
  const currentReturn =
    currentPrices[prediction.symbol] !== undefined
      ? ((currentPrices[prediction.symbol] - entryPrice) / entryPrice) * 100
      : toNumber(prediction.currentReturnPct ?? 0);
  const targetReturn = toNumber(prediction.targetReturnPct);
  const allocatedAmount = toNumber(prediction.allocatedAmount);
  const sentimentScore = toNumber(prediction.sentimentScore);
  const overallScore = toNumber(prediction.overallScore);
  const stopLossDollarImpact = toNumber(prediction.stopLossDollarImpact);
  const stopLossPct = toNumber(prediction.stopLossPct);
  const strategy = allStrategies.find((s) => s.id === prediction.strategyId);
  const isStrategyOwned = !!strategy;
  const strategyPrivacy = strategy?.privacy;
  const source = getPredictionSource(prediction);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2">
          <span>{prediction.symbol} - Prediction Details</span>
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
        </div>
      }
      description={
        prediction.createdAt
          ? `Created ${new Date(Number(prediction.createdAt.seconds) * 1000).toLocaleDateString()}`
          : undefined
      }
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
            {strategy && prediction.strategyId && (
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
                    {strategy.name}
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
              onClick={() => onActionChange(PredictionAction.PENDING)}
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
              onClick={() => onActionChange(PredictionAction.ENTERED)}
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
              onClick={() => onActionChange(PredictionAction.DISMISSED)}
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
                    loadingPrices
                      ? "text-gray-400"
                      : currentReturn >= 0
                        ? "text-green-600"
                        : "text-red-600"
                  }`}
                >
                  {loadingPrices
                    ? "Loading..."
                    : `$${displayCurrentPrice.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                </div>
                {!loadingPrices && (
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
                <span className="font-semibold text-gray-900">{overallScore.toFixed(1)} / 10</span>
              </div>
            </div>
          </div>
        </div>

        {/* Analysis Notes */}
        {prediction.technicalAnalysis && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {source === "Manual" ? "Analysis Notes" : "Technical Analysis"}
            </label>
            <div
              className={`text-sm p-3 rounded border max-h-40 overflow-y-auto whitespace-pre-wrap ${
                source === "Manual" ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"
              }`}
            >
              {prediction.technicalAnalysis}
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <DialogButton variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </DialogButton>
        <DialogButton
          onClick={() => {
            navigate({
              to: "/predictions",
              search: {
                strategy: prediction.strategyId,
                status: undefined,
                action: undefined,
              },
            });
            onOpenChange(false);
          }}
        >
          <Eye className="w-4 h-4 mr-2" />
          View Full Details
        </DialogButton>
        <DialogButton variant="destructive" onClick={onDeleteRequest}>
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
