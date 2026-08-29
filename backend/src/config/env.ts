import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Exactly one of the two Firebase credential sources must be present, so
// neither can use requireEnv on its own.
function requireFirebaseCredentials() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!base64 && !path) {
    throw new Error(
      "Missing Firebase credentials: set FIREBASE_SERVICE_ACCOUNT_BASE64 (production) " +
        "or FIREBASE_SERVICE_ACCOUNT_PATH (local development)",
    );
  }
  return { base64, path };
}

const firebaseCredentials = requireFirebaseCredentials();

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  PORT: process.env.PORT || "3000",

  JWT_USER_SECRET: requireEnv("JWT_USER_SECRET"),
  JWT_ADMIN_SECRET: requireEnv("JWT_ADMIN_SECRET"),
  JWT_AGENT_SECRET: requireEnv("JWT_AGENT_SECRET"),

  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  CLOUDINARY_CLOUD_NAME: requireEnv("CLOUDINARY_CLOUD_NAME"),
  CLOUDINARY_API_KEY: requireEnv("CLOUDINARY_API_KEY"),
  CLOUDINARY_API_SECRET: requireEnv("CLOUDINARY_API_SECRET"),

  FIREBASE_PROJECT_ID: requireEnv("FIREBASE_PROJECT_ID"),
  FIREBASE_SERVICE_ACCOUNT_BASE64: firebaseCredentials.base64,
  FIREBASE_SERVICE_ACCOUNT_PATH: firebaseCredentials.path,
};
