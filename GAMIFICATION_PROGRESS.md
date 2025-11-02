# Gamification Implementation Progress

**Status**: In Progress
**Started**: 2025-11-02
**Target**: MVP with auth, social features, and leaderboards

---

## Phase 1: Backend Foundation + Migration ✅ COMPLETE
**Goal**: Database ready, helpers created, protos generated

**Completed**:
- ✅ Created migration `005_add_gamification_tables.sql`
- ✅ Updated `strategy.proto` with User, Auth, Social, Performance, Leaderboard messages
- ✅ Ran `make generate` to regenerate TypeScript
- ✅ Created `authHelpers.ts` with OTP/JWT logic
- ✅ Created `socialHelpers.ts` with follow/friend logic
- ✅ Created `performanceHelpers.ts` with stats calculation
- ✅ Created `leaderboardHelpers.ts` with ranking logic
- ✅ Installed `jsonwebtoken` package

**Next**: Verify migration runs successfully

---

## Phase 2: Basic Auth (Backend Only) ✅ COMPLETE
**Goal**: Users can send/verify OTP and get JWT token

**Completed**:
- ✅ Created auth helper functions (sendOTP, verifyOTP, JWT generation)
- ✅ Implemented `SendOTP` RPC in `strategyService.ts`
- ✅ Implemented `VerifyOTP` RPC in `strategyService.ts`
- ✅ Implemented `GetCurrentUser` RPC in `strategyService.ts`
- ✅ Lint passes

**Note**: Still need to update `db.ts` with user/OTP prepared statements (optional optimization - queries work via raw SQL)

**Testing**:
```bash
# 1. Send OTP (check server console for the OTP code)
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/SendOTP \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Expected response: {"success":true,"message":"OTP sent successfully. Check your email."}
# Check server logs for the email preview with OTP code

# 2. Verify OTP (use the code from server logs)
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/VerifyOTP \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otpCode":"123456"}'

# Expected response: {"success":true,"user":{...},"token":"eyJhbGc..."}
# Save the token from response

# 3. Get current user (use token from step 2)
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/GetCurrentUser \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{}'

# Expected response: {"user":{"id":"user_...","email":"test@example.com","username":"test_1234",...}}
```

**Deliverable**: Auth works end-to-end via API

---

## Phase 3: User-Scoped Strategies (Backend Only) ✅ COMPLETE
**Goal**: Strategies are owned by users, auth required to create

**Completed**:
- ✅ Updated `db.ts` - added `user_id` to StrategyRow and PredictionRow interfaces
- ✅ Updated `CreateStrategy` - requires authentication, no fallback
- ✅ Updated `ListStrategies` - shows user's own + public from others
- ✅ Updated `GetStrategy` - allows if owner or public
- ✅ Updated `UpdateStrategy`/`DeleteStrategy` - validates ownership
- ✅ Updated `StartStrategy`/`PauseStrategy`/`StopStrategy` - validates ownership
- ✅ Updated `TriggerPredictions`/`UpdateStrategyPrivacy` - validates ownership
- ✅ Populated `user` field in all strategy responses (async fetch from DB)
- ✅ Lint passes

**Testing**:
- [ ] Create strategy with auth → succeeds with user_id
- [ ] Create strategy without auth → returns error "Authentication required"
- [ ] List strategies with auth → shows own + public from others
- [ ] List strategies without auth → shows only public strategies
- [ ] Can only edit own strategies (ownership validation)
- [ ] Can view public strategies from others

**Deliverable**: Strategies require authentication and have full user ownership/privacy controls

---

## Phase 4: User-Scoped Predictions (Backend Only) ✅ COMPLETE
**Goal**: Predictions are owned by users with full privacy controls

**Completed**:
- ✅ Made `dbRowToProtoPrediction` async and added user field population
- ✅ Added context parameter to all prediction service methods
- ✅ Updated `CreatePrediction` - validates strategy ownership, inherits user_id from strategy owner
- ✅ Updated `ListPredictions` - validates strategy access (owner OR public strategy)
- ✅ Updated `GetPrediction` - validates prediction access (owner OR public prediction)
- ✅ Updated `GetPredictionsBySymbol` - filters to show user's own + public predictions
- ✅ Updated `UpdatePredictionAction` - requires ownership
- ✅ Updated `UpdatePredictionPrivacy` - requires ownership
- ✅ Updated `DeletePrediction` - requires ownership
- ✅ Updated `GetPublicPredictions` - shows only public predictions (no auth required)
- ✅ Updated `GetCurrentPrices` - added context parameter (no auth validation needed)
- ✅ Lint passes

**Testing**:
- [ ] Create prediction requires owning the strategy
- [ ] Predictions inherit user_id from strategy owner
- [ ] Public feed shows only public predictions
- [ ] User can only see/edit/delete own private predictions
- [ ] Cannot modify other users' predictions

**Deliverable**: Full backend user isolation with ownership validation for all prediction operations

---

## Phase 5: Frontend Auth ✅ COMPLETE
**Goal**: Users can login via webapp

**Completed**:
- ✅ Created `lib/auth.tsx` - AuthContext with login/logout/JWT storage
- ✅ Created `/login.tsx` - Email input → OTP → verify → redirect
- ✅ Added `ProtectedRoute` wrapper component
- ✅ Updated root layout - AuthProvider wraps entire app
- ✅ Updated Header - user dropdown (if logged in) or login link
- ✅ Webapp typecheck passes

**Testing**:
```bash
# 1. Start services
make dev

# 2. Visit http://localhost:3000/login
# 3. Enter email (e.g., test@example.com)
# 4. Check apiserver logs for OTP code
# 5. Enter OTP code
# 6. Should redirect to home page with username shown in header
# 7. Click username dropdown → Sign Out
# 8. Refresh page → should stay logged in (until sign out)
```

**Deliverable**: Full auth flow working in UI

---

## Phase 6: Social Features (Backend) ✅ COMPLETE
**Goal**: Follow/unfollow working

**Completed**:
- ✅ Fixed `socialHelpers.ts` to handle directional follows (user_a follows user_b)
- ✅ Implemented `FollowUser` RPC in `strategyService.ts`
- ✅ Implemented `UnfollowUser` RPC in `strategyService.ts`
- ✅ Implemented `ListFollowing` RPC in `strategyService.ts`
- ✅ Implemented `ListFollowers` RPC in `strategyService.ts`
- ✅ Implemented `ListCloseFriends` RPC in `strategyService.ts`
- ✅ Implemented `GetUserProfile` RPC in `strategyService.ts`
- ✅ Lint passes

**Testing via API**:
```bash
# 1. Follow another user (get user_id from another user's profile or from GetCurrentUser)
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/FollowUser \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"user_id":"user_123"}'

# 2. List following
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/ListFollowing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{}'

# 3. List followers
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/ListFollowers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{}'

# 4. List close friends (mutual follows)
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/ListCloseFriends \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{}'

# 5. Get user profile with relationship status
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/GetUserProfile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{"username":"test_1234"}'
```

**Deliverable**: Social backend complete

---

## Phase 7: Social Features (Frontend) ✅ COMPLETE
**Goal**: Users can view profiles and follow others

**Completed**:
- ✅ Created `/users/$username.tsx` - User profile page with follow button, stats, and profile info
- ✅ Created `/friends.tsx` - List following/followers/close friends with tabs
- ✅ Updated feed - added "Following" tab to show content from followed users
- ✅ Created `UserAvatar` component with initials/color generation
- ✅ Created `FollowButton` component with follow/unfollow functionality
- ✅ Updated Header - added Friends link to navigation
- ✅ All components use authenticated clients
- ✅ Lint passes

**Testing**:
- [ ] View user profile (`/users/[username]`)
- [ ] Click follow button on profile
- [ ] See user in "following" list (`/friends`)
- [ ] Feed "Following" tab shows followed users' content
- [ ] View close friends list in `/friends`
- [ ] Follow button updates correctly after follow/unfollow

**Deliverable**: Social features working in UI

---

## Phase 8: Leaderboard (Backend + Frontend) ✅ COMPLETE
**Goal**: Leaderboard visible and accurate

**Completed**:
- ✅ Implemented `GetUserPerformance` RPC in `strategyService.ts`
- ✅ Implemented `GetLeaderboard` RPC in `strategyService.ts`
- ✅ Created `/leaderboard.tsx` with tabs and filters
- ✅ Shows rank, user, stats, score in table format
- ✅ Added timeframe tabs (All Time / Monthly)
- ✅ Added scope tabs (Global / Following / Close Friends)
- ✅ Highlights current user's position with banner and row highlighting
- ✅ Added medal icons for top 3 (Trophy for #1, Medals for #2 and #3)
- ✅ Updated Header - added Leaderboard link to navigation
- ✅ All components use authenticated clients
- ✅ Lint passes

**Testing**:
- [ ] Create predictions with different outcomes
- [ ] Check leaderboard rankings are accurate
- [ ] Filter by timeframe/scope
- [ ] Verify performance score calculation
- [ ] Test current user highlighting
- [ ] Test medal display for top 3

**Deliverable**: Full leaderboard working

---

## Phase 9: Sharing (Backend + Frontend) ⬜
**Goal**: Copy strategies, share links

**Backend Tasks**:
- [ ] Implement `CopyStrategy` RPC

**Frontend Tasks**:
- [ ] Add "Copy Strategy" button to strategy pages
- [ ] Add "Share" button (copy link to clipboard)
- [ ] Add Open Graph meta tags to strategy/prediction pages

**Testing**:
- [ ] Copy public strategy
- [ ] New strategy created for current user with correct config
- [ ] Share link works and displays properly

**Deliverable**: Sharing complete

---

## Phase 10: Polish & Testing ⬜
**Goal**: Production-ready

**Tasks**:
- [ ] Error handling everywhere (auth failures, network errors, etc.)
- [ ] Loading states for all async operations
- [ ] Edge cases (can't follow yourself, expired tokens, etc.)
- [ ] Make JWT_SECRET configurable via env var
- [ ] Email service integration (replace console.log OTP)
- [ ] UI polish (spacing, colors, responsiveness)
- [ ] Add user settings page (change username, avatar, etc.)
- [ ] Performance optimization (cache leaderboard, etc.)

**Testing**:
- [ ] Full end-to-end user journey
- [ ] Test with multiple users
- [ ] Test leaderboard with 100+ users
- [ ] Test all privacy settings
- [ ] Test all error scenarios

**Deliverable**: Production-ready gamification system

---

## Notes

- Each phase should compile and run without breaking existing functionality
- Test thoroughly before moving to next phase
- **This file will be deleted upon completion**

---

## Quick Reference

**Current Phase**: Phase 8 complete, ready for Phase 9
**Next Action**: Test leaderboard, then start Phase 9 (Sharing)
**Blocked By**: None
**Estimated Time Remaining**: 2-3 hours
