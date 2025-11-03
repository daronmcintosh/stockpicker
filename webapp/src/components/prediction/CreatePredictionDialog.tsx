import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import { PredictionSource, type StrategyPrivacy } from "@/gen/stockpicker/v1/strategy_pb";
import { Pencil } from "lucide-react";

interface CreatePredictionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedStrategy: string;
  strategies: Array<{ id: string; name: string; privacy?: StrategyPrivacy }>;
  dialogStrategy: string;
  onDialogStrategyChange: (strategy: string) => void;
  formData: {
    symbol: string;
    entryPrice: string;
    targetPrice: string;
    stopLossPrice: string;
    allocatedAmount: string;
    sentimentScore: string;
    overallScore: string;
    technicalAnalysis: string;
  };
  onFormDataChange: (data: Partial<typeof formData>) => void;
  currentStockPrice: number | null;
  loadingStockPrice: boolean;
  creating: boolean;
  onCreate: () => Promise<void>;
  onCancel: () => void;
}

export function CreatePredictionDialog({
  open,
  onOpenChange,
  selectedStrategy,
  strategies,
  dialogStrategy,
  onDialogStrategyChange,
  formData,
  onFormDataChange,
  currentStockPrice,
  loadingStockPrice,
  creating,
  onCreate,
  onCancel,
}: CreatePredictionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <div className="flex items-center gap-2">
          <span>Create Manual Prediction</span>
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800">
            <Pencil className="w-3 h-3" />
            Manual
          </span>
        </div>
      }
      description="Manually add a stock prediction to your strategy"
      size="lg"
    >
      <div className="space-y-6">
        {/* Strategy Selector - only show if coming from "All Strategies" */}
        {selectedStrategy === "all" && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Strategy</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Strategy *
              </label>
              <select
                value={dialogStrategy}
                onChange={(e) => onDialogStrategyChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="" disabled>
                  -- Select a strategy --
                </option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {/* Section 1: Stock & Entry */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Stock & Entry</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock Symbol *</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => onFormDataChange({ symbol: e.target.value.toUpperCase() })}
                placeholder="AAPL"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {loadingStockPrice && (
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  Loading...
                </div>
              )}
              {!loadingStockPrice && currentStockPrice !== null && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xs text-blue-600 font-medium">Current:</span>
                  <span className="text-sm font-semibold text-blue-900">
                    ${currentStockPrice.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onFormDataChange({ entryPrice: currentStockPrice.toFixed(2) });
                    }}
                    className="ml-2 text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    title="Use current price as entry price"
                  >
                    Use
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entry Price *</label>
              <input
                type="number"
                step="0.01"
                value={formData.entryPrice}
                onChange={(e) => onFormDataChange({ entryPrice: e.target.value })}
                placeholder={currentStockPrice ? currentStockPrice.toFixed(2) : "150.00"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {currentStockPrice && formData.entryPrice && (
                <p className="text-xs mt-1">
                  {(() => {
                    const entry = Number.parseFloat(formData.entryPrice);
                    const diff = entry - currentStockPrice;
                    const diffPct = (diff / currentStockPrice) * 100;
                    if (Math.abs(diff) < 0.01) {
                      return <span className="text-gray-500">Matches current price</span>;
                    }
                    return (
                      <span className={diff > 0 ? "text-red-600" : "text-green-600"}>
                        {diff > 0 ? "+" : ""}
                        {diffPct.toFixed(2)}% vs current ({diff > 0 ? "above" : "below"})
                      </span>
                    );
                  })()}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Allocated Amount *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.allocatedAmount}
                onChange={(e) => onFormDataChange({ allocatedAmount: e.target.value })}
                placeholder="1000.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {formData.entryPrice && formData.allocatedAmount && (
                <p className="text-xs text-gray-500 mt-1">
                  Shares:{" "}
                  {(
                    Number.parseFloat(formData.allocatedAmount) /
                    Number.parseFloat(formData.entryPrice)
                  ).toFixed(2)}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Price Targets */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Price Targets</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Price *</label>
              <input
                type="number"
                step="0.01"
                value={formData.targetPrice}
                onChange={(e) => onFormDataChange({ targetPrice: e.target.value })}
                placeholder="165.00"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  formData.entryPrice &&
                  formData.targetPrice &&
                  Number.parseFloat(formData.targetPrice) <= Number.parseFloat(formData.entryPrice)
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
              />
              {formData.entryPrice && formData.targetPrice && (
                <p
                  className={`text-xs mt-1 ${
                    Number.parseFloat(formData.targetPrice) > Number.parseFloat(formData.entryPrice)
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {Number.parseFloat(formData.targetPrice) > Number.parseFloat(formData.entryPrice)
                    ? `+${(
                        ((Number.parseFloat(formData.targetPrice) -
                          Number.parseFloat(formData.entryPrice)) /
                          Number.parseFloat(formData.entryPrice)) *
                          100
                      ).toFixed(2)}% gain`
                    : "Target must be higher than entry"}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stop Loss Price *
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.stopLossPrice}
                onChange={(e) => onFormDataChange({ stopLossPrice: e.target.value })}
                placeholder="145.00"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  formData.entryPrice &&
                  formData.stopLossPrice &&
                  Number.parseFloat(formData.stopLossPrice) >=
                    Number.parseFloat(formData.entryPrice)
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
              />
              {formData.entryPrice && formData.stopLossPrice && (
                <p
                  className={`text-xs mt-1 ${
                    Number.parseFloat(formData.stopLossPrice) <
                    Number.parseFloat(formData.entryPrice)
                      ? "text-red-600"
                      : "text-red-600"
                  }`}
                >
                  {Number.parseFloat(formData.stopLossPrice) <
                  Number.parseFloat(formData.entryPrice)
                    ? `-${(
                        ((Number.parseFloat(formData.entryPrice) -
                          Number.parseFloat(formData.stopLossPrice)) /
                          Number.parseFloat(formData.entryPrice)) *
                          100
                      ).toFixed(2)}% loss`
                    : "Stop loss must be lower than entry"}
                </p>
              )}
            </div>
          </div>

          {/* Real-time Risk/Reward Calculation */}
          {formData.entryPrice &&
            formData.targetPrice &&
            formData.stopLossPrice &&
            Number.parseFloat(formData.targetPrice) > Number.parseFloat(formData.entryPrice) &&
            Number.parseFloat(formData.stopLossPrice) < Number.parseFloat(formData.entryPrice) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-900 mb-1">Risk/Reward Ratio</p>
                <p className="text-lg font-semibold text-blue-900">
                  {(
                    (Number.parseFloat(formData.targetPrice) -
                      Number.parseFloat(formData.entryPrice)) /
                    (Number.parseFloat(formData.entryPrice) -
                      Number.parseFloat(formData.stopLossPrice))
                  ).toFixed(2)}
                  :1
                </p>
              </div>
            )}
        </section>

        {/* Section 3: Analysis */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Analysis</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sentiment Score (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={formData.sentimentScore}
                onChange={(e) => onFormDataChange({ sentimentScore: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Overall Score (1-10)
              </label>
              <input
                type="number"
                min="1"
                max="10"
                step="0.1"
                value={formData.overallScore}
                onChange={(e) => onFormDataChange({ overallScore: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Analysis Notes *
            </label>
            <textarea
              value={formData.technicalAnalysis}
              onChange={(e) => onFormDataChange({ technicalAnalysis: e.target.value })}
              placeholder="Enter your research, charts reviewed, indicators, etc."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Document your analysis, key indicators, and reasoning for this prediction
            </p>
          </div>
        </section>
      </div>

      <DialogFooter>
        <DialogButton variant="outline" onClick={onCancel}>
          Cancel
        </DialogButton>
        <DialogButton onClick={onCreate} disabled={creating}>
          {creating ? "Creating..." : "Create Prediction"}
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
