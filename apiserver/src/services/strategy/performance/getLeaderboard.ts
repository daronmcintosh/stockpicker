import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import type {
  GetLeaderboardRequest,
  GetLeaderboardResponse,
  LeaderboardEntry,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import {
  GetLeaderboardResponseSchema,
  LeaderboardEntrySchema,
  LeaderboardScope,
  LeaderboardTimeframe,
  UserPerformanceSchema,
  UserSchema,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { getLeaderboard as getLeaderboardData } from "../../leaderboardHelpers.js";
import { dbRowToProtoPrediction } from "../../prediction/index.js";

export async function getLeaderboard(
  req: GetLeaderboardRequest,
  context: HandlerContext
): Promise<GetLeaderboardResponse> {
  try {
    const currentUserId = getCurrentUserId(context);

    if (!currentUserId) {
      throw new ConnectError("Authentication required to view leaderboard", Code.Unauthenticated);
    }

    // Get request parameters with defaults
    const timeframe = req.timeframe || LeaderboardTimeframe.ALL_TIME;
    const scope = req.scope || LeaderboardScope.GLOBAL;
    const limit = req.limit || 50;
    const offset = req.offset || 0;

    // Get leaderboard data
    const leaderboardResult = await getLeaderboardData(
      currentUserId,
      timeframe,
      scope,
      limit,
      offset
    );

    // Convert entries to proto format
    const protoEntries = await Promise.all(
      leaderboardResult.entries.map(async (entry) => {
        // Convert user
        const protoUser = create(UserSchema, {
          id: entry.user.id,
          email: entry.user.email,
          username: entry.user.username,
          displayName: entry.user.display_name ?? "",
          avatarUrl: entry.user.avatar_url ?? "",
          createdAt: timestampFromDate(new Date(entry.user.created_at)),
          updatedAt: timestampFromDate(new Date(entry.user.updated_at)),
        });

        // Convert performance
        const protoPerformance = create(UserPerformanceSchema, {
          userId: entry.performance.userId,
          totalPredictions: entry.performance.totalPredictions,
          closedPredictions: entry.performance.closedPredictions,
          wins: entry.performance.wins,
          winRate: entry.performance.winRate,
          avgReturn: entry.performance.avgReturn,
          totalRoi: entry.performance.totalROI,
          currentStreak: entry.performance.currentStreak,
          bestPrediction: entry.performance.bestPrediction
            ? await dbRowToProtoPrediction(entry.performance.bestPrediction)
            : undefined,
        });

        return create(LeaderboardEntrySchema, {
          rank: entry.rank,
          user: protoUser,
          performanceScore: entry.performanceScore,
          performance: protoPerformance,
        });
      })
    );

    // Convert current user entry if present
    let currentUserEntry: LeaderboardEntry | undefined;
    if (leaderboardResult.currentUserEntry) {
      const entry = leaderboardResult.currentUserEntry;
      const protoUser = create(UserSchema, {
        id: entry.user.id,
        email: entry.user.email,
        username: entry.user.username,
        displayName: entry.user.display_name ?? "",
        avatarUrl: entry.user.avatar_url ?? "",
        createdAt: timestampFromDate(new Date(entry.user.created_at)),
        updatedAt: timestampFromDate(new Date(entry.user.updated_at)),
      });

      const protoPerformance = create(UserPerformanceSchema, {
        userId: entry.performance.userId,
        totalPredictions: entry.performance.totalPredictions,
        closedPredictions: entry.performance.closedPredictions,
        wins: entry.performance.wins,
        winRate: entry.performance.winRate,
        avgReturn: entry.performance.avgReturn,
        totalRoi: entry.performance.totalROI,
        currentStreak: entry.performance.currentStreak,
        bestPrediction: entry.performance.bestPrediction
          ? await dbRowToProtoPrediction(entry.performance.bestPrediction)
          : undefined,
      });

      currentUserEntry = create(LeaderboardEntrySchema, {
        rank: entry.rank,
        user: protoUser,
        performanceScore: entry.performanceScore,
        performance: protoPerformance,
      });
    }

    return create(GetLeaderboardResponseSchema, {
      entries: protoEntries,
      totalCount: leaderboardResult.totalCount,
      currentUserEntry,
    });
  } catch (error) {
    console.error("❌ Error getting leaderboard:", error);
    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(error instanceof Error ? error.message : String(error), Code.Internal);
  }
}
