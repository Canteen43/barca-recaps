// Minimal Web Push sender with no dependencies: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291).
// Only the holder of the VAPID private key can push to a subscription created with the matching public key.
import { createECDH, createPrivateKey, createCipheriv, hkdfSync, randomBytes, sign } from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const fromB64u = (s) => Buffer.from(s, "base64url");

/** @returns {{publicKey: string, privateKey: string}} base64url-encoded P-256 key pair */
export function generateVapidKeys() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function vapidKeyObject(publicKey, privateKey) {
  const pub = fromB64u(publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID public key must be an uncompressed P-256 point");
  return createPrivateKey({
    key: { kty: "EC", crv: "P-256", d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) },
    format: "jwk",
  });
}

export function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, now = Date.now()) {
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const unsigned = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: vapidKeyObject(publicKey, privateKey), dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${b64u(signature)}, k=${publicKey}`;
}

/** Encrypts a payload for one subscription as a single aes128gcm record. */
export function encryptPayload(payload, { p256dh, auth }, { salt = randomBytes(16), ecdh } = {}) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (!ecdh) {
    ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
  }
  const asPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(uaPublic);

  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", sharedSecret, authSecret, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));

  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  // 0x02 marks the last (and only) record, no padding.
  const body = Buffer.concat([cipher.update(Buffer.from(payload)), cipher.update(Buffer.from([2])), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

/**
 * Sends one push message. Throws on failure; `err.gone` is true when the subscription no longer exists
 * (the app was reinstalled or its data cleared) and has to be re-created in the app's Settings.
 */
export async function sendPush(subscription, payload, vapid, { ttl = 24 * 3600, fetchImpl = fetch } = {}) {
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    throw new Error("push subscription is missing endpoint or keys");
  }
  const res = await fetchImpl(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: vapidAuthorization(subscription.endpoint, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "normal",
    },
    body: encryptPayload(JSON.stringify(payload), subscription.keys),
  });
  if (!res.ok) {
    const err = new Error(`push service responded ${res.status}: ${await res.text()}`);
    err.gone = res.status === 404 || res.status === 410;
    throw err;
  }
}
