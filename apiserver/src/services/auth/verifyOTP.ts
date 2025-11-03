import { create } from "@bufbuild/protobuf";
import { timestampFromDate } from "@bufbuild/protobuf/wkt";
import type { VerifyOTPRequest, VerifyOTPResponse } from "../../gen/stockpicker/v1/strategy_pb.js";
import { UserSchema, VerifyOTPResponseSchema } from "../../gen/stockpicker/v1/strategy_pb.js";
import { generateToken, verifyOTP as verifyOTPHelper } from "../authHelpers.js";

export async function verifyOTP(req: VerifyOTPRequest): Promise<VerifyOTPResponse> {
  try {
    console.log("🔐 Verifying OTP for:", req.email);
    const user = await verifyOTPHelper(req.email, req.otpCode);

    if (!user) {
      console.warn("⚠️ Invalid OTP attempt for:", req.email);
      throw new Error("Invalid or expired OTP code");
    }

    // Generate JWT token
    const token = generateToken(user);

    // Convert user to proto
    const protoUser = create(UserSchema, {
      id: user.id,
      email: user.email,
      username: user.username,
      displayName: user.display_name || "",
      avatarUrl: user.avatar_url || "",
      createdAt: timestampFromDate(new Date(user.created_at)),
      updatedAt: timestampFromDate(new Date(user.updated_at)),
    });

    console.log("✅ OTP verified successfully for:", user.email);
    return create(VerifyOTPResponseSchema, {
      success: true,
      user: protoUser,
      token,
    });
  } catch (error) {
    console.error("❌ Error verifying OTP:", error);
    throw error; // Re-throw to send proper error to client
  }
}
