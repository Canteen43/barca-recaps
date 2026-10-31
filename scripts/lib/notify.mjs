// Builds the Web Push payload for new recaps. The service worker (app/sw.js) turns it into a notification
// and only ever opens URLs it builds itself from the video IDs, never URLs from the payload.
import { parseRecapTitle } from "../../app/lib/parse.js";

const line = (video) => {
  const info = parseRecapTitle(video.title);
  return info ? `${info.home} – ${info.away}` : video.title;
};

export function buildNotification(videos) {
  if (videos.length === 1) {
    const info = parseRecapTitle(videos[0].title);
    const meta = info ? [info.competition, info.round].filter(Boolean).join(" · ") : "";
    return {
      title: "New Barça recap",
      // No teaser and no thumbnail: those often spoil the result.
      body: meta ? `${line(videos[0])}\n${meta}` : line(videos[0]),
      ids: [videos[0].id],
    };
  }
  return {
    title: `${videos.length} new Barça recaps`,
    body: videos.map(line).join("\n"),
    ids: videos.map((v) => v.id),
  };
}
