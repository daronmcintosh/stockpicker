# Implementation Roadmap

Step-by-step guide to build the StockPicker MVP.

## Prerequisites

- Docker & Docker Compose installed
- API Keys:
  - Alpha Vantage: [API Key](https://www.alphavantage.co/support/#api-key)
  - Reddit OAuth: [OAuth](https://www.reddit.com/prefs/apps)

## Phase 1: Project Setup (Day 1)

### 1.1 Create Docker Compose Structure

```bash
mkdir -p stockpicker/{apiserver/src,webapp/src,db,docs}
cd stockpicker
```

### 1.2 Create docker-compose.yml

```yaml
version: '3.8'

services:
  apiserver:
    build: ./apiserver
    ports:
      - "3001:3000"
    volumes:
      - ./db:/app/db
      - ./apiserver:/app
    environment:
      - NODE_ENV=development
      - PORT=3000
      - DB_PATH=/app/db/stockpicker.db
    restart: unless-stopped

  webapp:
    build: ./webapp
    ports:
      - "3000:3000"
    volumes:
      - ./webapp:/app
      - /app/node_modules
    environment:
      - REACT_APP_API_URL=http://localhost:3001
    depends_on:
      - apiserver
    restart: unless-stopped

volumes:
  data:
```

### 1.3 Create .env.example

```bash
# API Keys
ALPHA_VANTAGE_API_KEY=your_key_here
REDDIT_CLIENT_ID=your_id_here
REDDIT_CLIENT_SECRET=your_secret_here
REDDIT_USER_AGENT=StockPicker/1.0
```

### 1.4 Initialize Database

Create `db/schema.sql`:

```sql
-- strategies table
-- Note: Calculated fields (not stored):
--   - current_month_spent: SUM(allocated_amount) from predictions WHERE action='entered' AND in current month
--   - predictions_per_month: COUNT(*) from predictions WHERE action='entered' AND in current month (actual count)
--   - per_prediction_budget: monthly_budget / predictions_per_month (if no predictions yet, use frequency-based estimate)
--   - per_stock_allocation: per_trade_budget / 3
--   - unique_stocks_count: COUNT(DISTINCT symbol) from predictions WHERE action='entered' AND status='active'
--   - last_trade_executed: MAX(created_at) from predictions WHERE action='entered'
CREATE TABLE IF NOT EXISTS strategies (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  name TEXT NOT NULL,
  custom_prompt TEXT,
  status TEXT CHECK(status IN ('active', 'paused', 'stopped')) DEFAULT 'active',
  monthly_budget DECIMAL(10,2) NOT NULL,
  time_horizon TEXT DEFAULT '3 months',
  target_return_pct DECIMAL(5,2) DEFAULT 10.0,
  frequency TEXT DEFAULT 'twice_weekly',
  risk_level TEXT CHECK(risk_level IN ('low', 'medium', 'high')) DEFAULT 'medium',
  max_unique_stocks INTEGER DEFAULT 20
);

-- predictions table
CREATE TABLE IF NOT EXISTS predictions (
  id TEXT PRIMARY KEY,
  strategy_id TEXT REFERENCES strategies(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  symbol TEXT NOT NULL,
  entry_price DECIMAL(10,2) NOT NULL,
  allocated_amount DECIMAL(10,2) NOT NULL,
  time_horizon_days INTEGER,
  evaluation_date DATE,
  target_return_pct DECIMAL(5,2),
  target_price DECIMAL(10,2),
  stop_loss_pct DECIMAL(5,2),
  stop_loss_price DECIMAL(10,2),
  stop_loss_dollar_impact DECIMAL(10,2),
  risk_level TEXT,
  technical_analysis TEXT,  -- JSON stored as TEXT in SQLite
  sentiment_score DECIMAL(5,2),
  overall_score DECIMAL(5,2),
  action TEXT CHECK(action IN ('pending', 'entered', 'dismissed')) DEFAULT 'pending',
  status TEXT CHECK(status IN ('active', 'hit_target', 'hit_stop', 'expired')) DEFAULT 'active',
  current_price DECIMAL(10,2),
  current_return_pct DECIMAL(5,2),
  closed_at TIMESTAMP,
  closed_reason TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_predictions_strategy ON predictions(strategy_id);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON predictions(status);
CREATE INDEX IF NOT EXISTS idx_predictions_symbol ON predictions(symbol);
CREATE INDEX IF NOT EXISTS idx_predictions_action ON predictions(action);
```

## Phase 2: API Server Setup (Day 2)

### 2.1 Create Express Server

`apiserver/package.json`:

```json
{
  "name": "stockpicker-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node src/app.js",
    "dev": "nodemon src/app.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "better-sqlite3": "^8.7.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "axios": "^1.5.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

`apiserver/Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 2.2 Create n8n API Client

`apiserver/src/services/n8n-client.js`:

```javascript
const axios = require('axios');

const N8N_API_URL = process.env.N8N_API_URL || 'http://n8n:5678/api/v1';
const N8N_API_KEY = process.env.N8N_API_KEY; // Optional: if using API key auth

class N8nClient {
  async createWorkflow(strategyId, frequency, cronSchedule) {
    // Create workflow JSON structure
    const workflow = {
      name: `Strategy ${strategyId}`,
      active: true,
      nodes: [
        {
          // Cron trigger node
          type: 'n8n-nodes-base.cron',
          // ... cron config
        },
        {
          // HTTP Request to get strategy
          type: 'n8n-nodes-base.httpRequest',
          // ... config
        },
        // ... more nodes
      ]
    };

    const response = await axios.post(`${N8N_API_URL}/workflows`, workflow, {
      headers: this.getHeaders()
    });
    return response.data;
  }

  async updateWorkflow(workflowId, updates) {
    const response = await axios.patch(
      `${N8N_API_URL}/workflows/${workflowId}`,
      updates,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async activateWorkflow(workflowId) {
    return this.updateWorkflow(workflowId, { active: true });
  }

  async deactivateWorkflow(workflowId) {
    return this.updateWorkflow(workflowId, { active: false });
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (N8N_API_KEY) {
      headers['X-N8N-API-KEY'] = N8N_API_KEY;
    }
    return headers;
  }
}

module.exports = new N8nClient();
```

### 2.3 Create Strategy Routes

`apiserver/src/routes/strategies.js`:

```javascript
const express = require('express');
const router = express.Router();
const Database = require('better-sqlite3');
const n8nClient = require('../services/n8n-client');
const { v4: uuidv4 } = require('uuid');

const db = new Database(process.env.DB_PATH || '/app/db/stockpicker.db');

// Create strategy
router.post('/', async (req, res) => {
  const { name, monthly_budget, frequency, risk_level, custom_prompt, time_horizon } = req.body;
  const id = uuidv4();

  // Save to database (calculated fields computed on-demand when needed)
  db.prepare(`
    INSERT INTO strategies (id, name, custom_prompt, monthly_budget, frequency,
      risk_level, time_horizon)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, custom_prompt || null, monthly_budget, frequency,
    risk_level, time_horizon);

  // Create n8n workflow
  try {
    const cronSchedule = calculateCronSchedule(frequency);
    const workflow = await n8nClient.createWorkflow(id, frequency, cronSchedule);

    // Store workflow ID in strategy
    db.prepare('UPDATE strategies SET n8n_workflow_id = ? WHERE id = ?')
      .run(workflow.id, id);

    res.json({ id, workflow_id: workflow.id, message: 'Strategy created' });
  } catch (error) {
    console.error('Failed to create n8n workflow:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// Get all strategies
router.get('/', (req, res) => {
  const strategies = db.prepare('SELECT * FROM strategies').all();
  res.json(strategies);
});

// Update strategy status
router.patch('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Update database
  db.prepare('UPDATE strategies SET status = ? WHERE id = ?').run(status, id);

  // Get workflow ID
  const strategy = db.prepare('SELECT n8n_workflow_id FROM strategies WHERE id = ?').get(id);

  // Activate/Deactivate workflow
  if (strategy && strategy.n8n_workflow_id) {
    if (status === 'active') {
      await n8nClient.activateWorkflow(strategy.n8n_workflow_id);
    } else {
      await n8nClient.deactivateWorkflow(strategy.n8n_workflow_id);
    }
  }

  res.json({ message: 'Status updated' });
});

function calculateCronSchedule(frequency) {
  // Convert frequency to cron expression
  // Example: twice_weekly (Mon/Thu 10am) = "0 10 * * 1,4"
  // This is simplified - actual implementation would handle user-selected days
  const schedules = {
    daily: '0 10 * * *',
    twice_weekly: '0 10 * * 1,4',  // Mon, Thu
    weekly: '0 10 * * 1',
    monthly: '0 10 1 * *'
  };
  return schedules[frequency] || schedules.twice_weekly;
}

module.exports = router;
```

### 2.4 Main App File

`apiserver/src/app.js`:

```javascript
const express = require('express');
const cors = require('cors');
const strategyRoutes = require('./routes/strategies');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/strategies', strategyRoutes);

// Add prediction routes here...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## Phase 3: Webapp Setup (Day 3)

### 3.1 Create React UI

`webapp/package.json`:

```json
{
  "name": "stockpicker-ui",
  "version": "1.0.0",
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.5.0"
  },
  "devDependencies": {
    "react-scripts": "5.0.1"
  }
}
```

`webapp/Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 3.2 Basic UI Components

Create:

- Strategy creation form
- Strategy list/dashboard
- Predictions display
- Budget tracking

## Phase 4: Background Jobs (Day 4-6)

- Implement internal scheduling for per-strategy prediction generation
- Implement daily performance tracking job
- Implement monthly performance summary job

## Phase 5: Integration & Testing (Day 7-8)

### 5.1 Test Strategy Creation

- Create strategy via UI
- Verify in database
- Verify background job execution

### 5.2 Test Scheduled Prediction Execution

- Manually trigger scheduled trade workflow
- Verify predictions created
- Check budget updated

### 5.3 Test Performance Tracking

- Create test predictions
- Run performance tracking workflow
- Verify price updates

### 5.4 End-to-End Test

1. Create strategy via UI
2. Wait for scheduled prediction cycle (or trigger manually)
3. Verify predictions displayed
4. Run performance tracking
5. Verify updates in UI

## Deployment Commands

```bash
# Start all services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down

# Rebuild after changes
docker compose up -d --build

# Reset database
docker compose exec apiserver sqlite3 /app/db/stockpicker.db < /app/db/schema.sql
```

## Next Steps After MVP

1. **Enhanced UI:** Charts, performance visualizations
2. **Error Handling:** Robust error handling in workflows
3. **Caching:** Implement aggressive caching for API calls
4. **Notifications:** Email/SMS alerts for new predictions
5. **Testing:** Unit tests, integration tests
6. **Schwab Integration:** Automated trading (Phase 2)
