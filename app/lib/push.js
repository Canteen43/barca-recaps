// Web Push settings shared by the app and the watcher. The public key is safe to publish;
// its private half lives only in the VAPID_PRIVATE_KEY repo secret (see scripts/setup-push.mjs).
export const VAPID_PUBLIC_KEY = "BIYk9dAcYogl0ZxWH82aQ5GlAJLwAe8_O_k0YxReiVBDWwzzTlGQPpyE9amzTJwPHVH7ILe6Es2sBtHJg-BcAPo";

/** Converts the base64url public key into the byte array pushManager.subscribe() expects. */
export function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
