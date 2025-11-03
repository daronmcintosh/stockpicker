import { Dialog, DialogButton, DialogFooter } from "@/components/ui/Dialog";
import type { Prediction } from "@/gen/stockpicker/v1/strategy_pb";

interface DeletePredictionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prediction: Prediction;
  onDelete: () => Promise<void>;
}

export function DeletePredictionDialog({
  open,
  onOpenChange,
  prediction,
  onDelete,
}: DeletePredictionDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete Prediction"
      description={`Are you sure you want to delete the prediction for ${prediction.symbol}? This action cannot be undone.`}
    >
      <DialogFooter>
        <DialogButton variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </DialogButton>
        <DialogButton onClick={onDelete} className="bg-red-600 text-white hover:bg-red-700">
          Delete
        </DialogButton>
      </DialogFooter>
    </Dialog>
  );
}
