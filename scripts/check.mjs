// Checks DAZN Fußball for new Barça recaps, updates data/videos.json and sends push notifications.
//
// Env:
//   NTFY_TOPIC   ntfy topic to notify (no notifications if unset)
//   NTFY_SERVER  defaults to https://ntfy.sh
//   APP_URL      URL of the deployed PWA (notification tap opens it)
//   DATA_FILE    defaults to data/videos.json
// Flags:
//   --test-notify  send a test notification for the newest known recap and exit
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fetchLatestUploads } from "./lib/youtube.mjs";
import { mergeUploads } from "./lib/store.mjs";
import { buildNotification, sendNotification } from "./lib/notify.mjs";

const DATA_FILE = process.env.DATA_FILE || "data/videos.json";
const topic = process.env.NTFY_TOPIC || "";
const server = process.env.NTFY_SERVER || "https://ntfy.sh";
const appUrl = process.env.APP_URL || "";

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

  if (process.argv.includes("--test-notify")) {
    if (!topic) throw new Error("NTFY_TOPIC is not set");
    const video = store?.videos?.[0];
    if (!video) throw new Error("No known recap to send a test notification for");
    const msg = buildNotification(video, { topic, appUrl });
    msg.title = "Test: " + msg.title;
    await sendNotification(msg, { server });
    console.log("Test notification sent.");
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

  if (!topic) {
    if (toNotify.length) console.log("NTFY_TOPIC not set, skipping notifications");
    return;
  }
  for (const v of toNotify) {
    try {
      await sendNotification(buildNotification(v, { topic, appUrl }), { server });
      console.log(`Notified: ${v.id}`);
    } catch (err) {
      console.log(`::warning::Notification failed for ${v.id}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
