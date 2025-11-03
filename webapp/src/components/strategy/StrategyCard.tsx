import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { StrategyPrivacy, StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  CheckCircle2,
  Clock,
  Copy,
  Edit,
  Globe,
  Loader2,
  Lock,
  Pause,
  Play,
  Share2,
  Sparkles,
  StopCircle,
  Trash2,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { StatusBadge } from "./StatusBadge";

interface PerformanceData {
  active: number;
  hitTarget: number;
  hitStop: number;
  expired: number;
  hitRate: number;
  workflowRuns: number;
  latestRunStatus?: string;
  latestRunDate?: Date;
}

interface StrategyCardProps {
  strategy: Strategy;
  predictionCount: number;
  performanceData?: PerformanceData;
  updatingPrivacy: string | null;
  triggeringStrategy: string | null;
  onPrivacyToggle: (id: string, currentPrivacy: StrategyPrivacy) => void;
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onStop: (id: string) => void;
  onTriggerPredictions: (id: string) => void;
  onEdit: (strategy: Strategy) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onShare: (id: string, name: string) => void;
}

function getWorkflowStatusConfig(status?: string) {
  if (!status) return null;
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "completed":
      return {
        label: "Completed",
        className: "bg-green-100 text-green-700 border-green-200",
        icon: CheckCircle2,
      };
    case "failed":
      return {
        label: "Failed",
        className: "bg-red-100 text-red-700 border-red-200",
        icon: XCircle,
      };
    case "running":
      return {
        label: "Running",
        className: "bg-blue-100 text-blue-700 border-blue-200",
        icon: Loader2,
      };
    case "pending":
      return {
        label: "Pending",
        className: "bg-yellow-100 text-yellow-700 border-yellow-200",
        icon: Clock,
      };
    default:
      return {
        label: status,
        className: "bg-gray-100 text-gray-700 border-gray-200",
        icon: Clock,
      };
  }
}

export function StrategyCard({
  strategy,
  predictionCount,
  performanceData,
  updatingPrivacy,
  triggeringStrategy,
  onPrivacyToggle,
  onStart,
  onPause,
  onStop,
  onTriggerPredictions,
  onEdit,
  onDelete,
  onCopy,
  onShare,
}: StrategyCardProps) {
  const perf = performanceData;
  const latestRunStatusConfig = perf?.latestRunStatus
    ? getWorkflowStatusConfig(perf.latestRunStatus)
    : null;
  return (
    <Link
      to="/strategies/$strategyId"
      params={{ strategyId: strategy.id }}
      className="block bg-white border border-gray-200 rounded-lg px-5 py-3.5 hover:shadow-md hover:border-gray-300 transition-all cursor-pointer group"
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

        {/* Key Metrics - Budget & Config */}
        <div className="flex items-center gap-6 flex-1">
          <div className="min-w-[90px]">
            <div className="text-xs text-gray-500 mb-0.5">Monthly Budget</div>
            <div className="text-sm font-semibold text-gray-900">
              $
              {Number(strategy.monthlyBudget).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div className="min-w-[90px]">
            <div className="text-xs text-gray-500 mb-0.5">Spent</div>
            <div className="text-sm font-semibold text-gray-900">
              $
              {Number(strategy.currentMonthSpent).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div className="min-w-[85px]">
            <div className="text-xs text-gray-500 mb-0.5">Target Return</div>
            <div className="text-sm font-semibold text-green-600">
              {Number(strategy.targetReturnPct).toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Divider - appears if we have Performance Metrics OR Workflow Runs */}
        {perf && (predictionCount > 0 || perf.workflowRuns > 0) && (
          <div className="h-12 w-px bg-gray-200" />
        )}

        {/* Performance Metrics */}
        {perf && predictionCount > 0 && (
          <div className="flex items-center gap-6 flex-1">
            <div className="min-w-[70px]">
              <div className="text-xs text-gray-500 mb-0.5">Hit Rate</div>
              <div className="text-sm font-semibold text-emerald-600">
                {perf.hitRate.toFixed(1)}%
              </div>
            </div>
            <div className="min-w-[70px]">
              <div className="text-xs text-gray-500 mb-0.5">Wins</div>
              <div className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-green-600" />
                <span className="text-sm font-semibold text-green-600">{perf.hitTarget}</span>
              </div>
            </div>
            <div className="min-w-[70px]">
              <div className="text-xs text-gray-500 mb-0.5">Losses</div>
              <div className="flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-600" />
                <span className="text-sm font-semibold text-red-600">
                  {perf.hitStop + perf.expired}
                </span>
              </div>
            </div>
            <div className="min-w-[70px]">
              <div className="text-xs text-gray-500 mb-0.5">Active</div>
              <div className="text-sm font-semibold text-blue-600">{perf.active}</div>
            </div>
          </div>
        )}

        {/* Workflow Runs Info */}
        {perf && perf.workflowRuns > 0 && (
          <div className="flex items-center gap-3 min-w-[140px]">
            <div>
              <div className="text-xs text-gray-500 mb-0.5">Workflow Runs</div>
              <div className="text-sm font-semibold text-gray-900">{perf.workflowRuns}</div>
            </div>
            {latestRunStatusConfig &&
              (() => {
                const StatusIcon = latestRunStatusConfig.icon;
                return (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Latest</div>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${latestRunStatusConfig.className}`}
                    >
                      <StatusIcon
                        className={`w-3 h-3 ${
                          perf?.latestRunStatus?.toLowerCase() === "running" ? "animate-spin" : ""
                        }`}
                      />
                      {latestRunStatusConfig.label}
                    </span>
                  </div>
                );
              })()}
          </div>
        )}

        {/* Vertical Divider before Action Buttons */}
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
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onStart(strategy.id);
              }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onTriggerPredictions(strategy.id);
                }}
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
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onPause(strategy.id);
                }}
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
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onStop(strategy.id);
              }}
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
    </Link>
  );
}
