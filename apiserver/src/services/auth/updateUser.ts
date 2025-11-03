import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { HandlerContext } from "@connectrpc/connect";
import { Code, ConnectError } from "@connectrpc/connect";
import { db } from "../../db.js";
import type {
  UpdateUserRequest,
  UpdateUserResponse,
} from "../../gen/stockpicker/v1/strategy_pb.js";
import { UpdateUserResponseSchema, UserSchema } from "../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId, getUserById, getUserByUsername } from "../authHelpers.js";

export async function updateUser(
  req: UpdateUserRequest,
  context: HandlerContext
): Promise<UpdateUserResponse> {
  try {
    const userId = getCurrentUserId(context);
    if (!userId) {
      throw new ConnectError("Authentication required", Code.Unauthenticated);
    }

    // Get current user
    const currentUser = await getUserById(userId);
    if (!currentUser) {
      throw new ConnectError("User not found", Code.NotFound);
    }

    const updates: string[] = [];
    const params: (string | null)[] = [];

    // Validate and update username
    if (req.username !== undefined) {
      const newUsername = req.username.trim();

      // Validate username format: alphanumeric, underscore, hyphen, 3-30 chars
      if (newUsername.length < 3 || newUsername.length > 30) {
        throw new ConnectError(
          "Username must be between 3 and 30 characters",
          Code.InvalidArgument
        );
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(newUsername)) {
        throw new ConnectError(
          "Username can only contain letters, numbers, underscores, and hyphens",
          Code.InvalidArgument
        );
      }

      // Check if username is already taken (by another user)
      const existingUser = await getUserByUsername(newUsername);
      if (existingUser && existingUser.id !== userId) {
        throw new ConnectError("Username is already taken", Code.AlreadyExists);
      }

      // If user is changing to their current username, no-op
      if (newUsername === currentUser.username) {
        // No change needed
      } else {
        updates.push("username = ?");
        params.push(newUsername);
      }
    }

    // Update display_name
    if (req.displayName !== undefined) {
      updates.push("display_name = ?");
      params.push(req.displayName.trim() || null);
    }

    // Update avatar_url
    if (req.avatarUrl !== undefined) {
      updates.push("avatar_url = ?");
      params.push(req.avatarUrl.trim() || null);
    }

    // If no updates, return current user
    if (updates.length === 0) {
      const userRow = await getUserById(userId);
      if (!userRow) {
        throw new ConnectError("User not found", Code.NotFound);
      }

      const protoUser = create(UserSchema, {
        id: userRow.id,
        email: userRow.email,
        username: userRow.username,
        displayName: userRow.display_name || "",
        avatarUrl: userRow.avatar_url || "",
        createdAt: timestampFromDate(new Date(userRow.created_at)),
        updatedAt: timestampFromDate(new Date(userRow.updated_at)),
      });

      return create(UpdateUserResponseSchema, { user: protoUser });
    }

    // Update user in database
    params.push(String(Date.now())); // updated_at
    params.push(userId); // WHERE id = ?

    const sql = `UPDATE users SET ${updates.join(", ")}, updated_at = ? WHERE id = ?`;
    await db.run(sql, params);

    // Fetch updated user
    const updatedUser = await getUserById(userId);
    if (!updatedUser) {
      throw new ConnectError("Failed to fetch updated user", Code.Internal);
    }

    const protoUser = create(UserSchema, {
      id: updatedUser.id,
      email: updatedUser.email,
      username: updatedUser.username,
      displayName: updatedUser.display_name || "",
      avatarUrl: updatedUser.avatar_url || "",
      createdAt: timestampFromDate(new Date(updatedUser.created_at)),
      updatedAt: timestampFromDate(new Date(updatedUser.updated_at)),
    });

    return create(UpdateUserResponseSchema, { user: protoUser });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    if (error instanceof ConnectError) {
      throw error;
    }
    throw new ConnectError(
      error instanceof Error ? error.message : "Failed to update user",
      Code.Internal
    );
  }
}
