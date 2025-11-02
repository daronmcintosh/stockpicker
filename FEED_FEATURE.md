# Public Predictions Feed Feature

## Overview
Added public/private privacy controls for predictions and a public feed page showing community predictions.

## Changes Made

### 1. Protocol Buffers (`proto/stockpicker/v1/strategy.proto`)
- Added `PredictionPrivacy` enum with `PRIVATE` (default) and `PUBLIC` values
- Added `privacy` field to `Prediction` message
- Added `GetPublicPredictions` RPC method with pagination support
- Added `UpdatePredictionPrivacy` RPC method for toggling privacy

### 2. Database Schema
- **Initial schema** (`apiserver/src/migrations/001_initial_schema.sql`):
  - Added `privacy` column to `predictions` table (defaults to `PREDICTION_PRIVACY_PRIVATE`)
  - Added indexes for `privacy` and `created_at DESC` (for efficient feed queries)

- **Migration** (`apiserver/src/migrations/002_add_privacy_column.sql`):
  - Adds privacy column to existing databases
  - Creates required indexes

### 3. API Server (`apiserver/src/`)

#### `db.ts`
- Updated `PredictionRow` interface to include `privacy: string`

#### `services/predictionService.ts`
- Imported `PredictionPrivacy` types
- Updated `dbRowToProtoPrediction()` to map privacy field
- Added `getPublicPredictions()`:
  - Fetches predictions where `privacy = 'PREDICTION_PRIVACY_PUBLIC'`
  - Sorted by `created_at DESC` (most recent first)
  - Supports pagination with limit/offset
  - Returns total count

- Added `updatePredictionPrivacy()`:
  - Updates prediction privacy setting
  - Returns updated prediction

### 4. Webapp (`webapp/src/`)

#### `routes/feed.tsx` (NEW)
- Public feed page accessible at `/feed`
- Displays public predictions sorted by most recent
- Shows:
  - Symbol, status badges
  - Entry price, target price, stop loss
  - Current return (if available) with trend indicators
  - Prediction scores and risk metrics
  - Creation timestamp
- Pagination support (20 per page)
- Responsive design with hover effects

#### `routes/predictions.tsx`
- Added privacy toggle button to prediction cards
- Shows Globe icon for public, Lock icon for private
- Click to toggle between public/private
- Toast notifications on privacy updates
- Disabled state during updates
- Callback to refresh predictions after privacy change

#### `components/Header.tsx`
- Added "Public Feed" navigation link
- Uses Users icon
- Accessible from main navigation menu

## Usage

### Setting Prediction Privacy
1. Go to Predictions page (`/predictions`)
2. Find a prediction card
3. Click the privacy badge (Globe/Lock icon) next to the status
4. Prediction toggles between public and private

### Viewing Public Feed
1. Navigate to "Public Feed" from the menu
2. View all public predictions sorted by most recent
3. Use pagination to browse older predictions

## Database Migration

For existing databases, run the migration:

```bash
sqlite3 db/stockpicker.db < apiserver/src/migrations/002_add_privacy_column.sql
```

Or reset the database:

```bash
make reset-db
make init-db
```

## API Endpoints

### Get Public Predictions
```typescript
predictionClient.getPublicPredictions({
  limit: 50,    // optional, default: 50
  offset: 0,    // optional, default: 0
})
```

**Response:**
```typescript
{
  predictions: Prediction[],
  total: number
}
```

### Update Prediction Privacy
```typescript
predictionClient.updatePredictionPrivacy({
  id: "prediction-id",
  privacy: PredictionPrivacy.PUBLIC  // or PRIVATE
})
```

**Response:**
```typescript
{
  prediction: Prediction
}
```

## Default Behavior
- All new predictions default to **PRIVATE**
- Users must explicitly make predictions public
- Public predictions are visible to everyone in the feed
- Private predictions only visible to the strategy owner
