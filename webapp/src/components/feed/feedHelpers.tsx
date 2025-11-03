import { PredictionStatus, RiskLevel, StrategyStatus } from "@/gen/stockpicker/v1/strategy_pb";

export function formatDate(timestamp: { seconds: bigint } | undefined) {
  if (!timestamp) return "—";
  const date = new Date(Number(timestamp.seconds) * 1000);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function getStatusBadge(status: PredictionStatus) {
  const statusMap = {
    [PredictionStatus.ACTIVE]: { label: "Active", className: "bg-blue-100 text-blue-800" },
    [PredictionStatus.HIT_TARGET]: {
      label: "Hit Target",
      className: "bg-green-100 text-green-800",
    },
    [PredictionStatus.HIT_STOP]: { label: "Hit Stop", className: "bg-red-100 text-red-800" },
    [PredictionStatus.EXPIRED]: { label: "Expired", className: "bg-gray-100 text-gray-800" },
  };
  const config = statusMap[status as keyof typeof statusMap] || {
    label: "Unknown",
    className: "bg-gray-100",
  };
  return (
    <span className={`px-2 py-1 text-xs rounded-full font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

export function getStrategyStatusBadge(status: StrategyStatus) {
  const statusMap = {
    [StrategyStatus.ACTIVE]: { label: "Active", className: "bg-green-100 text-green-800" },
    [StrategyStatus.PAUSED]: { label: "Paused", className: "bg-yellow-100 text-yellow-800" },
    [StrategyStatus.STOPPED]: { label: "Stopped", className: "bg-gray-100 text-gray-800" },
  };
  const config = statusMap[status as keyof typeof statusMap] || {
    label: "Unknown",
    className: "bg-gray-100",
  };
  return (
    <span className={`px-2 py-1 text-xs rounded-full font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

export function getRiskLevelLabel(riskLevel: RiskLevel) {
  switch (riskLevel) {
    case RiskLevel.LOW:
      return "Low";
    case RiskLevel.MEDIUM:
      return "Medium";
    case RiskLevel.HIGH:
      return "High";
    default:
      return "Unspecified";
  }
}

export function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function calculateReturn(prediction: {
  currentPrice?: number | null;
  entryPrice: number;
}): number | null {
  if (prediction.currentPrice && prediction.currentPrice > 0) {
    const returnPct =
      ((prediction.currentPrice - prediction.entryPrice) / prediction.entryPrice) * 100;
    return returnPct;
  }
  return null;
}
