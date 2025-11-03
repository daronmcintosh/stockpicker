import { create } from "@bufbuild/protobuf";
import type { SendOTPRequest, SendOTPResponse } from "../../gen/stockpicker/v1/strategy_pb.js";
import { SendOTPResponseSchema } from "../../gen/stockpicker/v1/strategy_pb.js";
import { sendOTP as sendOTPHelper } from "../authHelpers.js";

export async function sendOTP(req: SendOTPRequest): Promise<SendOTPResponse> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[STRATEGY SERVICE] sendOTP called`);
  console.log(`Request email:`, req.email);
  console.log(`Request object:`, JSON.stringify(req, null, 2));
  console.log(`${"=".repeat(80)}\n`);

  try {
    if (!req.email) {
      console.error(`[STRATEGY SERVICE] ❌ Missing email in request`);
      return create(SendOTPResponseSchema, {
        success: false,
        message: "Email is required",
      });
    }

    console.log(`[STRATEGY SERVICE] 📧 Calling sendOTPHelper for: ${req.email}`);
    await sendOTPHelper(req.email);
    console.log(`[STRATEGY SERVICE] ✅ sendOTPHelper completed successfully`);

    return create(SendOTPResponseSchema, {
      success: true,
      message: "OTP sent successfully. Check your email.",
    });
  } catch (error) {
    console.error(`[STRATEGY SERVICE] ❌ Error in sendOTP:`, error);
    console.error(`[STRATEGY SERVICE] Error stack:`, error instanceof Error ? error.stack : "N/A");
    return create(SendOTPResponseSchema, {
      success: false,
      message: error instanceof Error ? error.message : "Failed to send OTP. Please try again.",
    });
  }
}
