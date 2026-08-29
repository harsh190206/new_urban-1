import { readFileSync } from "node:fs";
import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "./env.ts";

/**
 * Loads the service account credentials.
 *
 * Two supported sources, in priority order:
 *   1. FIREBASE_SERVICE_ACCOUNT_BASE64 — the whole JSON, base64 encoded.
 *      Preferred in production (Render/Railway/Fly etc. have no writable secret files).
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH — path to the JSON file on disk. Used for local dev.
 */
function loadServiceAccount(): ServiceAccount {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_BASE64
    ? Buffer.from(env.FIREBASE_SERVICE_ACCOUNT_BASE64, "base64").toString(
        "utf8",
      )
    : readFileSync(env.FIREBASE_SERVICE_ACCOUNT_PATH!, "utf8");

  const parsed = JSON.parse(raw) as ServiceAccount & { project_id?: string };

  if (!parsed.privateKey && !(parsed as any).private_key) {
    throw new Error("Firebase service account is missing a private key");
  }
  return parsed;
}

// Initialise once — hot reloads and repeated imports must not register a second app.
const app =
  getApps()[0] ??
  initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: env.FIREBASE_PROJECT_ID,
  });

export const firebaseAuth = getAuth(app);

export class PhoneTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneTokenError";
  }
}

/**
 * Verifies a Firebase ID token produced by the client after a successful phone
 * OTP sign-in, and returns the phone number Firebase itself confirmed (E.164).
 *
 * The returned number is the only one that should ever be trusted — never the
 * phone the client typed into the form, and never a client-supplied
 * "otpVerified" flag, both of which are trivially forged.
 */
export async function verifyPhoneToken(idToken: string): Promise<string> {
  let decoded;
  try {
    // checkRevoked: a token from a session the user signed out of must not pass.
    decoded = await firebaseAuth.verifyIdToken(idToken, true);
  } catch {
    throw new PhoneTokenError(
      "Phone verification expired or invalid. Please verify your number again.",
    );
  }

  const phoneNumber = decoded.phone_number;
  if (!phoneNumber) {
    throw new PhoneTokenError(
      "This verification is not linked to a phone number.",
    );
  }

  // Firebase issues tokens valid for an hour, but a signup should follow the OTP
  // closely. Anything older than 15 minutes is treated as stale.
  const verifiedAtSeconds = decoded.auth_time;
  if (Date.now() / 1000 - verifiedAtSeconds > 15 * 60) {
    throw new PhoneTokenError(
      "Phone verification expired. Please verify your number again.",
    );
  }

  return phoneNumber;
}
