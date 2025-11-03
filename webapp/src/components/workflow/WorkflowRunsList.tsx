import { WorkflowRunDetailDialog } from "@/components/workflow/WorkflowRunDetailDialog";
import type { WorkflowRun } from "@/gen/stockpicker/v1/strategy_pb";
import { Calendar, ExternalLink } from "lucide-react";
import { useState } from "react";

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
      <div className="space-y-2">
        {workflowRuns.map((run) => {
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
              className="bg-gray-50 border border-gray-200 rounded-lg p-4 cursor-pointer hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-gray-900">Workflow Run</h4>
                    {createdDate && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <Calendar className="w-3 h-3" />
                        {createdDate.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    {recommendationsCount > 0 && (
                      <span>{recommendationsCount} recommendations</span>
                    )}
                    {avgConfidence !== null && (
                      <span className="font-medium">
                        Avg Confidence: {avgConfidence.toFixed(0)}%
                      </span>
                    )}
                    {avgRisk && <span className="capitalize">Risk: {avgRisk}</span>}
                  </div>
                  {run.executionId && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <ExternalLink className="w-3 h-3" />
                      Execution: {run.executionId.substring(0, 8)}...
                    </div>
                  )}
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
