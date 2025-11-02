# API Testing Commands

Quick reference for testing gamification features via curl.

## Phase 2: Auth Testing

### 1. Send OTP
```bash
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/SendOTP \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```
**Expected**: `{"success":true,"message":"OTP sent successfully. Check your email."}`
**Action**: Check server console for email preview with OTP code

### 2. Verify OTP
```bash
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/VerifyOTP \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otpCode":"REPLACE_WITH_CODE"}'
```
**Expected Success**: `{"success":true,"user":{...},"token":"eyJhbGc..."}`
**Expected Error (invalid OTP)**: `{"code":"unknown","message":"Invalid or expired OTP code"}`
**Action**: Copy the token for next requests

### 3. Get Current User
```bash
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/GetCurrentUser \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer REPLACE_WITH_TOKEN" \
  -d '{}'
```
**Expected**: `{"user":{"id":"user_...","email":"test@example.com",...}}`

---

## Phase 3: Strategy Testing

### Create Strategy (Auth Required)
```bash
# Auth required - must have valid token
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/CreateStrategy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "My Strategy",
    "description": "Test strategy",
    "customPrompt": "Find growth stocks",
    "monthlyBudget": 1000,
    "timeHorizon": "3 months",
    "targetReturnPct": 15,
    "frequency": 2,
    "riskLevel": 2,
    "maxUniqueStocks": 5
  }'
```
**Expected Success**: `{..., "strategy": {..., "userId": "user_...", "user": {...}}}`
**Expected Error (no auth)**: `{"code":"unknown","message":"Authentication required to create strategies"}`

### List Strategies
```bash
# With auth (shows own + public)
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/ListStrategies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{}'

# Without auth (shows all public)
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/ListStrategies \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Tips

### Save Token to Variable
```bash
# Send OTP
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/SendOTP \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Get OTP from console, then verify and save token
TOKEN=$(curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/VerifyOTP \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otpCode":"123456"}' \
  | jq -r '.token')

# Use token in subsequent requests
curl -X POST http://localhost:3001/stockpicker.v1.StrategyService/GetCurrentUser \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{}'
```

### Pretty Print JSON
```bash
curl http://localhost:3001/... | jq
```

### Check Server Health
```bash
curl http://localhost:3001/
```
