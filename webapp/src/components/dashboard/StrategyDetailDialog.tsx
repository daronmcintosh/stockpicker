import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { StatusBadge } from "./StatusBadge";
import { getFrequencyLabel, getRiskLevelLabel } from "./dashboardHelpers";

interface StrategyDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategy: Strategy | null;
  predictionCount: number;
}

export function StrategyDetailDialog({
  open,
  onOpenChange,
  strategy,
  predictionCount,
}: StrategyDetailDialogProps) {
  if (!strategy) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Strategy Details"
      description={strategy.name || ""}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Status</label>
            <StatusBadge status={strategy.status} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Predictions</label>
            <div className="text-lg font-semibold">{predictionCount}</div>
          </div>
        </div>

        {strategy.description && (
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Description</label>
            <div className="text-sm">{strategy.description}</div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">Custom Prompt</label>
          <div className="text-sm bg-gray-50 p-3 rounded border border-gray-200 max-h-40 overflow-y-auto">
            {strategy.customPrompt || "No custom prompt"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Monthly Budget</label>
            <div className="text-lg font-semibold">
              $
              {Number(strategy.monthlyBudget).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Spent This Month</label>
            <div className="text-lg font-semibold">
              $
              {Number(strategy.currentMonthSpent).toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Time Horizon</label>
            <div className="text-sm">{strategy.timeHorizon}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Target Return</label>
            <div className="text-sm">
              {Number(strategy.targetReturnPct).toFixed(2)}% ($
              {((Number(strategy.monthlyBudget) * Number(strategy.targetReturnPct)) / 100).toFixed(
                2
              )}
              )
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Frequency</label>
            <div className="text-sm">{getFrequencyLabel(strategy.frequency)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Risk Level</label>
            <div className="text-sm">{getRiskLevelLabel(strategy.riskLevel)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Trades Per Month</label>
            <div className="text-sm">{strategy.tradesPerMonth}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Per Trade Budget</label>
            <div className="text-sm">${Number(strategy.perTradeBudget).toFixed(2)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Per Stock Allocation
            </label>
            <div className="text-sm">${Number(strategy.perStockAllocation).toFixed(2)}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Portfolio Size</label>
            <div className="text-sm">
              {strategy.uniqueStocksCount} / {strategy.maxUniqueStocks} stocks
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Created</label>
            <div className="text-sm">
              {strategy.createdAt
                ? new Date(Number(strategy.createdAt.seconds) * 1000).toLocaleString()
                : "N/A"}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Last Updated</label>
            <div className="text-sm">
              {strategy.updatedAt
                ? new Date(Number(strategy.updatedAt.seconds) * 1000).toLocaleString()
                : "N/A"}
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
