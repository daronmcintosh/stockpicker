import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { RiskLevel } from "@/gen/stockpicker/v1/strategy_pb";
import { useEffect, useState } from "react";
import { DEFAULT_SOURCE_CONFIG, type SourceConfig, SourceConfigEditor } from "./SourceConfigEditor";

interface EditStrategyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategy: Strategy | null;
  onUpdate: (strategy: Strategy, formData: EditFormData) => Promise<void>;
  updating: boolean;
  sourceConfig?: SourceConfig; // Optional source config from backend
}

export interface EditFormData {
  name: string;
  description: string;
  customPrompt: string;
  timeHorizon: string;
  targetReturnPct: string;
  riskLevel: RiskLevel;
  maxUniqueStocks: string;
  sourceConfig?: SourceConfig;
}

export function EditStrategyDialog({
  open,
  onOpenChange,
  strategy,
  onUpdate,
  updating,
  sourceConfig: initialSourceConfig,
}: EditStrategyDialogProps) {
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: "",
    description: "",
    customPrompt: "",
    timeHorizon: "",
    targetReturnPct: "",
    riskLevel: RiskLevel.MEDIUM,
    maxUniqueStocks: "",
    sourceConfig: DEFAULT_SOURCE_CONFIG,
  });

  useEffect(() => {
    if (strategy) {
      setEditFormData({
        name: strategy.name,
        description: strategy.description || "",
        customPrompt: strategy.customPrompt || "",
        timeHorizon: strategy.timeHorizon || "3 months",
        targetReturnPct: strategy.targetReturnPct.toString(),
        riskLevel: strategy.riskLevel,
        maxUniqueStocks: strategy.maxUniqueStocks.toString(),
        sourceConfig: initialSourceConfig || DEFAULT_SOURCE_CONFIG,
      });
    }
  }, [strategy, initialSourceConfig]);

  if (!strategy) {
    return null;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          onOpenChange(false);
        }
      }}
      title="Edit Strategy"
      description={strategy.name || ""}
      size="lg"
    >
      <div className="space-y-6">
        {/* Basic Information */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Basic Information</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Strategy Name *</label>
            <input
              type="text"
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </section>

        {/* Trading Configuration */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
            Trading Configuration
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Horizon *</label>
              <select
                value={editFormData.timeHorizon}
                onChange={(e) => setEditFormData({ ...editFormData, timeHorizon: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="1 week">1 Week</option>
                <option value="2 weeks">2 Weeks</option>
                <option value="1 month">1 Month</option>
                <option value="3 months">3 Months</option>
                <option value="6 months">6 Months</option>
                <option value="1 year">1 Year</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Return (%) *
              </label>
              <input
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={editFormData.targetReturnPct}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, targetReturnPct: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Risk Level *</label>
              <select
                value={editFormData.riskLevel}
                onChange={(e) =>
                  setEditFormData({
                    ...editFormData,
                    riskLevel: Number(e.target.value) as RiskLevel,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value={RiskLevel.LOW}>Low (Conservative)</option>
                <option value={RiskLevel.MEDIUM}>Medium (Balanced)</option>
                <option value={RiskLevel.HIGH}>High (Aggressive)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Unique Stocks *
              </label>
              <input
                type="number"
                min="3"
                max="50"
                value={editFormData.maxUniqueStocks}
                onChange={(e) =>
                  setEditFormData({ ...editFormData, maxUniqueStocks: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </section>

        {/* Data Sources */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Data Sources</h3>
          <SourceConfigEditor
            config={editFormData.sourceConfig || DEFAULT_SOURCE_CONFIG}
            onChange={(config) => setEditFormData({ ...editFormData, sourceConfig: config })}
          />
        </section>

        {/* Advanced Settings */}
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Advanced Settings</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Custom Analysis Prompt
            </label>
            <textarea
              value={editFormData.customPrompt}
              onChange={(e) => setEditFormData({ ...editFormData, customPrompt: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Focus on AI and cloud computing stocks, avoid recent IPOs, prefer companies with positive earnings"
            />
          </div>
        </section>
      </div>

      <DialogFooter>
        <DialogButton variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </DialogButton>
        <DialogButton
          onClick={() => strategy && onUpdate(strategy, editFormData)}
          disabled={updating}
        >
          {updating ? "Updating..." : "Update Strategy"}
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
