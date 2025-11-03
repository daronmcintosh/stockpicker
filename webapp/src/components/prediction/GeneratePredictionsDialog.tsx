import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Strategy } from "@/gen/stockpicker/v1/strategy_pb";

interface GeneratePredictionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategies: Array<{ id: string; name: string }>;
  dialogStrategy: string;
  onDialogStrategyChange: (strategy: string) => void;
  triggeringStrategy: string | null;
  onGenerate: () => Promise<void>;
}

export function GeneratePredictionsDialog({
  open,
  onOpenChange,
  strategies,
  dialogStrategy,
  onDialogStrategyChange,
  triggeringStrategy,
  onGenerate,
}: GeneratePredictionsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate Predictions"
      description="Select a strategy to generate AI-powered predictions for."
    >
      <div className="space-y-4 pt-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Strategy *</label>
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
      </div>
      <DialogFooter>
        <DialogButton variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </DialogButton>
        <DialogButton
          onClick={onGenerate}
          disabled={!dialogStrategy || triggeringStrategy !== null}
        >
          {triggeringStrategy ? "Generating..." : "Generate"}
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
