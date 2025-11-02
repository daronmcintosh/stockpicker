# Manual Prediction Trigger & Creation Feature

## Overview
Added two major features:
1. **Manual Prediction Triggering** - Trigger the AI prediction algorithm on-demand outside of cron schedule
2. **Manual Prediction Creation** - Manually create individual predictions with custom parameters

## Features Implemented

### 1. Manual Prediction Triggering

#### Backend (`apiserver/src/`)

**Proto Changes** (`proto/stockpicker/v1/strategy.proto`):
- Added `TriggerPredictions` RPC method to `StrategyService`
- Request: `TriggerPredictionsRequest { string id }`
- Response: `TriggerPredictionsResponse { bool success, string message }`

**n8n Client** (`services/n8nClient.ts:769-784`):
- Added `executeWorkflow(workflowId: string)` method
- Uses n8n API endpoint: `POST /workflows/{id}/run`
- Triggers the manual trigger node in the workflow

**Strategy Service** (`services/strategyService.ts:664-716`):
- Implemented `triggerPredictions()` handler
- Validates:
  - Strategy exists
  - Strategy status is ACTIVE
  - Workflow exists (n8n_workflow_id not null)
- Calls `n8nClient.executeWorkflow()`
- Returns success/failure message

#### Frontend (`webapp/src/routes/`)

**Home Page** (`index.tsx`):
- Shows active strategies section
- Each strategy has "Run Now" button with Play icon
- Loading state during execution
- Toast notifications for success/failure

**Strategies Page** (`strategies/index.tsx`):
- Added "Run Now" button (Sparkles icon) next to Pause/Stop for ACTIVE strategies
- Positioned before Pause button
- Disabled state while triggering
- Shows "Running..." with spinner

**Predictions Page** (`predictions.tsx`):
- "Generate Predictions" button in header (Sparkles icon)
- Only visible when specific strategy selected (not "all")
- Auto-refreshes predictions 3 seconds after triggering
- Requires strategy selection to prevent errors

### 2. Manual Prediction Creation

#### Frontend (`webapp/src/routes/predictions.tsx`)

**Create Prediction Dialog**:
- Modal form with fields:
  - **Stock Symbol** (required, auto-uppercase)
  - **Entry Price** (required, decimal)
  - **Allocated Amount** (required, decimal)
  - **Target Price** (required, decimal)
  - **Stop Loss Price** (required, decimal)
  - **Sentiment Score** (optional, 1-10, default: 5)
  - **Overall Score** (optional, 1-10, default: 5)
  - **Technical Analysis Notes** (optional, textarea)

**Validation**:
- All required fields must be filled
- Must select specific strategy (not "all")
- Numbers validated as decimals
- Symbol auto-converted to uppercase

**UI Integration**:
- "Create Prediction" button (Plus icon, green) in header
- Next to "Generate Predictions" button
- Only visible when specific strategy selected
- Form resets after successful creation
- Auto-refreshes prediction list

## Usage

### Manually Trigger Predictions

**Home Page:**
1. Navigate to home page (`/`)
2. See active strategies listed
3. Click "Run Now" on desired strategy
4. Wait for "Predictions generation triggered successfully" toast
5. Check predictions page after ~10 seconds for new predictions

**Strategies Page:**
1. Go to Strategies (`/strategies`)
2. Find ACTIVE strategy
3. Click "Run Now" button (blue, with sparkles icon)
4. Success message appears

**Predictions Page:**
1. Go to Predictions (`/predictions`)
2. Select specific strategy from dropdown (not "All Strategies")
3. Click "Generate Predictions" button in header
4. Page auto-refreshes after 3 seconds

### Manually Create Prediction

1. Go to Predictions page (`/predictions`)
2. Select specific strategy from dropdown
3. Click "Create Prediction" (green button, plus icon)
4. Fill in form:
   - Symbol: e.g., "AAPL"
   - Entry Price: e.g., "150.00"
   - Allocated Amount: e.g., "1000.00"
   - Target Price: e.g., "165.00" (10% gain)
   - Stop Loss: e.g., "145.00" (3.33% loss)
   - Optional: Sentiment/Overall scores, notes
5. Click "Create Prediction"
6. Prediction appears in list

## Technical Details

**How Manual Triggering Works:**
1. Frontend calls `strategyClient.triggerPredictions({ id })`
2. API validates strategy is ACTIVE and has workflow
3. API calls `n8nClient.executeWorkflow(workflowId)`
4. n8n executes `POST /workflows/{id}/run`
5. Workflow's manual trigger node activates
6. Entire prediction algorithm runs:
   - Fetches strategy config
   - Checks budget
   - Gets top stocks from Alpha Vantage
   - AI analysis with OpenAI
   - Creates top 3 predictions via API
7. New predictions appear in database

**Manual Creation vs AI Generation:**
- **Manual**: User specifies all parameters, bypasses AI
- **AI Generated**: OpenAI analyzes stocks, calculates targets
- Both create predictions with same schema
- Manual predictions tagged with "Manual prediction" in technical_analysis

## API Endpoints

### Trigger Predictions
```typescript
strategyClient.triggerPredictions({ id: "strategy-uuid" })
```

**Response:**
```typescript
{
  success: true,
  message: "Prediction generation triggered successfully. Check back in a few moments."
}
```

**Errors:**
- Strategy not found
- Strategy not active
- No workflow found

### Create Manual Prediction
```typescript
predictionClient.createPrediction({
  strategyId: "strategy-uuid",
  symbol: "AAPL",
  entryPrice: 150.00,
  targetPrice: 165.00,
  stopLossPrice: 145.00,
  allocatedAmount: 1000.00,
  sentimentScore: 5.0,
  overallScore: 5.0,
  technicalAnalysis: "Manual prediction",
})
```

## UI Locations

**Manual Trigger Buttons:**
- Home page: Active strategies section, "Run Now" (blue, Play icon)
- Strategies page: Next to Pause button for ACTIVE strategies, "Run Now" (blue, Sparkles icon)
- Predictions page: Header, "Generate Predictions" (blue, Sparkles icon)

**Manual Creation:**
- Predictions page: Header, "Create Prediction" (green, Plus icon)

## Files Modified

**Backend:**
- `proto/stockpicker/v1/strategy.proto` - New RPC method
- `apiserver/src/services/n8nClient.ts` - executeWorkflow()
- `apiserver/src/services/strategyService.ts` - triggerPredictions()

**Frontend:**
- `webapp/src/routes/index.tsx` - Home page Run Now button
- `webapp/src/routes/strategies/index.tsx` - Strategies Run Now button
- `webapp/src/routes/predictions.tsx` - Generate + Create buttons, dialog

**Total:** 6 files, ~500 lines added
