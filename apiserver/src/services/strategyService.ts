import { getCurrentUser, sendOTP, updateUser, verifyOTP } from "./auth/index.js";
import {
  copyStrategy,
  followUser,
  getLeaderboard,
  getUserPerformance,
  getUserProfile,
  listCloseFriends,
  listFollowers,
  listFollowing,
  unfollowUser,
} from "./strategy/index.js";

// Strategy service implementation - composed from individual method files
// Each RPC method is in its own file under ./strategy/ directory
export const strategyServiceImpl = {
  // ============================================================================
  // AUTH RPCs
  // ============================================================================
  sendOTP,
  verifyOTP,
  getCurrentUser,
  updateUser,

  // ============================================================================
  // SOCIAL RPCs
  // ============================================================================
  followUser,
  unfollowUser,
  listFollowing,
  listFollowers,
  listCloseFriends,
  getUserProfile,

  // ============================================================================
  // PERFORMANCE & LEADERBOARD RPCs
  // ============================================================================
  getUserPerformance,
  getLeaderboard,

  // ============================================================================
  // SHARING RPCs
  // ============================================================================
  copyStrategy,
};
