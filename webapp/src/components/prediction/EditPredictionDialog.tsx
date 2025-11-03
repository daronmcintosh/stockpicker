import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";
import type { RiskLevel } from "@/gen/stockpicker/v1/strategy_pb";
import { Pencil } from "lucide-react";
import { getPredictionSource } from "./predictionHelpers";

interface EditPredictionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingPrediction: Prediction | null;
  editFormData: {
    symbol: string;
    entryPrice: string;
    targetPrice: string;
    stopLossPrice: string;
    allocatedAmount: string;
    sentimentScore: string;
    overallScore: string;
    technicalAnalysis: string;
    timeHorizonDays: string;
    riskLevel: RiskLevel;
  };
  onEditFormDataChange: (data: Partial<typeof editFormData>) => void;
  editCurrentStockPrice: number | null;
  loadingEditStockPrice: boolean;
  updatingPrediction: boolean;
  onUpdate: () => Promise<void>;
  onCancel: () => void;
}

export function EditPredictionDialog({
  open,
  onOpenChange,
  editingPrediction,
  editFormData,
  onEditFormDataChange,
  editCurrentStockPrice,
  loadingEditStockPrice,
  updatingPrediction,
  onUpdate,
  onCancel,
}: EditPredictionDialogProps) {
  if (!editingPrediction) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        } else {
          onOpenChange(true);
        }
      }}
      title={
        <div className="flex items-center gap-2">
          <span>Edit Prediction</span>
          {getPredictionSource(editingPrediction) === "Manual" && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-blue-100 text-blue-800">
              <Pencil className="w-3 h-3" />
              Manual
            </span>
          )}
        </div>
      }
      description={`Editing ${editingPrediction.symbol || ""} prediction`}
      size="lg"
    >
      <div className="space-y-6">
        {/* Section 1: Stock & Entry */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Stock & Entry</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stock Symbol *</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editFormData.symbol}
                onChange={(e) => onEditFormDataChange({ symbol: e.target.value.toUpperCase() })}
                placeholder="AAPL"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {loadingEditStockPrice && (
                <div className="text-sm text-gray-500 flex items-center gap-1">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600" />
                  Loading...
                </div>
              )}
              {!loadingEditStockPrice && editCurrentStockPrice !== null && (
                <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-xs text-blue-600 font-medium">Current:</span>
                  <span className="text-sm font-semibold text-blue-900">
                    ${editCurrentStockPrice.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onEditFormDataChange({ entryPrice: editCurrentStockPrice.toFixed(2) });
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
                value={editFormData.entryPrice}
                onChange={(e) => onEditFormDataChange({ entryPrice: e.target.value })}
                placeholder={editCurrentStockPrice ? editCurrentStockPrice.toFixed(2) : "150.00"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {editCurrentStockPrice && editFormData.entryPrice && (
                <p className="text-xs mt-1">
                  {(() => {
                    const entry = Number.parseFloat(editFormData.entryPrice);
                    const diff = entry - editCurrentStockPrice;
                    const diffPct = (diff / editCurrentStockPrice) * 100;
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
                value={editFormData.allocatedAmount}
                onChange={(e) => onEditFormDataChange({ allocatedAmount: e.target.value })}
                placeholder="1000.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {editFormData.entryPrice && editFormData.allocatedAmount && (
                <p className="text-xs text-gray-500 mt-1">
                  Shares:{" "}
                  {(
                    Number.parseFloat(editFormData.allocatedAmount) /
                    Number.parseFloat(editFormData.entryPrice)
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
                value={editFormData.targetPrice}
                onChange={(e) => onEditFormDataChange({ targetPrice: e.target.value })}
                placeholder="165.00"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  editFormData.entryPrice &&
                  editFormData.targetPrice &&
                  Number.parseFloat(editFormData.targetPrice) <=
                    Number.parseFloat(editFormData.entryPrice)
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
              />
              {editFormData.entryPrice && editFormData.targetPrice && (
                <p
                  className={`text-xs mt-1 ${
                    Number.parseFloat(editFormData.targetPrice) >
                    Number.parseFloat(editFormData.entryPrice)
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {Number.parseFloat(editFormData.targetPrice) >
                  Number.parseFloat(editFormData.entryPrice)
                    ? `+${(
                        ((Number.parseFloat(editFormData.targetPrice) -
                          Number.parseFloat(editFormData.entryPrice)) /
                          Number.parseFloat(editFormData.entryPrice)) *
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
                value={editFormData.stopLossPrice}
                onChange={(e) => onEditFormDataChange({ stopLossPrice: e.target.value })}
                placeholder="145.00"
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  editFormData.entryPrice &&
                  editFormData.stopLossPrice &&
                  Number.parseFloat(editFormData.stopLossPrice) >=
                    Number.parseFloat(editFormData.entryPrice)
                    ? "border-red-300 bg-red-50"
                    : "border-gray-300"
                }`}
              />
              {editFormData.entryPrice && editFormData.stopLossPrice && (
                <p
                  className={`text-xs mt-1 ${
                    Number.parseFloat(editFormData.stopLossPrice) <
                    Number.parseFloat(editFormData.entryPrice)
                      ? "text-red-600"
                      : "text-red-600"
                  }`}
                >
                  {Number.parseFloat(editFormData.stopLossPrice) <
                  Number.parseFloat(editFormData.entryPrice)
                    ? `-${(
                        ((Number.parseFloat(editFormData.entryPrice) -
                          Number.parseFloat(editFormData.stopLossPrice)) /
                          Number.parseFloat(editFormData.entryPrice)) *
                          100
                      ).toFixed(2)}% loss`
                    : "Stop loss must be lower than entry"}
                </p>
              )}
            </div>
          </div>

          {/* Real-time Risk/Reward Calculation */}
          {editFormData.entryPrice &&
            editFormData.targetPrice &&
            editFormData.stopLossPrice &&
            Number.parseFloat(editFormData.targetPrice) >
              Number.parseFloat(editFormData.entryPrice) &&
            Number.parseFloat(editFormData.stopLossPrice) <
              Number.parseFloat(editFormData.entryPrice) && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-medium text-blue-900 mb-1">Risk/Reward Ratio</p>
                <p className="text-lg font-semibold text-blue-900">
                  {(
                    (Number.parseFloat(editFormData.targetPrice) -
                      Number.parseFloat(editFormData.entryPrice)) /
                    (Number.parseFloat(editFormData.entryPrice) -
                      Number.parseFloat(editFormData.stopLossPrice))
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
                value={editFormData.sentimentScore}
                onChange={(e) => onEditFormDataChange({ sentimentScore: e.target.value })}
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
                value={editFormData.overallScore}
                onChange={(e) => onEditFormDataChange({ overallScore: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Technical Analysis Notes *
            </label>
            <textarea
              value={editFormData.technicalAnalysis}
              onChange={(e) => onEditFormDataChange({ technicalAnalysis: e.target.value })}
              placeholder="Enter your research, charts reviewed, indicators, etc."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </section>
      </div>

      <DialogFooter>
        <DialogButton variant="outline" onClick={onCancel}>
          Cancel
        </DialogButton>
        <DialogButton onClick={onUpdate} disabled={updatingPrediction}>
          {updatingPrediction ? "Updating..." : "Update Prediction"}
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
