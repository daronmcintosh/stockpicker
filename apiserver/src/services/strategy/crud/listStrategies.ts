import { create } from "@bufbuild/protobuf";
import type { HandlerContext } from "@connectrpc/connect";
import { type StrategyRow, db } from "../../../db.js";
import type {
  ListStrategiesRequest,
  ListStrategiesResponse,
} from "../../../gen/stockpicker/v1/strategy_pb.js";
import { ListStrategiesResponseSchema } from "../../../gen/stockpicker/v1/strategy_pb.js";
import { getCurrentUserId } from "../../authHelpers.js";
import { dbRowToProtoStrategy } from "../strategyHelpers.js";
import { strategyStatusToProtoName } from "../strategyHelpers.js";

export async function listStrategies(
  req: ListStrategiesRequest,
  context: HandlerContext
): Promise<ListStrategiesResponse> {
  try {
    const userId = getCurrentUserId(context);
    console.log("📋 Listing strategies, status filter:", req.status || "all", "userId:", userId);

    let rows: StrategyRow[];

    // Build WHERE clause for user scoping
    // Show: user's own strategies + public strategies from others
    let whereClause = userId
      ? "(user_id = ? OR privacy = 'STRATEGY_PRIVACY_PUBLIC')"
      : "privacy = 'STRATEGY_PRIVACY_PUBLIC'"; // No auth = only public

    if (req.status) {
      const statusFilter = strategyStatusToProtoName(req.status);
      whereClause += ` AND status = '${statusFilter}'`;
    }

    const sql = `SELECT * FROM strategies WHERE ${whereClause} ORDER BY created_at DESC`;

    if (userId) {
      rows = (await db.all(sql, [userId])) as StrategyRow[];
    } else {
      rows = (await db.all(sql)) as StrategyRow[];
    }

    const strategies = await Promise.all(rows.map((row) => dbRowToProtoStrategy(row)));
    console.log(`✅ Found ${strategies.length} strategies`);
    return create(ListStrategiesResponseSchema, { strategies });
  } catch (error) {
    console.error("❌ Error listing strategies:", error);
    throw error;
  }
}
