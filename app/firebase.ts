import { getApp, getApps, initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
} from "firebase/auth";
import { getDatabase } from "firebase/database";
import type { Analytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDUUr8BqErXGKZ8NZzxFr0qRlj3ze_1ld0",
  authDomain: "andrews-macro-counter.firebaseapp.com",
  databaseURL: "https://andrews-macro-counter-default-rtdb.firebaseio.com",
  projectId: "andrews-macro-counter",
  storageBucket: "andrews-macro-counter.firebasestorage.app",
  messagingSenderId: "100608954989",
  appId: "1:100608954989:web:624df0e2d6a61eea20a564",
  measurementId: "G-0WL2C3B2F6",
};

export const firebaseDatabaseUrl =
  "https://andrews-macro-counter-default-rtdb.firebaseio.com";
export const firebaseAuthDomain = firebaseConfig.authDomain;

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firebaseDatabase = getDatabase(firebaseApp, firebaseDatabaseUrl);

export const googleAuthProvider = new GoogleAuthProvider();
googleAuthProvider.setCustomParameters({ prompt: "select_account" });

let analyticsPromise: Promise<Analytics | null> | null = null;
let authPersistencePromise: Promise<void> | null = null;

export function prepareFirebaseAuth() {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  authPersistencePromise ??= setPersistence(
    firebaseAuth,
    browserLocalPersistence,
  ).catch(() => undefined);

  return authPersistencePromise;
}

export function initializeFirebaseAnalytics() {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  analyticsPromise ??= import("firebase/analytics")
    .then(async ({ getAnalytics, isSupported }) =>
      (await isSupported()) ? getAnalytics(firebaseApp) : null,
    )
    .catch(() => null);

  return analyticsPromise;
}
