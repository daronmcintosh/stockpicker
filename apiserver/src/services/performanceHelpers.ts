import { type PredictionRow, db } from "../db.js";
import { LeaderboardTimeframe } from "../gen/stockpicker/v1/strategy_pb.js";

export interface UserPerformance {
  userId: string;
  totalPredictions: number;
  closedPredictions: number;
  wins: number;
  winRate: number; // percentage 0-100
  avgReturn: number; // average return percentage
  totalROI: number; // sum of all returns
  currentStreak: number; // consecutive wins
  bestPrediction: PredictionRow | null;
}

// Calculate user performance metrics
export async function calculatePerformance(
  userId: string,
  timeframe: LeaderboardTimeframe
): Promise<UserPerformance> {
  // Build query based on timeframe
  let whereClause = "WHERE user_id = ?";
  const params: (string | number)[] = [userId];

  if (timeframe === LeaderboardTimeframe.MONTHLY) {
    // Get start of current month (Unix timestamp)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startTimestamp = Math.floor(startOfMonth.getTime() / 1000);

    whereClause += " AND created_at >= ?";
    params.push(startTimestamp);
  }

  // Get all predictions for this user in the timeframe
  const predictions = await db.all<PredictionRow[]>(
    `SELECT * FROM predictions ${whereClause} ORDER BY created_at DESC`,
    ...params
  );

  // Calculate metrics
  const totalPredictions = predictions.length;

  // Closed predictions (HIT_TARGET, HIT_STOP, EXPIRED)
  const closedStatuses = [
    "PREDICTION_STATUS_HIT_TARGET",
    "PREDICTION_STATUS_HIT_STOP",
    "PREDICTION_STATUS_EXPIRED",
  ];
  const closed = predictions.filter((p) => closedStatuses.includes(p.status));
  const closedPredictions = closed.length;

  // Wins (HIT_TARGET)
  const wins = closed.filter((p) => p.status === "PREDICTION_STATUS_HIT_TARGET");
  const winCount = wins.length;

  // Win rate
  const winRate = closedPredictions > 0 ? (winCount / closedPredictions) * 100 : 0;

  // Average return
  const returnsSum = closed.reduce((sum, p) => sum + (p.current_return_pct || 0), 0);
  const avgReturn = closedPredictions > 0 ? returnsSum / closedPredictions : 0;

  // Total ROI
  const totalROI = returnsSum;

  // Current streak (consecutive wins from most recent closed predictions)
  let currentStreak = 0;
  const sortedClosed = closed.sort((a, b) => {
    const aTime = a.closed_at ? new Date(a.closed_at).getTime() : 0;
    const bTime = b.closed_at ? new Date(b.closed_at).getTime() : 0;
    return bTime - aTime; // Most recent first
  });

  for (const pred of sortedClosed) {
    if (pred.status === "PREDICTION_STATUS_HIT_TARGET") {
      currentStreak++;
    } else {
      break; // Streak broken
    }
  }

  // Best prediction (highest return)
  const bestPrediction =
    closed.length > 0
      ? closed.reduce((best, pred) =>
          (pred.current_return_pct || 0) > (best.current_return_pct || 0) ? pred : best
        )
      : null;

  return {
    userId,
    totalPredictions,
    closedPredictions,
    wins: winCount,
    winRate,
    avgReturn,
    totalROI,
    currentStreak,
    bestPrediction,
  };
}

// Calculate performance score for leaderboard ranking
// Formula: (win_rate * 0.4) + (avg_return * 0.3) + (log(total_trades) * 10 * 0.2) + (streak * 0.1)
export function calculatePerformanceScore(perf: UserPerformance): number {
  const winRateComponent = perf.winRate * 0.4;
  const avgReturnComponent = perf.avgReturn * 0.3;
  const tradesComponent = Math.log10(perf.totalPredictions + 1) * 10 * 0.2;
  const streakComponent = perf.currentStreak * 0.1;

  return winRateComponent + avgReturnComponent + tradesComponent + streakComponent;
}

// Get all user IDs (for global leaderboard)
export async function getAllUserIds(): Promise<string[]> {
  const users = await db.all<{ id: string }[]>("SELECT id FROM users");
  return users.map((u) => u.id);
}
