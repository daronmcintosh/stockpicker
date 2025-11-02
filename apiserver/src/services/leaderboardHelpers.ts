import { LeaderboardScope, type LeaderboardTimeframe } from "../gen/stockpicker/v1/strategy_pb.js";
import { type UserRow, getUserById } from "./authHelpers.js";
import {
  type UserPerformance,
  calculatePerformance,
  calculatePerformanceScore,
  getAllUserIds,
} from "./performanceHelpers.js";
import { getCloseFriendsUserIds, getFollowingUserIds } from "./socialHelpers.js";

export interface LeaderboardEntry {
  rank: number;
  user: UserRow;
  performanceScore: number;
  performance: UserPerformance;
}

export interface LeaderboardResult {
  entries: LeaderboardEntry[];
  totalCount: number;
  currentUserEntry: LeaderboardEntry | null;
}

// Get leaderboard entries
export async function getLeaderboard(
  currentUserId: string,
  timeframe: LeaderboardTimeframe,
  scope: LeaderboardScope,
  limit = 50,
  offset = 0
): Promise<LeaderboardResult> {
  // Get user IDs based on scope
  let userIds: string[];

  switch (scope) {
    case LeaderboardScope.GLOBAL:
      userIds = await getAllUserIds();
      break;

    case LeaderboardScope.FOLLOWING:
      userIds = await getFollowingUserIds(currentUserId);
      // Include current user
      if (!userIds.includes(currentUserId)) {
        userIds.push(currentUserId);
      }
      break;

    case LeaderboardScope.CLOSE_FRIENDS:
      userIds = await getCloseFriendsUserIds(currentUserId);
      // Include current user
      if (!userIds.includes(currentUserId)) {
        userIds.push(currentUserId);
      }
      break;

    default:
      userIds = await getAllUserIds();
  }

  // Calculate performance for each user
  const entries: LeaderboardEntry[] = [];

  for (const userId of userIds) {
    const user = await getUserById(userId);
    if (!user) continue;

    const performance = await calculatePerformance(userId, timeframe);
    const performanceScore = calculatePerformanceScore(performance);

    entries.push({
      rank: 0, // Will be set after sorting
      user,
      performanceScore,
      performance,
    });
  }

  // Sort by performance score (descending)
  entries.sort((a, b) => b.performanceScore - a.performanceScore);

  // Assign ranks
  entries.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  // Find current user's entry
  const currentUserEntry = entries.find((e) => e.user.id === currentUserId) || null;

  // Paginate
  const paginatedEntries = entries.slice(offset, offset + limit);

  return {
    entries: paginatedEntries,
    totalCount: entries.length,
    currentUserEntry,
  };
}
