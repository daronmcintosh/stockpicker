-- Migration 005: Add gamification tables (users, auth, social relationships)

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- OTP codes for email authentication (no session management)
CREATE TABLE IF NOT EXISTS user_otps (
  email TEXT PRIMARY KEY,
  otp_code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Single table for both follows and close friends
-- Row (user_a, user_b) means user_a follows user_b
-- Close friends = both (a,b) AND (b,a) exist
CREATE TABLE IF NOT EXISTS user_relationships (
  user_a_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_a_id, user_b_id),
  CHECK (user_a_id != user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_relationships_user_a ON user_relationships(user_a_id);
CREATE INDEX IF NOT EXISTS idx_relationships_user_b ON user_relationships(user_b_id);

-- Add user_id to existing tables
ALTER TABLE strategies ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE predictions ADD COLUMN user_id TEXT REFERENCES users(id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategies_user_id ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
