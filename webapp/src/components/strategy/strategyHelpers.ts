import { Frequency, RiskLevel } from "@/gen/stockpicker/v1/strategy_pb";

export function getFrequencyLabel(frequency: Frequency): string {
  switch (frequency) {
    case Frequency.DAILY:
      return "Daily";
    case Frequency.TWICE_WEEKLY:
      return "Twice Weekly";
    case Frequency.WEEKLY:
      return "Weekly";
    case Frequency.BIWEEKLY:
      return "Biweekly";
    case Frequency.MONTHLY:
      return "Monthly";
    default:
      return "Unspecified";
  }
}

export function getRiskLevelLabel(riskLevel: RiskLevel): string {
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
