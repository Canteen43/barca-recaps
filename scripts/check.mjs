// Checks DAZN Fußball for new Barça recaps, updates data/videos.json and sends a Web Push notification.
//
// Env:
//   VAPID_PRIVATE_KEY   private half of app/lib/push.js's public key (no notifications if unset)
//   PUSH_SUBSCRIPTION   subscription JSON copied from the app's Settings (an array for several devices)
//   APP_URL             URL of the deployed PWA (also used as the VAPID contact)
//   DATA_FILE           defaults to data/videos.json
// Flags:
//   --quiet        don't notify about recaps found in this run (the check was started from the app,
//                  so the recaps are already on screen)
//   --test-notify  send a test notification for the newest known recap and exit
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fetchLatestUploads } from "./lib/youtube.mjs";
import { mergeUploads } from "./lib/store.mjs";
import { buildNotification } from "./lib/notify.mjs";
import { sendPush } from "./lib/webpush.mjs";
import { VAPID_PUBLIC_KEY } from "../app/lib/push.js";

const DATA_FILE = process.env.DATA_FILE || "data/videos.json";
const appUrl = process.env.APP_URL || "";
const quiet = process.argv.includes("--quiet");

function pushConfig() {
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";
  const raw = process.env.PUSH_SUBSCRIPTION || "";
  if (!privateKey || !raw || !VAPID_PUBLIC_KEY) return null;
  const parsed = JSON.parse(raw);
  return {
    subscriptions: Array.isArray(parsed) ? parsed : [parsed],
    vapid: { publicKey: VAPID_PUBLIC_KEY, privateKey, subject: appUrl || "https://github.com" },
  };
}

async function notify(push, payload) {
  for (const [i, sub] of push.subscriptions.entries()) {
    try {
      await sendPush(sub, payload, push.vapid);
      console.log(`Notified device ${i + 1}: ${payload.title}`);
    } catch (err) {
      const hint = err.gone ? " (subscription expired: re-enable notifications in the app and update PUSH_SUBSCRIPTION)" : "";
      console.log(`::warning::Notification to device ${i + 1} failed: ${err.message}${hint}`);
    }
  }
}

async function loadStore() {
  try {
    return JSON.parse(await readFile(DATA_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const store = await loadStore();
  const push = pushConfig();

  if (process.argv.includes("--test-notify")) {
    if (!push) throw new Error("VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTION or the public key in app/lib/push.js is missing");
    const video = store?.videos?.[0];
    if (!video) throw new Error("No known recap to send a test notification for");
    const payload = buildNotification([video]);
    payload.title = "Test: " + payload.title;
    await notify(push, payload);
    return;
  }

  let result;
  try {
    result = await fetchLatestUploads();
  } catch (err) {
    // Transient YouTube hiccups should not turn every scheduled run red; the next run retries.
    console.log(`::warning::Could not fetch uploads: ${err.message}`);
    await setOutput("changed", "false");
    return;
  }
  console.log(`Fetched ${result.entries.length} uploads via ${result.source}`);

  const { store: next, changed, added, toNotify } = mergeUploads(store, result.entries);
  for (const v of added) console.log(`${v.baseline ? "Baseline" : "New"}: ${v.title}`);

  if (changed) {
    await mkdir(dirname(DATA_FILE), { recursive: true });
    await writeFile(DATA_FILE, JSON.stringify(next, null, 2) + "\n");
  }
  await setOutput("changed", String(changed));

  if (!toNotify.length) return;
  if (quiet) return console.log("Started from the app, not notifying");
  if (!push) return console.log("Push not configured, skipping notifications");
  // Oldest first, the order to watch them in.
  await notify(push, buildNotification([...toNotify].sort((a, b) => a.published.localeCompare(b.published))));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
