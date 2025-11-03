import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  ListFollowingRequest,
  ListFollowingResponse,
  User,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import {
  ListFollowingResponseSchema,
  UserSchema,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { getFollowing } from "../../socialHelpers.js";

export async function listFollowing(
  req: ListFollowingRequest,
  context: HandlerContext
): Promise<ListFollowingResponse> {
  try {
    const currentUserId = getCurrentUserId(context);
    if (!currentUserId) {
      throw new Error("Authentication required");
    }

    // Use provided user_id or default to current user
    const targetUserId = req.userId || currentUserId;

    const userRows = await getFollowing(targetUserId);

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

    return create(ListFollowingResponseSchema, { users });
  } catch (error) {
    console.error("❌ Error listing following:", error);
    throw error;
  }
}
