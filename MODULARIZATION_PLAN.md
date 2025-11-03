# File Modularization Plan

This document outlines the plan to split large files (>500 lines) into smaller, more manageable modules.

## Files to Modularize

### Backend Services (TypeScript)

#### 1. `strategyService.ts` (2563 lines) → Split by method/domain
**Current Structure:**
- Single service implementation with ~25+ methods
- Helper functions mixed with service methods
- Grouped by domain: Strategy CRUD, Auth, Social, Performance, Leaderboard

**Proposed Structure:**
```
apiserver/src/services/strategy/
├── index.ts                    # Re-export all methods
├── strategyCRUD.ts             # createStrategy, listStrategies, getStrategy, updateStrategy, deleteStrategy
├── strategyLifecycle.ts        # startStrategy, pauseStrategy, stopStrategy, triggerPredictions
├── strategyPrivacy.ts          # updateStrategyPrivacy, copyStrategy
├── strategyHelpers.ts          # dbRowToProtoStrategy, enum converters, validation helpers
├── strategyAuth.ts             # sendOTP, verifyOTP, getCurrentUser, updateUser
├── strategySocial.ts           # followUser, unfollowUser, listFollowing, listFollowers, listCloseFriends
├── strategyPerformance.ts     # getUserPerformance, getUserProfile
├── strategyLeaderboard.ts     # getLeaderboard
└── workflowSync.ts             # syncStrategiesWithWorkflows, ensureWorkflowExists
```

**Estimated split:**
- `strategyCRUD.ts`: ~600 lines
- `strategyLifecycle.ts`: ~400 lines
- `strategyPrivacy.ts`: ~200 lines
- `strategyHelpers.ts`: ~400 lines
- `strategyAuth.ts`: ~250 lines
- `strategySocial.ts`: ~300 lines
- `strategyPerformance.ts`: ~150 lines
- `strategyLeaderboard.ts`: ~200 lines
- `workflowSync.ts`: ~150 lines

---

#### 2. `n8nClient.ts` (1517 lines) → Split by functionality
**Current Structure:**
- Single N8nClient class with workflow management, credential management, API communication

**Proposed Structure:**
```
apiserver/src/services/n8n/
├── index.ts                    # Export n8nClient instance
├── client.ts                   # Main N8nClient class (core request/response)
├── credentials.ts              # createOrUpdateCredential
├── workflows.ts                # createStrategyWorkflow, updateWorkflow, rebuildWorkflowFromTemplate, updateStrategyWorkflow
├── workflowExecution.ts        # activateWorkflow, deactivateWorkflow, executeWorkflow
├── workflowManagement.ts       # getWorkflow, getFullWorkflow, listWorkflows, deleteWorkflow
├── workflowHelpers.ts          # injectApiUrl, injectCredentialReference, filterWorkflowForApi, frequencyToCron
└── types.ts                    # Move N8nWorkflow, N8nFullWorkflow types here (from n8nTypes.ts)
```

**Estimated split:**
- `client.ts`: ~200 lines (core HTTP client)
- `credentials.ts`: ~100 lines
- `workflows.ts`: ~600 lines (workflow creation/updates)
- `workflowExecution.ts`: ~200 lines
- `workflowManagement.ts`: ~300 lines
- `workflowHelpers.ts`: ~150 lines
- `types.ts`: ~50 lines

---

#### 3. `predictionService.ts` (1093 lines) → Split by method
**Current Structure:**
- Single service with CRUD operations, helpers, and utility functions

**Proposed Structure:**
```
apiserver/src/services/prediction/
├── index.ts                    # Re-export all methods
├── predictionCRUD.ts           # createPrediction, listPredictions, getPrediction, deletePrediction
├── predictionQueries.ts        # getPredictionsBySymbol, getPublicPredictions
├── predictionActions.ts        # updatePredictionAction, updatePredictionPrivacy, copyPrediction
├── predictionHelpers.ts        # dbRowToProtoPrediction, enum mappers, calculation helpers
└── priceService.ts             # getCurrentPrices (can be separate service)
```

**Estimated split:**
- `predictionCRUD.ts`: ~400 lines
- `predictionQueries.ts`: ~200 lines
- `predictionActions.ts`: ~250 lines
- `predictionHelpers.ts`: ~200 lines
- `priceService.ts`: ~80 lines

---

### Frontend Components (TSX)

#### 4. `predictions.tsx` (2158 lines) → Split into components
**Current Structure:**
- Main page component with multiple dialogs, filters, and a large PredictionCard component

**Proposed Structure:**
```
webapp/src/routes/predictions/
├── index.tsx                   # Main page (~300 lines) - routing, state management, filters
├── PredictionCard.tsx          # Card component (~500 lines)
├── CreatePredictionDialog.tsx   # Create dialog (~350 lines)
├── EditPredictionDialog.tsx     # Edit dialog (~350 lines)
├── GenerateDialog.tsx           # Generate predictions dialog (~100 lines)
├── CopyPredictionDialog.tsx     # Copy dialog (~100 lines)
├── DeletePredictionDialog.tsx   # Delete dialog (~50 lines)
└── PredictionDetailDialog.tsx  # Detail dialog (~400 lines)
```

**Estimated split:**
- `index.tsx`: ~300 lines (main orchestration)
- `PredictionCard.tsx`: ~500 lines
- `CreatePredictionDialog.tsx`: ~350 lines
- `EditPredictionDialog.tsx`: ~350 lines
- `GenerateDialog.tsx`: ~100 lines
- `CopyPredictionDialog.tsx`: ~100 lines
- `DeletePredictionDialog.tsx`: ~50 lines
- `PredictionDetailDialog.tsx`: ~400 lines

---

#### 5. `dashboard.tsx` (1368 lines) → Split into components
**Current Structure:**
- Dashboard page with stats, recent predictions, active strategies, and detail dialogs

**Proposed Structure:**
```
webapp/src/routes/dashboard/
├── index.tsx                   # Main dashboard (~250 lines) - layout, data loading
├── DashboardStats.tsx          # Stats grid component (~200 lines)
├── RecentPredictions.tsx       # Recent predictions list (~200 lines)
├── ActiveStrategies.tsx        # Active strategies list (~250 lines)
├── StrategyDetailDialog.tsx    # Strategy detail dialog (~250 lines)
├── PredictionDetailDialog.tsx  # Prediction detail dialog (~200 lines)
└── helpers.ts                  # Helper functions (getFrequencyLabel, getRiskLevelLabel, etc.) (~50 lines)
```

**Estimated split:**
- `index.tsx`: ~250 lines
- `DashboardStats.tsx`: ~200 lines
- `RecentPredictions.tsx`: ~200 lines
- `ActiveStrategies.tsx`: ~250 lines
- `StrategyDetailDialog.tsx`: ~250 lines
- `PredictionDetailDialog.tsx`: ~200 lines
- `helpers.ts`: ~50 lines

---

#### 6. `strategies/index.tsx` (994 lines) → Split into components
**Current Structure:**
- Strategies list page with cards, dialogs, and actions

**Proposed Structure:**
```
webapp/src/routes/strategies/
├── index.tsx                   # Main strategies list (~250 lines)
├── StrategyCard.tsx            # Strategy card component (~300 lines)
├── StrategyDetailDialog.tsx    # Detail dialog (~250 lines)
├── EditStrategyDialog.tsx      # Edit dialog (~200 lines)
└── helpers.ts                  # Helper functions (~50 lines)
```

**Estimated split:**
- `index.tsx`: ~250 lines
- `StrategyCard.tsx`: ~300 lines
- `StrategyDetailDialog.tsx`: ~250 lines
- `EditStrategyDialog.tsx`: ~200 lines
- `helpers.ts`: ~50 lines

---

#### 7. `feed.tsx` (845 lines) → Split into components
**Current Structure:**
- Feed page with prediction and strategy items

**Proposed Structure:**
```
webapp/src/routes/feed/
├── index.tsx                   # Main feed page (~200 lines) - filters, pagination, state
├── FeedPredictionCard.tsx       # Prediction feed item (~250 lines)
├── FeedStrategyCard.tsx         # Strategy feed item (~250 lines)
├── CopyPredictionDialog.tsx     # Copy dialog (~100 lines)
└── helpers.ts                  # Helper functions (~50 lines)
```

**Estimated split:**
- `index.tsx`: ~200 lines
- `FeedPredictionCard.tsx`: ~250 lines
- `FeedStrategyCard.tsx`: ~250 lines
- `CopyPredictionDialog.tsx`: ~100 lines
- `helpers.ts`: ~50 lines

---

## Implementation Strategy

### Phase 1: Backend Services (Start Here)
1. **strategyService.ts** → Split into domain-specific modules
2. **n8nClient.ts** → Split into functional modules
3. **predictionService.ts** → Split into CRUD/query/action modules

### Phase 2: Frontend Components
4. **predictions.tsx** → Extract dialogs and card component
5. **dashboard.tsx** → Extract sub-components
6. **strategies/index.tsx** → Extract card and dialogs
7. **feed.tsx** → Extract feed item components

## Migration Approach

1. **Create new directory structure** (e.g., `apiserver/src/services/strategy/`)
2. **Move code to new files** while maintaining exact functionality
3. **Update imports** in affected files
4. **Create barrel exports** (`index.ts`) for clean imports
5. **Test each module** after splitting
6. **Remove old file** only after all imports are updated

## Benefits

- **Better maintainability**: Each file has a single responsibility
- **Easier testing**: Smaller, focused modules are easier to test
- **Improved code organization**: Related functionality grouped together
- **Reduced merge conflicts**: Multiple developers can work on different modules
- **Faster IDE performance**: Smaller files load faster in editors
- **Clearer code structure**: Easier to navigate and understand

## Notes

- Keep shared helper functions in dedicated `helpers.ts` files
- Use barrel exports (`index.ts`) to maintain backward compatibility
- Extract shared types/interfaces to separate files if reused
- Maintain exact same functionality - no behavioral changes during refactor

