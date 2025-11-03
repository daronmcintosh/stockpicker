import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { StrategyPrivacy, StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  Copy,
  Edit,
  Globe,
  Lock,
  Pause,
  Play,
  Share2,
  Sparkles,
  StopCircle,
  Trash2,
} from "lucide-react";
import { StatusBadge } from "./StatusBadge";

interface StrategyCardProps {
  strategy: Strategy;
  predictionCount: number;
  updatingPrivacy: string | null;
  triggeringStrategy: string | null;
  onPrivacyToggle: (id: string, currentPrivacy: StrategyPrivacy) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onStop: (id: string) => void;
  onTriggerPredictions: (id: string) => void;
  onEdit: (strategy: Strategy) => void;
  onDelete: (id: string) => void;
  onDetail: (strategy: Strategy) => void;
  onCopy: (id: string) => void;
  onShare: (id: string, name: string) => void;
}

export function StrategyCard({
  strategy,
  predictionCount,
  updatingPrivacy,
  triggeringStrategy,
  onPrivacyToggle,
  onStart,
  onPause,
  onStop,
  onTriggerPredictions,
  onEdit,
  onDelete,
  onDetail,
  onCopy,
  onShare,
}: StrategyCardProps) {
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg px-5 py-3.5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
      onClick={() => onDetail(strategy)}
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
                {predictionCount} prediction{predictionCount !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrivacyToggle(strategy.id, strategy.privacy);
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
            <div className="text-sm font-semibold text-gray-900">{strategy.timeHorizon}</div>
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
              onClick={() => onStart(strategy.id)}
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
                onClick={() => onTriggerPredictions(strategy.id)}
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
                onClick={() => onPause(strategy.id)}
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
              onClick={() => onStop(strategy.id)}
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
              onEdit(strategy);
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
              onClick={() => onDelete(strategy.id)}
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
              onCopy(strategy.id);
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
                onShare(strategy.id, strategy.name);
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
  );
}
