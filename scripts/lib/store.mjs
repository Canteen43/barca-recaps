import { parseRecapTitle } from "../../app/lib/parse.js";

const NOTIFY_MAX_AGE_MS = 3 * 24 * 3600_000;

export function emptyStore(now) {
  return { version: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), videos: [] };
}

/**
 * Merges freshly fetched uploads into the store.
 * On the very first run every recap found becomes a "baseline" video (counts as watched,
 * no notification), so the watchlist starts empty and only grows with new recaps.
 *
 * @returns {{store: object, changed: boolean, added: object[], toNotify: object[]}}
 */
export function mergeUploads(store, entries, now = new Date()) {
  const firstRun = !store;
  const next = store ? structuredClone(store) : emptyStore(now);
  const byId = new Map(next.videos.map((v) => [v.id, v]));
  const added = [];
  let changed = firstRun;

  for (const e of entries) {
    if (!parseRecapTitle(e.title)) continue;
    const existing = byId.get(e.id);
    if (existing) {
      if (existing.title !== e.title) {
        existing.title = e.title;
        changed = true;
      }
      continue;
    }
    const video = { id: e.id, title: e.title, published: e.published, firstSeen: now.toISOString() };
    if (firstRun) video.baseline = true;
    next.videos.push(video);
    byId.set(e.id, video);
    added.push(video);
    changed = true;
  }

  next.videos.sort((a, b) => b.published.localeCompare(a.published));
  if (changed) next.updatedAt = now.toISOString();

  const toNotify = added.filter(
    (v) => !v.baseline && now.getTime() - new Date(v.published).getTime() < NOTIFY_MAX_AGE_MS,
  );
  return { store: next, changed, added, toNotify };
}
