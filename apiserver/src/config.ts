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

  // n8n API configuration
  n8n: {
    apiUrl: process.env.N8N_API_URL || "http://localhost:5678/api/v1",
    apiKey: process.env.N8N_API_KEY || "",
    apiServerUrl: process.env.N8N_API_SERVER_URL || "http://apiserver:3000",
    webhookUrl:
      process.env.N8N_WEBHOOK_URL ||
      "http://localhost:5678/webhook/e461e33a-3355-48c2-abe0-c5ecc7a1907b",
  },

  // Node environment
  nodeEnv: process.env.NODE_ENV || "development",

  /**
   * Validates that required configuration values are present
   * Throws error if critical config is missing
   */
  validate(): void {
    if (!this.n8n.apiKey) {
      throw new Error(
        "N8N_API_KEY environment variable is required. Get your API key from n8n: Settings > n8n API"
      );
    }
  },
};
