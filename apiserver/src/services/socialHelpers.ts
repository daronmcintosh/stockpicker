import { db } from "../db.js";
import type { UserRow } from "./authHelpers.js";

export interface RelationshipRow {
  user_a_id: string;
  user_b_id: string;
  created_at: number;
}

// Follow a user (one-way relationship)
// Relationship: (user_a_id, user_b_id) means user_a_id follows user_b_id
export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) {
    throw new Error("Cannot follow yourself");
  }

  // Ensure both users exist
  const follower = await db.get("SELECT id FROM users WHERE id = ?", followerId);
  const following = await db.get("SELECT id FROM users WHERE id = ?", followingId);

  if (!follower || !following) {
    throw new Error("User not found");
  }

  // Check if already following
  const existing = await isFollowing(followerId, followingId);
  if (existing) {
    return; // Already following, no-op
  }

  // Insert relationship: follower (user_a) follows following (user_b)
  await db.run(
    "INSERT INTO user_relationships (user_a_id, user_b_id, created_at) VALUES (?, ?, ?)",
    followerId, // user_a_id = follower
    followingId, // user_b_id = following
    Date.now()
  );
}

// Unfollow a user
export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  await db.run(
    "DELETE FROM user_relationships WHERE user_a_id = ? AND user_b_id = ?",
    followerId, // user_a_id = follower
    followingId // user_b_id = following
  );
}

// Check if userA is following userB
export async function isFollowing(userAId: string, userBId: string): Promise<boolean> {
  const rel = await db.get(
    "SELECT 1 FROM user_relationships WHERE user_a_id = ? AND user_b_id = ?",
    userAId, // user_a_id = follower
    userBId // user_b_id = following
  );

  return !!rel;
}

// Check if two users are close friends (mutual follows)
export async function isCloseFriend(userAId: string, userBId: string): Promise<boolean> {
  // Close friends means both follow each other
  // Since we have one row per relationship, we check if the row exists
  // and verify both directions by checking our follow logic
  const aFollowsB = await isFollowing(userAId, userBId);
  const bFollowsA = await isFollowing(userBId, userAId);

  return aFollowsB && bFollowsA;
}

// Get list of users that userId is following
// Returns users where userId = user_a_id (userId is following them)
export async function getFollowing(userId: string): Promise<UserRow[]> {
  const relationships = await db.all<RelationshipRow[]>(
    "SELECT * FROM user_relationships WHERE user_a_id = ?",
    userId
  );

  if (relationships.length === 0) {
    return [];
  }

  // Extract the user IDs being followed (user_b_id)
  const followingIds = relationships.map((rel) => rel.user_b_id);

  // Fetch user details
  const placeholders = followingIds.map(() => "?").join(",");
  const users = await db.all<UserRow[]>(
    `SELECT * FROM users WHERE id IN (${placeholders})`,
    ...followingIds
  );

  return users;
}

// Get list of users following userId
// Returns users where userId = user_b_id (they are following userId)
export async function getFollowers(userId: string): Promise<UserRow[]> {
  const relationships = await db.all<RelationshipRow[]>(
    "SELECT * FROM user_relationships WHERE user_b_id = ?",
    userId
  );

  if (relationships.length === 0) {
    return [];
  }

  // Extract the follower user IDs (user_a_id)
  const followerIds = relationships.map((rel) => rel.user_a_id);

  // Fetch user details
  const placeholders = followerIds.map(() => "?").join(",");
  const users = await db.all<UserRow[]>(
    `SELECT * FROM users WHERE id IN (${placeholders})`,
    ...followerIds
  );

  return users;
}

// Get list of close friends (mutual follows)
export async function getCloseFriends(userId: string): Promise<UserRow[]> {
  const following = await getFollowing(userId);
  const closeFriends: UserRow[] = [];

  for (const user of following) {
    const isMutual = await isFollowing(user.id, userId);
    if (isMutual) {
      closeFriends.push(user);
    }
  }

  return closeFriends;
}

// Get user IDs that userId is following
export async function getFollowingUserIds(userId: string): Promise<string[]> {
  const users = await getFollowing(userId);
  return users.map((u) => u.id);
}

// Get close friend user IDs
export async function getCloseFriendsUserIds(userId: string): Promise<string[]> {
  const users = await getCloseFriends(userId);
  return users.map((u) => u.id);
}
