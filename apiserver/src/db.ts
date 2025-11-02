import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

import { appConfig } from "./config.js";

const DB_PATH = appConfig.database.path;
const MIGRATIONS_PATH = join(dirname(fileURLToPath(import.meta.url)), "migrations");

// Ensure the database directory exists
const dbDir = dirname(DB_PATH);
await mkdir(dbDir, { recursive: true });

// Open database connection
export const db = await open({
  filename: DB_PATH,
  driver: sqlite3.Database,
});

// Enable foreign keys
await db.run("PRAGMA foreign_keys = ON");

// Enable WAL mode for better concurrent performance
await db.run("PRAGMA journal_mode = WAL");

// Run migrations
console.log("📋 Running database migrations...");
await db.migrate({
  migrationsPath: MIGRATIONS_PATH,
});
console.log("✅ Database migrations complete");

console.log(`📦 Database connected: ${DB_PATH}`);

// Prepared statements for strategies
// Note: db.prepare() returns a Promise, so we await all of them
export const statements = {
  insertStrategy: await db.prepare(`
    INSERT INTO strategies (
      id, name, description, custom_prompt, monthly_budget, current_month_spent,
      current_month_start, time_horizon, target_return_pct, frequency,
      trades_per_month, per_trade_budget, per_stock_allocation, risk_level,
      unique_stocks_count, max_unique_stocks, n8n_workflow_id, status,
      privacy, created_at, updated_at
    ) VALUES (
      $id, $name, $description, $custom_prompt, $monthly_budget, $current_month_spent,
      $current_month_start, $time_horizon, $target_return_pct, $frequency,
      $trades_per_month, $per_trade_budget, $per_stock_allocation, $risk_level,
      $unique_stocks_count, $max_unique_stocks, $n8n_workflow_id, $status,
      $privacy, $created_at, $updated_at
    )
  `),

  selectStrategyById: await db.prepare(`
    SELECT * FROM strategies WHERE id = :id
  `),

  selectAllStrategies: await db.prepare(`
    SELECT * FROM strategies ORDER BY created_at DESC
  `),

  selectStrategiesByStatus: await db.prepare(`
    SELECT * FROM strategies WHERE status = :status ORDER BY created_at DESC
  `),

  updateStrategy: await db.prepare(`
    UPDATE strategies
    SET name = COALESCE(:name, name),
        description = COALESCE(:description, description),
        custom_prompt = COALESCE(:custom_prompt, custom_prompt),
        time_horizon = COALESCE(:time_horizon, time_horizon),
        target_return_pct = COALESCE(:target_return_pct, target_return_pct),
        risk_level = COALESCE(:risk_level, risk_level),
        max_unique_stocks = COALESCE(:max_unique_stocks, max_unique_stocks),
        updated_at = :updated_at
    WHERE id = :id
  `),

  updateStrategyStatus: await db.prepare(`
    UPDATE strategies
    SET status = :status,
        next_trade_scheduled = :next_trade_scheduled,
        updated_at = :updated_at
    WHERE id = :id
  `),

  updateStrategyWorkflowId: await db.prepare(`
    UPDATE strategies
    SET n8n_workflow_id = :n8n_workflow_id,
        updated_at = :updated_at
    WHERE id = :id
  `),

  deleteStrategy: await db.prepare(`
    DELETE FROM strategies WHERE id = :id
  `),

  // Predictions
  insertPrediction: await db.prepare(`
    INSERT INTO predictions (
      id, strategy_id, symbol, entry_price, allocated_amount, time_horizon_days,
      evaluation_date, target_return_pct, target_price, stop_loss_pct,
      stop_loss_price, stop_loss_dollar_impact, risk_level, technical_analysis,
      sentiment_score, overall_score, action, status, current_price, current_return_pct,
      closed_at, closed_reason, created_at
    ) VALUES (
      :id, :strategy_id, :symbol, :entry_price, :allocated_amount, :time_horizon_days,
      :evaluation_date, :target_return_pct, :target_price, :stop_loss_pct,
      :stop_loss_price, :stop_loss_dollar_impact, :risk_level, :technical_analysis,
      :sentiment_score, :overall_score, :action, :status, :current_price, :current_return_pct,
      :closed_at, :closed_reason, :created_at
    )
  `),

  selectPredictionById: await db.prepare(`
    SELECT * FROM predictions WHERE id = :id
  `),

  selectPredictionsByStrategy: await db.prepare(`
    SELECT * FROM predictions WHERE strategy_id = :strategy_id ORDER BY created_at DESC
  `),

  selectPredictionsByStrategyAndStatus: await db.prepare(`
    SELECT * FROM predictions WHERE strategy_id = :strategy_id AND status = :status ORDER BY created_at DESC
  `),

  selectPredictionsBySymbol: await db.prepare(`
    SELECT * FROM predictions WHERE symbol = :symbol ORDER BY created_at DESC
  `),

  updatePrediction: await db.prepare(`
    UPDATE predictions
    SET current_price = COALESCE(:current_price, current_price),
        current_return_pct = COALESCE(:current_return_pct, current_return_pct),
        status = COALESCE(:status, status),
        closed_at = COALESCE(:closed_at, closed_at),
        closed_reason = COALESCE(:closed_reason, closed_reason)
    WHERE id = :id
  `),

  updatePredictionAction: await db.prepare(`
    UPDATE predictions
    SET action = :action
    WHERE id = :id
  `),
};

// Database row interface for type safety
export interface StrategyRow {
  id: string;
  name: string;
  description: string;
  custom_prompt: string;
  monthly_budget: number;
  current_month_spent: number;
  current_month_start: string;
  time_horizon: string;
  target_return_pct: number;
  frequency: string;
  trades_per_month: number;
  per_trade_budget: number;
  per_stock_allocation: number;
  risk_level: string;
  unique_stocks_count: number;
  max_unique_stocks: number;
  status: string;
  n8n_workflow_id: string | null;
  next_trade_scheduled: string | null;
  last_trade_executed: string | null;
  created_at: string;
  updated_at: string;
  privacy: string;
}

export interface PredictionRow {
  id: string;
  strategy_id: string;
  symbol: string;
  entry_price: number;
  allocated_amount: number;
  time_horizon_days: number | null;
  evaluation_date: string | null;
  target_return_pct: number;
  target_price: number;
  stop_loss_pct: number;
  stop_loss_price: number;
  stop_loss_dollar_impact: number;
  risk_level: string;
  technical_analysis: string;
  sentiment_score: number;
  overall_score: number;
  action: string;
  status: string;
  current_price: number | null;
  current_return_pct: number | null;
  closed_at: string | null;
  closed_reason: string | null;
  created_at: string;
  privacy: string;
  source: string | null;
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  await db.close();
  console.log("Database connection closed");
});
