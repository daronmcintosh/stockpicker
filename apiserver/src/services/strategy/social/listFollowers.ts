import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  ListFollowersRequest,
  ListFollowersResponse,
  User,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import {
  ListFollowersResponseSchema,
  UserSchema,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { getFollowers } from "../../socialHelpers.js";

export async function listFollowers(
  req: ListFollowersRequest,
  context: HandlerContext
): Promise<ListFollowersResponse> {
  try {
    const currentUserId = getCurrentUserId(context);
    if (!currentUserId) {
      throw new Error("Authentication required");
    }

    // Use provided user_id or default to current user
    const targetUserId = req.userId || currentUserId;

    const userRows = await getFollowers(targetUserId);

    const users: User[] = await Promise.all(
      userRows.map(async (row) => {
        return create(UserSchema, {
          id: row.id,
          email: row.email,
          username: row.username,
          displayName: row.display_name ?? "",
          avatarUrl: row.avatar_url ?? "",
          createdAt: timestampFromDate(new Date(row.created_at)),
          updatedAt: timestampFromDate(new Date(row.updated_at)),
        });
      })
    );

    return create(ListFollowersResponseSchema, { users });
  } catch (error) {
    console.error("❌ Error listing followers:", error);
    throw error;
  }
}
