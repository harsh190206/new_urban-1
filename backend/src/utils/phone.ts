/**
 * Phone numbers are stored in E.164 ("+919876543210") because that is exactly
 * the format Firebase reports back after an OTP verification. Storing anything
 * else would make the verified number and the stored number impossible to
 * compare reliably.
 */

const COUNTRIES = {
  INDIA: { dialCode: "+91", nationalDigits: 10 },
  USA: { dialCode: "+1", nationalDigits: 10 },
} as const;

export type PhoneCountry = keyof typeof COUNTRIES;

export function isSupportedCountry(value: unknown): value is PhoneCountry {
  return typeof value === "string" && value in COUNTRIES;
}

/**
 * Turns a national number plus a country into E.164, or returns null when the
 * input cannot be a valid number for that country.
 *
 * Accepts input that already carries the dial code (users paste "+91 98765…"
 * surprisingly often) as well as bare national digits.
 */
export function toE164(phone: string, country: string): string | null {
  const { dialCode, nationalDigits } = isSupportedCountry(country)
    ? COUNTRIES[country]
    : COUNTRIES.INDIA;

  let digits = phone.replace(/\D/g, "");

  // Strip a leading dial code if the caller already included it.
  const bareDialCode = dialCode.slice(1);
  if (digits.length > nationalDigits && digits.startsWith(bareDialCode)) {
    digits = digits.slice(bareDialCode.length);
  }

  if (digits.length !== nationalDigits) return null;
  if (country === "INDIA" && !/^[6-9]/.test(digits)) return null; // Indian mobiles start 6-9

  return `${dialCode}${digits}`;
}
