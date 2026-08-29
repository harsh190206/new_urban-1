import type { Request, Response } from "express";
import { prisma } from "../../../db/index.ts";
import { PhoneTokenError, verifyPhoneToken } from "../../config/firebase.ts";
import { isSupportedCountry, toE164 } from "../../utils/phone.ts";
import { withDbRetry } from "../../utils/db-retry.ts";

export type PhoneOwner = "USER" | "AGENT";

export class PhoneValidationError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PhoneValidationError";
  }
}

/**
 * A number is unique per role, not globally: the same person may be a customer
 * and a service partner. Each table carries its own unique index on `phone`.
 */
async function isPhoneTaken(
  phone: string,
  owner: PhoneOwner,
): Promise<boolean> {
  const existing = await withDbRetry(() =>
    owner === "USER"
      ? prisma.user.findUnique({ where: { phone }, select: { id: true } })
      : prisma.agent.findUnique({ where: { phone }, select: { id: true } }),
  );
  return existing !== null;
}

const ALREADY_REGISTERED =
  "This phone number is already registered. Please login instead.";

/**
 * Called by the signup form *before* an OTP is sent, so a duplicate number
 * never burns an SMS. This is not a security boundary — registration re-checks
 * and the unique index is the final guard — it only saves cost and gives the
 * user the error immediately instead of after typing a code.
 *
 * Sits behind the /api/auth rate limiter, which is what keeps it from being
 * used to enumerate registered numbers.
 */
export async function checkPhoneAvailability(
  req: Request,
  res: Response,
): Promise<void> {
  const { phone, phoneCountry, role } = req.body as {
    phone?: string;
    phoneCountry?: string;
    role?: string;
  };

  if (!phone || !phoneCountry) {
    res.status(400).json({ message: "Phone number and country are required" });
    return;
  }
  if (!isSupportedCountry(phoneCountry)) {
    res.status(400).json({ message: "Unsupported country" });
    return;
  }
  if (role !== "USER" && role !== "AGENT") {
    res.status(400).json({ message: "Role must be USER or AGENT" });
    return;
  }

  const normalized = toE164(phone, phoneCountry);
  if (!normalized) {
    res.status(400).json({ message: "Please enter a valid phone number" });
    return;
  }

  // Without this the default Express handler renders the raw stack trace —
  // including absolute source paths — straight into the browser.
  try {
    if (await isPhoneTaken(normalized, role)) {
      res.status(409).json({ message: ALREADY_REGISTERED });
      return;
    }
  } catch (err) {
    console.error("[phone/check] lookup failed:", err);
    res.status(503).json({
      message: "Service is temporarily unavailable. Please try again.",
    });
    return;
  }

  res.status(200).json({ available: true, phone: normalized });
}

/**
 * The single gate every signup path goes through. Returns the E.164 number to
 * store, or throws a PhoneValidationError carrying the status to respond with.
 *
 * The number is only accepted when Firebase itself reports it as the verified
 * number on the supplied ID token — the phone in the request body is treated as
 * a claim to be checked, never as fact.
 */
export async function resolveVerifiedPhone(input: {
  phone?: string;
  phoneCountry?: string;
  firebaseIdToken?: string;
  owner: PhoneOwner;
}): Promise<string> {
  const { phone, phoneCountry, firebaseIdToken, owner } = input;

  if (!phone || !phoneCountry) {
    throw new PhoneValidationError(
      "Phone number and country are required",
      400,
    );
  }
  if (!isSupportedCountry(phoneCountry)) {
    throw new PhoneValidationError("Unsupported country", 400);
  }
  if (!firebaseIdToken) {
    throw new PhoneValidationError(
      "Please verify your phone number before continuing",
      400,
    );
  }

  const normalized = toE164(phone, phoneCountry);
  if (!normalized) {
    throw new PhoneValidationError("Please enter a valid phone number", 400);
  }

  let verifiedPhone: string;
  try {
    verifiedPhone = await verifyPhoneToken(firebaseIdToken);
  } catch (err) {
    if (err instanceof PhoneTokenError) {
      throw new PhoneValidationError(err.message, 401);
    }
    throw err;
  }

  if (verifiedPhone !== normalized) {
    throw new PhoneValidationError(
      "The verified number does not match the number you entered",
      400,
    );
  }

  // Re-check here and not only before the OTP: the window between the two is
  // long enough for another signup to claim the number.
  if (await isPhoneTaken(normalized, owner)) {
    throw new PhoneValidationError(ALREADY_REGISTERED, 409);
  }

  return normalized;
}
