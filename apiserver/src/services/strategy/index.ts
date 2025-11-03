// Re-export all strategy CRUD, lifecycle, and privacy operations
export {
  createStrategy,
  deleteStrategy,
  getStrategy,
  listStrategies,
  updateStrategy,
} from "./strategyCRUD.js";
export {
  pauseStrategy,
  startStrategy,
  stopStrategy,
  triggerPredictions,
} from "./strategyLifecycle.js";
export { updateStrategyPrivacy } from "./strategyPrivacy.js";
export { syncStrategiesWithWorkflows } from "./workflowSync.js";
export {
  prepareDataForWorkflow,
  createPredictionsFromWorkflow,
} from "./workflowHandlers.js";
export { listWorkflowRuns, getWorkflowRun } from "./workflowRuns.js";
export { updateWorkflowRunStatus } from "./updateWorkflowRunStatus.js";

// Re-export auth methods (auth is now in services/auth, not services/strategy/auth)
export {
  getCurrentUser,
  sendOTP,
  updateUser,
  verifyOTP,
} from "../auth/index.js";

// Re-export social methods
export {
  followUser,
  getUserProfile,
  listCloseFriends,
  listFollowers,
  listFollowing,
  unfollowUser,
} from "./social/index.js";

// Re-export performance methods
export { getLeaderboard, getUserPerformance } from "./performance/index.js";

// Re-export sharing methods
export { copyStrategy } from "./sharing/index.js";
