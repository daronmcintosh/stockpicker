import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { WorkflowRun } from "@/gen/stockpicker/v1/strategy_pb";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { useMemo } from "react";

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

interface Recommendation {
  symbol?: string;
  confidence_pct?: number;
  confidence_level?: number;
  risk_level?: string;
  hit_probability_pct?: number;
  success_probability?: number;
  [key: string]: unknown;
}

interface WorkflowRunDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowRun: WorkflowRun | null;
}

export function WorkflowRunDetailDialog({
  open,
  onOpenChange,
  workflowRun,
}: WorkflowRunDetailDialogProps) {
  const inputData = useMemo(() => {
    if (!workflowRun?.inputData) return null;
    try {
      return JSON.parse(workflowRun.inputData);
    } catch {
      return null;
    }
  }, [workflowRun?.inputData]);

  const aiAnalysis = useMemo(() => {
    if (!workflowRun?.aiAnalysis) return null;
    try {
      return JSON.parse(workflowRun.aiAnalysis);
    } catch {
      return null;
    }
  }, [workflowRun?.aiAnalysis]);

  const jsonOutput = useMemo(() => {
    if (!workflowRun?.jsonOutput) return null;
    try {
      return JSON.parse(workflowRun.jsonOutput);
    } catch {
      return null;
    }
  }, [workflowRun?.jsonOutput]);

  if (!workflowRun) {
    return null;
  }

  const createdDate = workflowRun.createdAt
    ? new Date(Number(workflowRun.createdAt.seconds) * 1000)
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Workflow Run Details"
      description={
        createdDate ? `Executed on ${createdDate.toLocaleString()}` : "Workflow execution details"
      }
      size="xl"
    >
      <div className="space-y-6">
        {/* Metadata Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <div className="flex items-center gap-4 flex-wrap">
            {workflowRun.status &&
              (() => {
                const statusConfig = getStatusConfig(workflowRun.status);
                const StatusIcon = statusConfig.icon;
                return (
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border ${statusConfig.className}`}
                  >
                    <StatusIcon
                      className={`w-4 h-4 ${workflowRun.status.toLowerCase() === "running" ? "animate-spin" : ""}`}
                    />
                    {statusConfig.label}
                  </div>
                );
              })()}
            {createdDate && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <Calendar className="w-4 h-4" />
                <span>{createdDate.toLocaleString()}</span>
              </div>
            )}
            {workflowRun.executionId && (
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <ExternalLink className="w-4 h-4" />
                <span className="font-mono text-xs">
                  Execution: {workflowRun.executionId.substring(0, 8)}...
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Error Message */}
        {workflowRun.status?.toLowerCase() === "failed" && workflowRun.errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-red-900 mb-1">Execution Failed</h4>
                <p className="text-sm text-red-800">{workflowRun.errorMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Section 1: Input Data */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
              1
            </div>
            <h3 className="text-base font-semibold text-gray-900">Input Data</h3>
          </div>
          <div className="ml-8">
            {inputData ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg">
                <div className="p-4 max-h-[400px] overflow-y-auto">
                  <pre className="text-xs font-mono text-gray-800 leading-relaxed">
                    {JSON.stringify(inputData, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                No input data available
              </div>
            )}
          </div>
        </div>

        {/* Divider with Arrow */}
        <div className="flex items-center justify-center ml-8">
          <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
        </div>

        {/* Section 2: AI Analysis */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold">
              2
            </div>
            <h3 className="text-base font-semibold text-gray-900">AI Analysis</h3>
          </div>
          <div className="ml-8">
            {aiAnalysis ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg">
                <div className="p-4 max-h-[400px] overflow-y-auto">
                  <pre className="text-xs font-mono text-gray-800 leading-relaxed">
                    {JSON.stringify(aiAnalysis, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                No AI analysis data available
              </div>
            )}
          </div>
        </div>

        {/* Divider with Arrow */}
        <div className="flex items-center justify-center ml-8">
          <ChevronRight className="w-5 h-5 text-gray-400 rotate-90" />
        </div>

        {/* Section 3: Output */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
              3
            </div>
            <h3 className="text-base font-semibold text-gray-900">Output</h3>
          </div>
          <div className="ml-8 space-y-4">
            {/* Markdown Output */}
            {workflowRun.markdownOutput && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Analysis Report</label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-gray-800">
                    {workflowRun.markdownOutput}
                  </div>
                </div>
              </div>
            )}

            {/* JSON Output Summary */}
            {jsonOutput?.recommendations && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Recommendations ({jsonOutput.recommendations.length})
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="space-y-3">
                    {jsonOutput.recommendations
                      .slice(0, 10)
                      .map((rec: Recommendation, idx: number) => {
                        const confidence =
                          rec.confidence_pct ||
                          (rec.confidence_level !== undefined
                            ? rec.confidence_level * 100
                            : undefined);
                        const successProb =
                          rec.hit_probability_pct ||
                          (rec.success_probability !== undefined
                            ? rec.success_probability * 100
                            : undefined);

                        return (
                          <div
                            key={rec.symbol || `rec-${idx}`}
                            className="flex items-center justify-between p-3 bg-white rounded border border-gray-200"
                          >
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs text-gray-500">#{idx + 1}</span>
                              <div>
                                <div className="font-semibold text-gray-900">{rec.symbol}</div>
                                <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                                  {confidence !== undefined && (
                                    <span>
                                      Confidence: <strong>{confidence.toFixed(0)}%</strong>
                                    </span>
                                  )}
                                  {rec.risk_level && (
                                    <span className="capitalize">
                                      Risk: <strong>{rec.risk_level}</strong>
                                    </span>
                                  )}
                                  {successProb !== undefined && (
                                    <span>
                                      Success: <strong>{successProb.toFixed(0)}%</strong>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {jsonOutput.recommendations.length > 10 && (
                      <div className="text-xs text-gray-500 text-center pt-2">
                        ... and {jsonOutput.recommendations.length - 10} more
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Full JSON Output (Collapsible) */}
            {jsonOutput && (
              <details className="bg-gray-50 border border-gray-200 rounded-lg">
                <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                  View Full JSON Output
                </summary>
                <div className="p-4 border-t border-gray-200">
                  <pre className="text-xs font-mono overflow-x-auto max-h-[300px] overflow-y-auto bg-white p-3 rounded border border-gray-200 text-gray-800">
                    {JSON.stringify(jsonOutput, null, 2)}
                  </pre>
                </div>
              </details>
            )}

            {!workflowRun.markdownOutput && !jsonOutput && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                No output data available
              </div>
            )}
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogButton variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
