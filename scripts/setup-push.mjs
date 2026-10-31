// One-time setup: generates a VAPID key pair, writes the public key into app/lib/push.js and stores
// the private key as the VAPID_PRIVATE_KEY repo secret via the GitHub CLI. The private key is never printed.
// Re-running it rotates the keys; existing push subscriptions then stop working and must be re-created.
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { generateVapidKeys } from "./lib/webpush.mjs";

const FILE = "app/lib/push.js";
const { publicKey, privateKey } = generateVapidKeys();

const gh = spawnSync("gh", ["secret", "set", "VAPID_PRIVATE_KEY"], { input: privateKey, stdio: ["pipe", "inherit", "inherit"] });
if (gh.status !== 0) {
  console.error("Could not set the secret (is the GitHub CLI installed and logged in?). Nothing was changed.");
  process.exit(1);
}

const src = await readFile(FILE, "utf8");
await writeFile(FILE, src.replace(/VAPID_PUBLIC_KEY = "[^"]*"/, `VAPID_PUBLIC_KEY = "${publicKey}"`));
console.log(`Stored VAPID_PRIVATE_KEY and wrote the public key to ${FILE}:\n${publicKey}`);
