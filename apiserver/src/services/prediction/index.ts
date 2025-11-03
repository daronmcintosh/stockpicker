import { updatePredictionAction, updatePredictionPrivacy } from "./predictionActions.js";
// Barrel export that combines all prediction service modules into a single implementation
import { copyPrediction, createPrediction, deletePrediction } from "./predictionCRUD.js";
import { getCurrentPrices } from "./predictionPrices.js";
import {
  getPrediction,
  getPredictionsBySymbol,
  getPublicPredictions,
  listPredictions,
} from "./predictionQueries.js";

// Re-export the helper function used by other services
export { dbRowToProtoPrediction } from "./predictionHelpers.js";

// Re-export all functions individually
export {
  createPrediction,
  deletePrediction,
  copyPrediction,
  listPredictions,
  getPrediction,
  getPredictionsBySymbol,
  getPublicPredictions,
  updatePredictionAction,
  updatePredictionPrivacy,
  getCurrentPrices,
};

// Combine all RPCs into a single service implementation
export const predictionServiceImpl = {
  // CRUD operations
  createPrediction,
  deletePrediction,
  copyPrediction,

  // Query operations
  listPredictions,
  getPrediction,
  getPredictionsBySymbol,
  getPublicPredictions,

  // Action operations
  updatePredictionAction,
  updatePredictionPrivacy,

  // External data operations
  getCurrentPrices,
};
