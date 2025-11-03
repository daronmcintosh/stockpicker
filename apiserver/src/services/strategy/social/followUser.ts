import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  FollowUserRequest,
  FollowUserResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { FollowUserResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { followUser as followUserHelper } from "../../socialHelpers.js";

export async function followUser(
  req: FollowUserRequest,
  context: HandlerContext
): Promise<FollowUserResponse> {
  try {
    const userId = getCurrentUserId(context);
    if (!userId) {
      throw new Error("Authentication required");
    }

    if (!req.userId) {
      throw new Error("User ID is required");
    }

    await followUserHelper(userId, req.userId);
    console.log(`✅ User ${userId} followed user ${req.userId}`);
    return create(FollowUserResponseSchema, { success: true });
  } catch (error) {
    console.error("❌ Error following user:", error);
    throw error;
  }
}
