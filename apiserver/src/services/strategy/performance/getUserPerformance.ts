import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import type {
  GetUserPerformanceRequest,
  GetUserPerformanceResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import {
  GetUserPerformanceResponseSchema,
  LeaderboardTimeframe,
  UserPerformanceSchema,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { type UserPerformance, calculatePerformance } from "../../performanceHelpers.js";
import { dbRowToProtoPrediction } from "../../prediction/index.js";

export async function getUserPerformance(
  req: GetUserPerformanceRequest,
  context: HandlerContext
): Promise<GetUserPerformanceResponse> {
  try {
    const currentUserId = getCurrentUserId(context);

    // Determine which user's performance to get
    const targetUserId = req.userId || currentUserId;

    if (!targetUserId) {
      throw new ConnectError(
        "Authentication required or user_id must be provided",
        Code.Unauthenticated
      );
    }

    // Get timeframe, default to ALL_TIME
    const timeframe = req.timeframe || LeaderboardTimeframe.ALL_TIME;

    // Calculate performance
    const perf = await calculatePerformance(targetUserId, timeframe);

    // Convert to proto format
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

    return create(GetUserPerformanceResponseSchema, {
      performance: protoPerformance,
    });
  } catch (error) {
    console.error("❌ Error getting user performance:", error);
    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(error instanceof Error ? error.message : String(error), Code.Internal);
  }
}
