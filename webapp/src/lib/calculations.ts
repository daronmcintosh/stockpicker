/**
 * Centralized calculation functions for financial metrics
 * This is the SINGLE SOURCE OF TRUTH for all value calculations displayed to users
 */

import { toNumber } from "@/components/prediction/predictionHelpers";
import type { Prediction, Strategy } from "@/gen/stockpicker/v1/strategy_pb";
import { PredictionAction, PredictionStatus } from "@/gen/stockpicker/v1/strategy_pb";

/**
 * Budget calculation results
 */
export interface BudgetCalculation {
  /** Total monthly budget across all strategies */
  totalBudget: number;
  /** Total amount spent this month (sum of allocatedAmount for entered predictions in current month) */
  totalSpent: number;
  /** Remaining budget available */
  remainingBudget: number;
  /** Budget utilization percentage (0-100) */
  utilizationPct: number;
}

/**
 * Calculate total budget metrics across all strategies
 * Budget spent = sum of allocatedAmount for predictions where action='entered'
 * (Note: This should match server-side calculation in workflowHandlers.ts)
 */
export function calculateBudget(
  strategies: Strategy[],
  predictions: Prediction[]
): BudgetCalculation {
  const totalBudget = strategies.reduce((sum, s) => sum + toNumber(s.monthlyBudget), 0);

  // Calculate spent from predictions where action='entered'
  // Filter by current month predictions only
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const totalSpent = predictions
    .filter((p) => {
      // Only count predictions that are entered
      if (p.action !== PredictionAction.ENTERED) return false;

      // Filter by current month (optional - can be removed if we want all-time spent)
      if (p.createdAt) {
        const createdDate = new Date(Number(p.createdAt.seconds) * 1000);
        if (createdDate.getMonth() !== currentMonth || createdDate.getFullYear() !== currentYear) {
          return false;
        }
      }

      return true;
    })
    .reduce((sum, p) => sum + toNumber(p.allocatedAmount), 0);

  const remainingBudget = Math.max(0, totalBudget - totalSpent);
  const utilizationPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return {
    totalBudget,
    totalSpent,
    remainingBudget,
    utilizationPct,
  };
}

/**
 * Position calculation results
 */
export interface PositionCalculation {
  /** Current market value of the position */
  currentValue: number;
  /** Entry cost (allocated amount) */
  entryCost: number;
  /** Unrealized P/L (current value - entry cost) */
  unrealizedPl: number;
  /** Unrealized return percentage */
  unrealizedReturnPct: number;
}

/**
 * Calculate position value for a single prediction
 */
export function calculatePositionValue(
  prediction: Prediction,
  currentPrice?: number
): PositionCalculation {
  const entryCost = toNumber(prediction.allocatedAmount);
  const entryPrice = toNumber(prediction.entryPrice);

  // Use provided currentPrice, or fallback to stored currentPrice, or entry price
  const price = currentPrice ?? toNumber(prediction.currentPrice) ?? entryPrice;

  // Calculate return percentage
  let returnPct = 0;
  if (entryPrice > 0) {
    returnPct = ((price - entryPrice) / entryPrice) * 100;
  }

  // Current value = entry cost * (1 + return %)
  const currentValue = entryCost * (1 + returnPct / 100);
  const unrealizedPl = currentValue - entryCost;

  return {
    currentValue,
    entryCost,
    unrealizedPl,
    unrealizedReturnPct: returnPct,
  };
}

/**
 * Account value calculation results
 */
export interface AccountValueCalculation {
  /** Total account value = active positions MTM + remaining cash budget */
  totalAccountValue: number;
  /** Total current market value of all active positions (entered predictions) */
  activePositionsValue: number;
  /** Total entry cost of active positions */
  activePositionsEntryCost: number;
  /** Total unrealized P/L across all active positions */
  totalUnrealizedPl: number;
  /** Total unrealized return percentage (weighted average) */
  totalUnrealizedReturnPct: number;
  /** Remaining cash budget (from budget calculation) */
  remainingCashBudget: number;
}

/**
 * Calculate total account value and position metrics
 * Account Value = Active Positions Current Market Value + Remaining Cash Budget
 *
 * Active Positions = predictions where:
 * - action = 'entered' (user has entered this prediction)
 * - status = 'active' (position is still open)
 */
export function calculateAccountValue(
  _strategies: Strategy[],
  predictions: Prediction[],
  currentPrices: Record<string, number>,
  budget: BudgetCalculation
): AccountValueCalculation {
  // Get active positions (entered and active predictions)
  const activePositions = predictions.filter(
    (p) => p.action === PredictionAction.ENTERED && p.status === PredictionStatus.ACTIVE
  );

  let activePositionsValue = 0;
  let activePositionsEntryCost = 0;
  let totalUnrealizedPl = 0;

  // Calculate position values
  for (const position of activePositions) {
    const posCalc = calculatePositionValue(position, currentPrices[position.symbol]);
    activePositionsValue += posCalc.currentValue;
    activePositionsEntryCost += posCalc.entryCost;
    totalUnrealizedPl += posCalc.unrealizedPl;
  }

  // Calculate weighted average return percentage
  const totalUnrealizedReturnPct =
    activePositionsEntryCost > 0 ? (totalUnrealizedPl / activePositionsEntryCost) * 100 : 0;

  // Total account value = active positions MTM + remaining cash budget
  const totalAccountValue = activePositionsValue + budget.remainingBudget;

  return {
    totalAccountValue,
    activePositionsValue,
    activePositionsEntryCost,
    totalUnrealizedPl,
    totalUnrealizedReturnPct,
    remainingCashBudget: budget.remainingBudget,
  };
}

/**
 * Performance metrics calculation results
 */
export interface PerformanceCalculation {
  /** Win rate (hits / total closed) as percentage */
  hitRate: number;
  /** Average return percentage across closed predictions */
  averageReturn: number;
  /** Total realized P/L from closed predictions */
  totalRealizedPl: number;
  /** Number of closed predictions */
  closedCount: number;
  /** Number of winning predictions */
  wins: number;
  /** Number of losing predictions */
  losses: number;
  /** Win/loss ratio */
  winLossRatio: number;
  /** Best return percentage */
  bestReturn: number;
  /** Worst return percentage */
  worstReturn: number;
}

/**
 * Calculate performance metrics from closed predictions
 */
export function calculatePerformance(predictions: Prediction[]): PerformanceCalculation {
  // Filter to closed predictions (hit target, hit stop, expired)
  const closed = predictions.filter(
    (p) =>
      p.status === PredictionStatus.HIT_TARGET ||
      p.status === PredictionStatus.HIT_STOP ||
      p.status === PredictionStatus.EXPIRED
  );

  const closedCount = closed.length;
  const wins = closed.filter((p) => p.status === PredictionStatus.HIT_TARGET).length;
  const losses = closedCount - wins;

  // Calculate realized P/L and returns
  let totalRealizedPl = 0;
  const returns: number[] = [];

  for (const pred of closed) {
    const entryCost = toNumber(pred.allocatedAmount);
    const returnPct = toNumber(pred.currentReturnPct ?? 0);
    const realizedPl = entryCost * (returnPct / 100);
    totalRealizedPl += realizedPl;
    returns.push(returnPct);
  }

  const hitRate = closedCount > 0 ? (wins / closedCount) * 100 : 0;
  const averageReturn =
    returns.length > 0 ? returns.reduce((sum, r) => sum + r, 0) / returns.length : 0;
  const winLossRatio = losses > 0 ? wins / losses : wins > 0 ? wins : 0;
  const bestReturn = returns.length > 0 ? Math.max(...returns) : 0;
  const worstReturn = returns.length > 0 ? Math.min(...returns) : 0;

  return {
    hitRate,
    averageReturn,
    totalRealizedPl,
    closedCount,
    wins,
    losses,
    winLossRatio,
    bestReturn,
    worstReturn,
  };
}
