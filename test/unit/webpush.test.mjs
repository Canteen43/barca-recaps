import { test } from "node:test";
import assert from "node:assert/strict";
import { createECDH, createDecipheriv, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { encryptPayload, generateVapidKeys, sendPush, vapidAuthorization } from "../../scripts/lib/webpush.mjs";

// The receiving side as a browser implements it (RFC 8291), to check what we send can be read.
function decrypt(body, ua, auth) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", ua.computeSecret(asPublic), auth, keyInfo, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const data = body.subarray(21 + idlen);
  const decipher = createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
  assert.equal(plain.at(-1), 2, "last-record delimiter");
  return plain.subarray(0, -1).toString();
}

function fakeSubscription() {
  const ua = createECDH("prime256v1");
  ua.generateKeys();
  const auth = randomBytes(16);
  return {
    ua,
    auth,
    subscription: {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: ua.getPublicKey("base64url"), auth: auth.toString("base64url") },
    },
  };
}

test("payload is encrypted so only the subscribed browser can read it", () => {
  const { ua, auth, subscription } = fakeSubscription();
  const msg = JSON.stringify({ title: "New Barça recap", body: "FC Barcelona – FC Getafe" });
  const body = encryptPayload(msg, subscription.keys);
  assert.equal(body.readUInt32BE(16), 4096);
  assert.ok(!body.includes(Buffer.from("Barça")));
  assert.equal(decrypt(body, ua, auth), msg);
});

test("VAPID header carries a JWT signed with the private key", () => {
  const keys = generateVapidKeys();
  const header = vapidAuthorization("https://fcm.googleapis.com/fcm/send/abc", { ...keys, subject: "https://me.github.io/barca/" }, 1_700_000_000_000);
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [h, c, sig] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(c, "base64url")), { aud: "https://fcm.googleapis.com", exp: 1_700_043_200, sub: "https://me.github.io/barca/" });
  const pub = Buffer.from(keys.publicKey, "base64url");
  const key = createPublicKey({
    key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") },
    format: "jwk",
  });
  assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
  // A different key pair's signature must not verify.
  const other = vapidAuthorization("https://fcm.googleapis.com/x", { ...generateVapidKeys(), subject: "mailto:a@b.c" });
  const [oh, oc, osig] = other.match(/t=([^,]+)/)[1].split(".");
  assert.ok(!verify("sha256", Buffer.from(`${oh}.${oc}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(osig, "base64url")));
});

test("sendPush posts to the endpoint and flags expired subscriptions", async () => {
  const { ua, auth, subscription } = fakeSubscription();
  const vapid = { ...generateVapidKeys(), subject: "mailto:a@b.c" };
  let call;
  await sendPush(subscription, { title: "t" }, vapid, {
    fetchImpl: async (url, init) => {
      call = { url, init };
      return new Response(null, { status: 201 });
    },
  });
  assert.equal(call.url, subscription.endpoint);
  assert.equal(call.init.headers["Content-Encoding"], "aes128gcm");
  assert.match(call.init.headers.Authorization, /^vapid t=/);
  assert.equal(decrypt(call.init.body, ua, auth), '{"title":"t"}');

  const gone = await sendPush(subscription, {}, vapid, { fetchImpl: async () => new Response("gone", { status: 410 }) }).catch((e) => e);
  assert.equal(gone.gone, true);
  const other = await sendPush(subscription, {}, vapid, { fetchImpl: async () => new Response("bad", { status: 400 }) }).catch((e) => e);
  assert.match(other.message, /400/);
  assert.equal(other.gone, false);
  await assert.rejects(sendPush({ endpoint: "x" }, {}, vapid), /missing/);
});
