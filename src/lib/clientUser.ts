"use client";

// Client-side identity for the no-login access model. The "user id" is a stable random
// UUID generated once per browser and persisted in localStorage — it is the bearer token
// for entitlements (unguessable, so it can't be enumerated). Email is captured at
// checkout so receipts, the billing portal, and trial-abuse checks key to a real address.
//
// When real auth (magic-link / OAuth) is added, swap getOrCreateUserId for the session id.

const USER_ID_KEY = "userId";
const EMAIL_KEY = "email";

function randomId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {/* fall through */}
  return `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

// Returns the stable per-browser user id, generating + persisting one on first call.
// Safe to call during render — returns "" on the server (no localStorage there).
export function getOrCreateUserId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = localStorage.getItem(USER_ID_KEY);
    // Migrate the old throwaway ids ("guest_*") to a stable UUID so access sticks.
    if (!id || id.startsWith("guest_")) {
      id = randomId();
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function getStoredEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    const e = localStorage.getItem(EMAIL_KEY) || "";
    return e === "guest@himothypicks.com" ? "" : e;
  } catch {
    return "";
  }
}

export function setStoredEmail(email: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(EMAIL_KEY, email.trim().toLowerCase()); } catch {/* ignore */}
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
