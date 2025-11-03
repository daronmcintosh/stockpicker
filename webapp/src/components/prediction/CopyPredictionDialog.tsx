import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";

interface CopyPredictionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prediction: Prediction;
  strategies: Array<{ id: string; name: string }>;
  copyTargetStrategy: string;
  onCopyTargetStrategyChange: (strategy: string) => void;
  onCopy: () => Promise<void>;
  isCopying: boolean;
}

export function CopyPredictionDialog({
  open,
  onOpenChange,
  prediction,
  strategies,
  copyTargetStrategy,
  onCopyTargetStrategyChange,
  onCopy,
  isCopying,
}: CopyPredictionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Copy Prediction"
      description={`Copy ${prediction.symbol} prediction to another strategy`}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select Target Strategy *
          </label>
          <select
            value={copyTargetStrategy}
            onChange={(e) => onCopyTargetStrategyChange(e.target.value)}
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
      </div>
      <DialogFooter>
        <DialogButton variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </DialogButton>
        <DialogButton onClick={onCopy} disabled={isCopying || !copyTargetStrategy}>
          {isCopying ? "Copying..." : "Copy Prediction"}
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
