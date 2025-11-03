import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  GetCurrentUserRequest,
  GetCurrentUserResponse,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { GetCurrentUserResponseSchema, UserSchema } from "../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId, getUserById } from "../authHelpers.js";

export async function getCurrentUser(
  _req: GetCurrentUserRequest,
  context: HandlerContext
): Promise<GetCurrentUserResponse> {
  try {
    const userId = getCurrentUserId(context);

    if (!userId) {
      return create(GetCurrentUserResponseSchema, {
        user: undefined,
      });
    }

    const user = await getUserById(userId);

    if (!user) {
      return create(GetCurrentUserResponseSchema, {
        user: undefined,
      });
    }

    const protoUser = create(UserSchema, {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name || "",
      avatarUrl: user.avatar_url || "",
      createdAt: timestampFromDate(new Date(user.created_at)),
      updatedAt: timestampFromDate(new Date(user.updated_at)),
    });

    return create(GetCurrentUserResponseSchema, {
      user: protoUser,
    });
  } catch (error) {
    console.error("❌ Error getting current user:", error);
    return create(GetCurrentUserResponseSchema, {
      user: undefined,
    });
  }
}
