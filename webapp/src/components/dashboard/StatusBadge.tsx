import { StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";

interface StatusBadgeProps {
  status: StrategyStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    [StrategyStatus.ACTIVE]: {
      label: "Active",
      className: "bg-green-100 text-green-800",
    },
    [StrategyStatus.PAUSED]: {
      label: "Paused",
      className: "bg-yellow-100 text-yellow-800",
    },
    [StrategyStatus.STOPPED]: {
      label: "Stopped",
      className: "bg-red-100 text-red-800",
    },
    [StrategyStatus.UNSPECIFIED]: {
      label: "Unknown",
      className: "bg-gray-100 text-gray-800",
    },
  };

  const config = statusConfig[status] || statusConfig[StrategyStatus.UNSPECIFIED];

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${config.className}`}>
      {config.label}
    </span>
  );
}
