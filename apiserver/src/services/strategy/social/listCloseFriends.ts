import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import type {
  ListCloseFriendsRequest,
  ListCloseFriendsResponse,
  User,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import {
  ListCloseFriendsResponseSchema,
  UserSchema,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { getCloseFriends } from "../../socialHelpers.js";

export async function listCloseFriends(
  _req: ListCloseFriendsRequest,
  context: HandlerContext
): Promise<ListCloseFriendsResponse> {
  try {
    const userId = getCurrentUserId(context);
    if (!userId) {
      throw new Error("Authentication required");
    }

    const userRows = await getCloseFriends(userId);

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

    return create(ListCloseFriendsResponseSchema, { users });
  } catch (error) {
    console.error("❌ Error listing close friends:", error);
    throw error;
  }
}
