import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// These values are not secrets — the Firebase web config ships to every browser
// by design. Access is controlled by the Authorized domains list in the Firebase
// console and by our own backend verifying the ID token. They live in .env only
// so that dev/staging/prod can point at different Firebase projects.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);

// The OTP SMS should be in the user's own language where Firebase supports it.
firebaseAuth.useDeviceLanguage();
