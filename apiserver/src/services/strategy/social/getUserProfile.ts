import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  GetUserProfileRequest,
  GetUserProfileResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import {
  GetUserProfileResponseSchema,
  LeaderboardTimeframe,
  UserPerformanceSchema,
  UserSchema,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId, getUserByUsername } from "../../authHelpers.js";
import { type UserPerformance, calculatePerformance } from "../../performanceHelpers.js";
import { dbRowToProtoPrediction } from "../../prediction/index.js";
import {
  isCloseFriend as isCloseFriendHelper,
  isFollowing as isFollowingHelper,
} from "../../socialHelpers.js";

export async function getUserProfile(
  req: GetUserProfileRequest,
  context: HandlerContext
): Promise<GetUserProfileResponse> {
  try {
    const currentUserId = getCurrentUserId(context);

    if (!req.username) {
      throw new Error("Username is required");
    }

    const targetUser = await getUserByUsername(req.username);
    if (!targetUser) {
      throw new Error(`User not found: ${req.username}`);
    }

    // Build relationship flags (only if current user is authenticated)
    let isFollowing = false;
    let isFollowedBy = false;
    let isCloseFriend = false;

    if (currentUserId) {
      isFollowing = await isFollowingHelper(currentUserId, targetUser.id);
      isFollowedBy = await isFollowingHelper(targetUser.id, currentUserId);
      isCloseFriend = await isCloseFriendHelper(currentUserId, targetUser.id);
    }

    // Get user performance (all-time)
    const perf = await calculatePerformance(targetUser.id, LeaderboardTimeframe.ALL_TIME);

    // Convert performance to proto
    const protoPerformance = create(UserPerformanceSchema, {
      userId: perf.userId,
      totalPredictions: perf.totalPredictions,
      closedPredictions: perf.closedPredictions,
      wins: perf.wins,
      winRate: perf.winRate,
      avgReturn: perf.avgReturn,
      totalRoi: perf.totalROI,
      currentStreak: perf.currentStreak,
      bestPrediction: perf.bestPrediction
        ? await dbRowToProtoPrediction(perf.bestPrediction)
        : undefined,
    });

    // Convert user to proto
    const protoUser = create(UserSchema, {
      id: targetUser.id,
      email: targetUser.email,
      username: targetUser.username,
      displayName: targetUser.display_name ?? "",
      avatarUrl: targetUser.avatar_url ?? "",
      createdAt: timestampFromDate(new Date(targetUser.created_at)),
      updatedAt: timestampFromDate(new Date(targetUser.updated_at)),
    });

    return create(GetUserProfileResponseSchema, {
      user: protoUser,
      isFollowing,
      isFollowedBy,
      isCloseFriend,
      performance: protoPerformance,
    });
  } catch (error) {
    console.error("❌ Error getting user profile:", error);
    throw error;
  }
}
