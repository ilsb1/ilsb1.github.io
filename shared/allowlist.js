/** Addresses that may request a sign-in code. Checked only on the server. */
export const ALLOWED_EMAILS = ["sevinjhasanov@yahoo.com", "eldarh079@gmail.com"];

const ALLOWED = new Set(ALLOWED_EMAILS);

export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isAllowedEmail(value) {
  return ALLOWED.has(normalizeEmail(value));
}
