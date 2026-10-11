// Pure watchlist logic (no DOM), so it can be unit-tested in Node.
import { parseRecapTitle } from "./parse.js";

/**
 * Watched state is stored as overrides: { [videoId]: true | false }.
 * Videos without an override fall back to their default: baseline videos (already on
 * the channel when the app was set up) count as watched, everything newer as open.
 */
export function isWatched(video, overrides) {
  if (Object.hasOwn(overrides, video.id)) return overrides[video.id] === true;
  return video.baseline === true;
}

export function enrich(videos) {
  return videos
    .map((v) => ({ ...v, info: parseRecapTitle(v.title) }))
    .filter((v) => v.info)
    .sort((a, b) => b.published.localeCompare(a.published));
}

export function partition(videos, overrides) {
  const open = [];
  const watched = [];
  for (const v of videos) (isWatched(v, overrides) ? watched : open).push(v);
  // Oldest open first: watch them in the order they were played.
  open.reverse();
  return { open, watched };
}

export function youtubeUrl(id) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

/** On Android an intent: URL reliably hands off to the YouTube app instead of a browser tab. */
export function youtubeHref(id, userAgent = "") {
  const web = youtubeUrl(id);
  if (!/Android/i.test(userAgent)) return web;
  return (
    `intent://www.youtube.com/watch?v=${encodeURIComponent(id)}` +
    `#Intent;scheme=https;package=com.google.android.youtube;` +
    `S.browser_fallback_url=${encodeURIComponent(web)};end`
  );
}
