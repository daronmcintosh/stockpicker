import { randomInt } from "node:crypto";
import type { HandlerContext } from "@connectrpc/connect";
import jwt from "jsonwebtoken";
import { db } from "../db.js";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";
const OTP_EXPIRY_MINUTES = 10;

export interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface OTPRow {
  email: string;
  otp_code: string;
  expires_at: number;
  created_at: number;
}

export interface JWTPayload {
  userId: string;
  email: string;
}

// Generate a 6-digit OTP code
export function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

// Send OTP (for now just log it, integrate email service later)
export async function sendOTP(email: string): Promise<void> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[AUTH HELPER] sendOTP called with email: ${email}`);

  if (!email || typeof email !== "string") {
    console.error(`[AUTH HELPER] ❌ Invalid email:`, email);
    throw new Error("Email is required and must be a string");
  }

  const otpCode = generateOTP();
  const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;
  console.log(`[AUTH HELPER] Generated OTP: ${otpCode}`);
  console.log(`[AUTH HELPER] OTP expires at: ${new Date(expiresAt).toISOString()}`);

  try {
    // Delete existing OTP for this email
    console.log(`[AUTH HELPER] Deleting existing OTPs for email: ${email}`);
    const deleteResult = await db.run("DELETE FROM user_otps WHERE email = ?", email);
    console.log(`[AUTH HELPER] Deleted ${deleteResult.changes || 0} existing OTP(s)`);

    // Insert new OTP
    console.log(`[AUTH HELPER] Inserting new OTP into database`);
    const insertResult = await db.run(
      "INSERT INTO user_otps (email, otp_code, expires_at, created_at) VALUES (?, ?, ?, ?)",
      email,
      otpCode,
      expiresAt,
      Date.now()
    );
    console.log(
      `[AUTH HELPER] ✅ OTP inserted successfully. Row ID: ${insertResult.lastInsertRowid}`
    );
  } catch (dbError) {
    console.error(`[AUTH HELPER] ❌ Database error:`, dbError);
    throw dbError;
  }

  // Send email based on environment
  const isDev = process.env.NODE_ENV !== "production";
  console.log(`[AUTH HELPER] Environment: ${isDev ? "development" : "production"}`);

  if (isDev) {
    // Development: Log email to console
    console.log(`\n${"=".repeat(60)}`);
    console.log("📧 [DEV] Email Preview - OTP Login");
    console.log("=".repeat(60));
    console.log(`To: ${email}`);
    console.log(`Subject: Your StockPicker Login Code`);
    console.log("-".repeat(60));
    console.log(`
Hi there!

Your verification code is: ${otpCode}

This code will expire in ${OTP_EXPIRY_MINUTES} minutes.

If you didn't request this code, please ignore this email.

Best regards,
StockPicker Team
    `);
    console.log(`${"=".repeat(60)}\n`);
  } else {
    // Production: Send actual email
    // TODO: Integrate with email service (SendGrid, AWS SES, Resend, etc.)
    // Example with Resend:
    // await resend.emails.send({
    //   from: 'noreply@stockpicker.com',
    //   to: email,
    //   subject: 'Your StockPicker Login Code',
    //   html: `Your verification code is: <strong>${otpCode}</strong><br>This code expires in ${OTP_EXPIRY_MINUTES} minutes.`
    // });

    console.warn(`[AUTH HELPER] TODO: Implement email sending for production. OTP: ${otpCode}`);
  }

  console.log(`[AUTH HELPER] ✅ sendOTP completed successfully`);
  console.log(`${"=".repeat(80)}\n`);
}

// Verify OTP and create/return user
export async function verifyOTP(email: string, otpCode: string): Promise<UserRow | null> {
  // Check OTP
  const otp = await db.get<OTPRow>("SELECT * FROM user_otps WHERE email = ?", email);

  if (!otp) {
    return null; // No OTP found
  }

  if (otp.otp_code !== otpCode) {
    return null; // Invalid code
  }

  if (otp.expires_at < Date.now()) {
    // Delete expired OTP
    await db.run("DELETE FROM user_otps WHERE email = ?", email);
    return null; // Expired
  }

  // OTP valid - delete it
  await db.run("DELETE FROM user_otps WHERE email = ?", email);

  // Check if user exists
  let user = await db.get<UserRow>("SELECT * FROM users WHERE email = ?", email);

  if (!user) {
    // Create new user
    const userId = generateUserId();
    const username = generateUsername(email);
    const now = Date.now();

    await db.run(
      "INSERT INTO users (id, email, username, display_name, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      userId,
      email,
      username,
      null, // display_name defaults to null
      null, // avatar_url defaults to null
      now,
      now
    );

    user = await db.get<UserRow>("SELECT * FROM users WHERE id = ?", userId);
  }

  if (!user) {
    throw new Error("User not found after creation");
  }

  return user;
}

// Generate user ID
function generateUserId(): string {
  return `user_${Date.now()}_${randomInt(1000, 9999)}`;
}

// Generate username from email (can be changed by user later)
function generateUsername(email: string): string {
  const baseUsername = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "");
  return `${baseUsername}_${randomInt(1000, 9999)}`;
}

// Generate JWT token
export function generateToken(user: UserRow): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "30d", // 30 days
  });
}

// Verify JWT token
export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

// Get user from JWT in request context
export function getCurrentUserId(context: HandlerContext): string | null {
  const authHeader = context.requestHeader.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7); // Remove "Bearer "
  const payload = verifyToken(token);

  return payload?.userId ?? null;
}

// Get user from database
export async function getUserById(userId: string): Promise<UserRow | null> {
  return (await db.get<UserRow>("SELECT * FROM users WHERE id = ?", userId)) ?? null;
}

// Get user by username
export async function getUserByUsername(username: string): Promise<UserRow | null> {
  return (await db.get<UserRow>("SELECT * FROM users WHERE username = ?", username)) ?? null;
}

// Require authentication (throws error if not authenticated)
export function requireAuth(context: HandlerContext): string {
  const userId = getCurrentUserId(context);

  if (!userId) {
    throw new Error("Unauthorized");
  }

  return userId;
}
