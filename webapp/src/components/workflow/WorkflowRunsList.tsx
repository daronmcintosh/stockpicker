import { WorkflowRunDetailDialog } from "@/components/workflow/WorkflowRunDetailDialog";
import type { WorkflowRun } from "@/gen/stockpicker/v1/strategy_pb";
import { Calendar, CheckCircle2, Clock, ExternalLink, Loader2, XCircle } from "lucide-react";
import { useState } from "react";

function getStatusConfig(status: string) {
  const normalized = status?.toLowerCase() || "unknown";
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
        label: status || "Unknown",
        className: "bg-gray-100 text-gray-700 border-gray-200",
        icon: Clock,
      };
  }
}

interface WorkflowRunsListProps {
  workflowRuns: WorkflowRun[];
  loading?: boolean;
}

export function WorkflowRunsList({ workflowRuns, loading }: WorkflowRunsListProps) {
  const [selectedRun, setSelectedRun] = useState<WorkflowRun | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const handleRunClick = (run: WorkflowRun) => {
    setSelectedRun(run);
    setDetailDialogOpen(true);
  };

  if (loading) {
    return <div className="text-sm text-gray-500 py-4">Loading workflow runs...</div>;
  }

  if (workflowRuns.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No workflow runs yet. Runs will appear here after predictions are generated.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-0">
        {workflowRuns.map((run, index) => {
          const createdDate = run.createdAt ? new Date(Number(run.createdAt.seconds) * 1000) : null;

          // Parse JSON to get summary info
          let recommendationsCount = 0;
          let avgConfidence = null;
          let avgRisk = null;
          try {
            const jsonOutput = run.jsonOutput ? JSON.parse(run.jsonOutput) : null;
            if (jsonOutput?.recommendations) {
              recommendationsCount = jsonOutput.recommendations.length;
              if (recommendationsCount > 0) {
                const confidences = jsonOutput.recommendations
                  .map(
                    (r: { confidence_pct?: number; confidence_level?: number }) =>
                      r.confidence_pct ||
                      (r.confidence_level !== undefined ? r.confidence_level * 100 : null)
                  )
                  .filter((c: number | null): c is number => c !== null && c !== undefined);
                if (confidences.length > 0) {
                  avgConfidence =
                    confidences.reduce((a: number, b: number) => a + b, 0) / confidences.length;
                }
                const risks = jsonOutput.recommendations
                  .map((r: { risk_level?: string }) => r.risk_level)
                  .filter((r: string | undefined): r is string => !!r);
                if (risks.length > 0) {
                  avgRisk = risks[0]; // Use first risk level as representative
                }
              }
            }
          } catch {
            // Ignore parse errors
          }

          return (
            <div
              key={run.id}
              onClick={() => handleRunClick(run)}
              className={`group relative flex items-start gap-4 p-4 border-l-2 ${
                index === 0
                  ? "border-blue-500 bg-blue-50/30"
                  : "border-gray-200 hover:border-gray-300"
              } hover:bg-gray-50 transition-all cursor-pointer ${
                index < workflowRuns.length - 1 ? "border-b border-gray-100" : ""
              }`}
            >
              {/* Timeline dot */}
              <div
                className={`absolute left-[-5px] top-6 w-3 h-3 rounded-full border-2 ${
                  index === 0
                    ? "bg-blue-500 border-blue-500"
                    : "bg-white border-gray-300 group-hover:border-gray-400"
                } transition-colors z-10`}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-4 mb-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-md bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                        #{workflowRuns.length - index}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-gray-900 truncate">
                          Workflow Run
                        </h4>
                        {run.status &&
                          (() => {
                            const statusConfig = getStatusConfig(run.status);
                            const StatusIcon = statusConfig.icon;
                            return (
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.className} flex-shrink-0`}
                              >
                                <StatusIcon
                                  className={`w-3 h-3 ${run.status.toLowerCase() === "running" ? "animate-spin" : ""}`}
                                />
                                {statusConfig.label}
                              </span>
                            );
                          })()}
                      </div>
                      {createdDate && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-0.5">
                          <Calendar className="w-3 h-3 flex-shrink-0" />
                          <span>{createdDate.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {run.executionId && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                      <ExternalLink className="w-3 h-3" />
                      <span className="font-mono">{run.executionId.substring(0, 8)}</span>
                    </div>
                  )}
                </div>

                {/* Summary metrics */}
                {(recommendationsCount > 0 || avgConfidence !== null || avgRisk) && (
                  <div className="ml-10 flex items-center gap-4 text-xs text-gray-600 flex-wrap">
                    {recommendationsCount > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-900">{recommendationsCount}</span>
                        <span>recommendation{recommendationsCount !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {avgConfidence !== null && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">•</span>
                        <span>
                          Avg Confidence:{" "}
                          <span className="font-medium text-gray-900">
                            {avgConfidence.toFixed(0)}%
                          </span>
                        </span>
                      </div>
                    )}
                    {avgRisk && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">•</span>
                        <span>
                          Risk:{" "}
                          <span className="font-medium text-gray-900 capitalize">{avgRisk}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Preview indicator */}
                <div className="ml-10 mt-2 text-xs text-gray-400 group-hover:text-gray-600 transition-colors">
                  Click to view details →
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <WorkflowRunDetailDialog
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        workflowRun={selectedRun}
      />
    </>
  );
}
