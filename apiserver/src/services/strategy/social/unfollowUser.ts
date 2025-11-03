import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  UnfollowUserRequest,
  UnfollowUserResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { UnfollowUserResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { unfollowUser as unfollowUserHelper } from "../../socialHelpers.js";

export async function unfollowUser(
  req: UnfollowUserRequest,
  context: HandlerContext
): Promise<UnfollowUserResponse> {
  try {
    const userId = getCurrentUserId(context);
    if (!userId) {
      throw new Error("Authentication required");
    }

    if (!req.userId) {
      throw new Error("User ID is required");
    }

    await unfollowUserHelper(userId, req.userId);
    console.log(`✅ User ${userId} unfollowed user ${req.userId}`);
    return create(UnfollowUserResponseSchema, { success: true });
  } catch (error) {
    console.error("❌ Error unfollowing user:", error);
    throw error;
  }
}
