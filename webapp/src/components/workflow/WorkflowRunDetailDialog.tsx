import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { WorkflowRun } from "@/gen/stockpicker/v1/strategy_pb";
import { Calendar, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

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
  const [activeTab, setActiveTab] = useState<"output" | "input" | "analysis">("output");

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

  // Status and error message available but not displayed yet in UI
  // const status = workflowRun?.status || "unknown";
  // const errorMessage = workflowRun?.errorMessage;

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
    >
      <div className="space-y-4">
        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab("output")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "output"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Output
          </button>
          <button
            onClick={() => setActiveTab("input")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "input"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Input Data
          </button>
          <button
            onClick={() => setActiveTab("analysis")}
            className={`px-4 py-2 text-sm font-medium ${
              activeTab === "analysis"
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            AI Analysis
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "output" && (
          <div className="space-y-4">
            {/* Markdown Output */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Analysis Report (Markdown)
              </label>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
                  {workflowRun.markdownOutput || "No markdown output available"}
                </div>
              </div>
            </div>

            {/* JSON Output Summary */}
            {jsonOutput && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Structured Output (JSON Summary)
                </label>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="space-y-2 text-sm">
                    {jsonOutput?.recommendations && (
                      <div>
                        <span className="font-semibold text-gray-900">
                          Recommendations: {jsonOutput.recommendations.length}
                        </span>
                        <div className="mt-2 space-y-1">
                          {jsonOutput.recommendations
                            .slice(0, 5)
                            .map((rec: Recommendation, idx: number) => (
                              <div key={rec.symbol || `rec-${idx}`} className="text-gray-600 pl-4">
                                {idx + 1}. {rec.symbol} - Confidence:{" "}
                                {rec.confidence_pct ||
                                (rec.confidence_level !== undefined
                                  ? rec.confidence_level * 100
                                  : undefined)
                                  ? `${(
                                      rec.confidence_pct ||
                                        (rec.confidence_level !== undefined
                                          ? rec.confidence_level * 100
                                          : 0) ||
                                        0
                                    ).toFixed(0)}%`
                                  : "N/A"}{" "}
                                | Risk: {rec.risk_level || "N/A"} | Success Prob:{" "}
                                {rec.hit_probability_pct ||
                                (rec.success_probability !== undefined
                                  ? rec.success_probability
                                  : undefined)
                                  ? `${(
                                      rec.hit_probability_pct ||
                                        (rec.success_probability !== undefined
                                          ? rec.success_probability * 100
                                          : 0) ||
                                        0
                                    ).toFixed(0)}%`
                                  : "N/A"}
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Full JSON Output (Collapsible) */}
            {jsonOutput && (
              <details className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">
                  View Full JSON Output
                </summary>
                <pre className="mt-2 text-xs overflow-x-auto max-h-64 overflow-y-auto bg-white p-2 rounded border">
                  {JSON.stringify(jsonOutput, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        {activeTab === "input" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Input Data (Sources, Strategy, Active Predictions)
            </label>
            {inputData ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-xs overflow-x-auto">{JSON.stringify(inputData, null, 2)}</pre>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                No input data available
              </div>
            )}
          </div>
        )}

        {activeTab === "analysis" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Raw AI Analysis Output
            </label>
            {aiAnalysis ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
                <pre className="text-xs overflow-x-auto">{JSON.stringify(aiAnalysis, null, 2)}</pre>
              </div>
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-500">
                No AI analysis data available
              </div>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              {createdDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {createdDate.toLocaleString()}
                </div>
              )}
              {workflowRun.executionId && (
                <div className="flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" />
                  Execution: {workflowRun.executionId.substring(0, 8)}...
                </div>
              )}
            </div>
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
