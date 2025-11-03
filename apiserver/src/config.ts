import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Load .env file from repo root before anything else
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load .env from repo root (two levels up from apiserver/src)
config({ path: resolve(__dirname, "../../.env") });

/**
 * Application configuration
 * Centralized config management with defaults and environment variable loading
 */
export const appConfig = {
  // Server configuration
  server: {
    port: Number(process.env.API_SERVER_PORT || process.env.PORT) || 3001,
    host: process.env.API_SERVER_HOST || "0.0.0.0",
  },

  // Database configuration
  database: {
    path: process.env.DB_PATH || process.env.DATABASE_PATH || "./db/stockpicker.db",
  },

  // Node environment
  nodeEnv: process.env.NODE_ENV || "development",

  /**
   * Validates that required configuration values are present
   * Throws error if critical config is missing
   */
  validate(): void {
    // No validation needed - n8n removed
  },
};
