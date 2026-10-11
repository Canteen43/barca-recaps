// Push notifications via ntfy.sh (free, no account; install the ntfy Android app and subscribe to the topic).
import { parseRecapTitle } from "../../app/lib/parse.js";

export function buildNotification(video, { topic, appUrl }) {
  const info = parseRecapTitle(video.title);
  const matchup = info ? `${info.home} – ${info.away}` : video.title;
  const meta = info ? [info.competition, info.round].filter(Boolean).join(" · ") : "";
  const youtube = `https://www.youtube.com/watch?v=${video.id}`;
  const msg = {
    topic,
    title: "New Barça recap",
    // No teaser and no thumbnail: those often spoil the result.
    message: meta ? `${matchup}\n${meta}` : matchup,
    tags: ["soccer"],
    priority: 4,
    click: appUrl ? `${appUrl.replace(/\/?$/, "/")}#/v/${video.id}` : youtube,
    actions: [{ action: "view", label: "▶ YouTube", url: youtube, clear: true }],
  };
  return msg;
}

export async function sendNotification(msg, { server = "https://ntfy.sh", fetchImpl = fetch } = {}) {
  const res = await fetchImpl(server, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error(`ntfy responded ${res.status}: ${await res.text()}`);
}
