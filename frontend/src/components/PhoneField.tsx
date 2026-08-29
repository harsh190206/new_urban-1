import { useCallback, useEffect, useRef, useState } from "react";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
} from "firebase/auth";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "../api";
import { firebaseAuth } from "../config/firebase";

function IndiaFlag() {
  return (
    <svg width="22" height="15" viewBox="0 0 22 15" xmlns="http://www.w3.org/2000/svg">
      <rect width="22" height="5" fill="#FF9933" />
      <rect y="5" width="22" height="5" fill="#FFFFFF" />
      <rect y="10" width="22" height="5" fill="#138808" />
      <circle cx="11" cy="7.5" r="2" fill="none" stroke="#000080" strokeWidth="0.6" />
      <circle cx="11" cy="7.5" r="0.4" fill="#000080" />
    </svg>
  );
}

function USAFlag() {
  return (
    <svg width="22" height="15" viewBox="0 0 22 15" xmlns="http://www.w3.org/2000/svg">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <rect key={i} y={i * 2.5} width="22" height="2.5" fill={i % 2 === 0 ? "#B22234" : "#FFFFFF"} />
      ))}
      <rect width="9" height="8" fill="#3C3B6E" />
    </svg>
  );
}

export const COUNTRIES = [
  { value: "INDIA", label: "India", code: "+91", digits: 10, Flag: IndiaFlag },
  { value: "USA", label: "USA", code: "+1", digits: 10, Flag: USAFlag },
];

const RESEND_SECONDS = 30;

/** Mirrors backend/src/utils/phone.ts so the two never disagree on what is valid. */
function toE164(phone: string, country: string): string | null {
  const c = COUNTRIES.find((x) => x.value === country) ?? COUNTRIES[0];
  let digits = phone.replace(/\D/g, "");
  const bare = c.code.slice(1);
  if (digits.length > c.digits && digits.startsWith(bare)) digits = digits.slice(bare.length);
  if (digits.length !== c.digits) return null;
  if (country === "INDIA" && !/^[6-9]/.test(digits)) return null;
  return `${c.code}${digits}`;
}

function firebaseErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";

  // Always surface the raw error — without it an unmapped code shows up as a
  // generic "try again" and there is nothing left to debug from.
  console.error("[PhoneField] Firebase auth error:", code, err);

  switch (code) {
    case "auth/invalid-phone-number":
      return "That phone number doesn't look right.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/invalid-verification-code":
      return "Incorrect OTP. Please check and try again.";
    case "auth/code-expired":
      return "This OTP has expired. Please request a new one.";
    case "auth/quota-exceeded":
      return "SMS limit reached. Please try again later.";
    case "auth/captcha-check-failed":
    case "auth/invalid-app-credential":
      // reCAPTCHA token was rejected by Firebase. In practice this is a project
      // configuration problem (Phone sign-in disabled, or this domain missing
      // from Authorized domains) far more often than a user problem.
      return "Phone sign-in is not configured for this site yet. (auth/invalid-app-credential)";
    case "auth/operation-not-allowed":
      return "Phone sign-in is not enabled on this Firebase project. (auth/operation-not-allowed)";
    case "auth/billing-not-enabled":
      return "Phone sign-in needs billing enabled on the Firebase project. (auth/billing-not-enabled)";
    case "auth/network-request-failed":
      return "Network blocked the verification request. Check your connection, VPN or ad blocker.";
    default:
      return `Could not verify your number. (${code || "unknown error"})`;
  }
}

type Props = {
  phone: string;
  phoneCountry: string;
  onChange: (next: { phone: string; phoneCountry: string }) => void;
  /** Fires with the Firebase ID token once verified, and with null whenever verification is invalidated. */
  onVerifiedChange: (idToken: string | null) => void;
  role: "USER" | "AGENT";
};

/**
 * Phone input that will not report a number as usable until Firebase has
 * confirmed, by OTP, that the person signing up controls it.
 *
 * Availability is checked against our backend *before* the SMS goes out, so a
 * number that is already registered costs nothing and the user is told straight
 * away instead of after typing a code.
 */
export default function PhoneField({ phone, phoneCountry, onChange, onVerifiedChange, role }: Props) {
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [otp, setOtp] = useState("");
  const [stage, setStage] = useState<"idle" | "code-sent" | "verified">("idle");
  const [busy, setBusy] = useState<"sending" | "verifying" | null>(null);
  const [resendIn, setResendIn] = useState(0);

  const countryPickerRef = useRef<HTMLDivElement>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  const country = COUNTRIES.find((c) => c.value === phoneCountry) ?? COUNTRIES[0];
  const e164 = toE164(phone, phoneCountry);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (countryPickerRef.current && !countryPickerRef.current.contains(e.target as Node)) {
        setShowCountryPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Tear down the reCAPTCHA widget on unmount, otherwise remounting the form
  // (switching Customer/Partner tabs) leaves an orphaned widget behind and the
  // next render fails with "reCAPTCHA has already been rendered".
  useEffect(() => {
    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, []);

  /** Any edit to the number invalidates a completed verification. */
  const invalidate = useCallback(() => {
    confirmationRef.current = null;
    setOtp("");
    setStage("idle");
    onVerifiedChange(null);
  }, [onVerifiedChange]);

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ phone: e.target.value.replace(/\D/g, ""), phoneCountry });
    if (stage !== "idle") invalidate();
  };

  const pickCountry = (value: string) => {
    onChange({ phone, phoneCountry: value });
    setShowCountryPicker(false);
    if (stage !== "idle") invalidate();
  };

  // A fresh verifier per send: a used one cannot produce a second token.
  //
  // clear() detaches the widget but leaves its markup in the container, and
  // rendering a second widget into a container that still holds one fails. So
  // each attempt gets its own empty child div to render into.
  const freshVerifier = () => {
    verifierRef.current?.clear();
    const host = recaptchaRef.current!;
    host.innerHTML = "";
    const slot = document.createElement("div");
    host.appendChild(slot);

    verifierRef.current = new RecaptchaVerifier(firebaseAuth, slot, {
      size: "invisible",
    });
    return verifierRef.current;
  };

  const sendOtp = async () => {
    if (!e164) {
      toast.error("Please enter a valid phone number");
      return;
    }
    setBusy("sending");
    try {
      // Cheap check first — never spend an SMS on a number that cannot be used.
      await api.post("/auth/phone/check", { phone: e164, phoneCountry, role });

      confirmationRef.current = await signInWithPhoneNumber(firebaseAuth, e164, freshVerifier());
      setStage("code-sent");
      setOtp("");
      setResendIn(RESEND_SECONDS);
      toast.success(`OTP sent to ${e164}`);
    } catch (err: any) {
      // Our backend rejected it (already registered / invalid) …
      if (err?.response) {
        toast.error(err.response.data?.message || "Could not send OTP");
      } else {
        // … or Firebase did.
        toast.error(firebaseErrorMessage(err));
      }
      verifierRef.current?.clear();
      verifierRef.current = null;
    } finally {
      setBusy(null);
    }
  };

  const verifyOtp = async () => {
    if (!confirmationRef.current || otp.length < 6) return;
    setBusy("verifying");
    try {
      const credential = await confirmationRef.current.confirm(otp);
      const idToken = await credential.user.getIdToken();

      // The token is all we need; the Firebase session itself is not used for
      // app auth (that is our own JWT), so don't leave one lying around.
      await signOut(firebaseAuth);

      setStage("verified");
      onVerifiedChange(idToken);
      toast.success("Phone number verified");
    } catch (err: any) {
      toast.error(firebaseErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const verified = stage === "verified";

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative w-[110px] flex-shrink-0" ref={countryPickerRef}>
          <button
            type="button"
            disabled={verified}
            onClick={() => setShowCountryPicker((v) => !v)}
            className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 outline-none text-sm cursor-pointer flex items-center justify-between gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <country.Flag />
            <span className="text-xs">{country.code}</span>
            <ChevronDown size={12} className="text-gray-400 shrink-0" />
          </button>
          {showCountryPicker && (
            <div className="absolute z-30 w-full bg-white border border-gray-200 rounded-md shadow-lg mt-1">
              {COUNTRIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => pickCountry(c.value)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex items-center gap-2"
                >
                  <c.Flag />
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <input
          type="text"
          inputMode="numeric"
          required
          value={phone}
          onChange={handlePhoneInput}
          readOnly={verified}
          className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 focus:bg-white outline-none text-sm min-w-0 read-only:text-gray-500"
          placeholder="Phone number"
        />

        {verified ? (
          <span className="flex items-center gap-1 px-2.5 rounded-md bg-green-50 border border-green-200 text-green-600 text-xs font-semibold whitespace-nowrap">
            <Check size={13} /> Verified
          </span>
        ) : (
          <button
            type="button"
            onClick={sendOtp}
            disabled={!e164 || busy !== null || resendIn > 0}
            className="px-3 rounded-md bg-gray-900 text-white text-xs font-semibold whitespace-nowrap hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 transition-all"
          >
            {busy === "sending" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : resendIn > 0 ? (
              `${resendIn}s`
            ) : stage === "code-sent" ? (
              "Resend"
            ) : (
              "Verify"
            )}
          </button>
        )}
      </div>

      {stage === "code-sent" && (
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md focus:ring-1 focus:ring-gray-400 focus:bg-white outline-none text-sm tracking-[0.3em] min-w-0"
            placeholder="Enter OTP"
            autoFocus
          />
          <button
            type="button"
            onClick={verifyOtp}
            disabled={otp.length < 6 || busy !== null}
            className="px-4 rounded-md bg-gray-900 text-white text-xs font-semibold whitespace-nowrap hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 transition-all"
          >
            {busy === "verifying" ? <Loader2 size={13} className="animate-spin" /> : "Confirm"}
          </button>
        </div>
      )}

      {!verified && stage === "idle" && (
        <p className="text-[10px] text-gray-400">
          We'll send a one-time code to confirm this number.
        </p>
      )}

      {/* Invisible reCAPTCHA mounts here — required by Firebase phone auth. */}
      <div ref={recaptchaRef} />
    </div>
  );
}
