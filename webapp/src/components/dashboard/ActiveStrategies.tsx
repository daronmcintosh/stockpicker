import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { getFrequencyLabel, getRiskLevelLabel, toNumber } from "./dashboardHelpers";

interface ActiveStrategiesProps {
  activeStrategies: Strategy[];
  predictionCounts: Record<string, number>;
  triggeringStrategy: string | null;
  onTriggerPredictions: (strategyId: string, strategyName: string) => void;
  pageSize?: number; // default 5
}

export function ActiveStrategies({
  activeStrategies,
  predictionCounts,
  triggeringStrategy,
  onTriggerPredictions,
  pageSize = 5,
}: ActiveStrategiesProps) {
  if (activeStrategies.length === 0) {
    return null;
  }

  const [page, setPage] = useState(1);
  const total = activeStrategies.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return activeStrategies.slice(start, start + pageSize);
  }, [activeStrategies, page, pageSize]);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="p-5 border-b border-gray-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Active Strategies</h2>
        <Link
          to="/strategies"
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View All <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
      <div className="divide-y divide-gray-200">
        {pageData.map((strategy) => (
          <Link
            key={strategy.id}
            to="/strategies/$strategyId"
            params={{ strategyId: strategy.id }}
            className="block p-4 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-base font-bold text-gray-900 truncate">{strategy.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">
                    Active
                  </span>
                </div>
                {strategy.description && (
                  <p className="text-sm text-gray-600 truncate mb-2">{strategy.description}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>{predictionCounts[strategy.id] ?? 0} predictions</span>
                  <span>•</span>
                  <span>${toNumber(strategy.monthlyBudget).toLocaleString()}/mo</span>
                  <span>•</span>
                  <span>{getFrequencyLabel(strategy.frequency)}</span>
                  <span>•</span>
                  <span>{getRiskLevelLabel(strategy.riskLevel)} risk</span>
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerPredictions(strategy.id, strategy.name);
                }}
                disabled={triggeringStrategy === strategy.id}
                className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
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
            </div>
          </Link>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="p-4 flex items-center justify-between text-sm">
          <div className="text-gray-600">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)} of {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={!canPrev}
              className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-gray-600">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={!canNext}
              className="px-3 py-1.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
