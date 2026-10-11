import { test } from "node:test";
import assert from "node:assert/strict";
import { isWatched, partition, enrich, youtubeHref } from "../../app/lib/watchlist.js";

const v = (id, published, baseline) => ({
  id,
  title: `FC Barcelona - Team ${id} | LALIGA | DAZN`,
  published,
  ...(baseline ? { baseline } : {}),
});

test("baseline videos default to watched, new ones to open, overrides win", () => {
  assert.equal(isWatched(v("a", "2026-01-01", true), {}), true);
  assert.equal(isWatched(v("b", "2026-01-01"), {}), false);
  assert.equal(isWatched(v("a", "2026-01-01", true), { a: false }), false);
  assert.equal(isWatched(v("b", "2026-01-01"), { b: true }), true);
});

test("enrich drops unparseable titles and sorts newest first; open list is oldest first", () => {
  const videos = enrich([
    v("a", "2026-10-01T00:00:00Z"),
    v("b", "2026-10-03T00:00:00Z"),
    { id: "x", title: "junk", published: "2026-10-02" },
    v("c", "2026-10-02T00:00:00Z", true),
  ]);
  assert.deepEqual(videos.map((x) => x.id), ["b", "c", "a"]);
  const { open, watched } = partition(videos, {});
  assert.deepEqual(open.map((x) => x.id), ["a", "b"]);
  assert.deepEqual(watched.map((x) => x.id), ["c"]);
});

test("youtubeHref uses an intent URL on Android only", () => {
  assert.equal(youtubeHref("abc", "Mozilla/5.0 (Windows NT 10.0)"), "https://www.youtube.com/watch?v=abc");
  const href = youtubeHref("abc", "Mozilla/5.0 (Linux; Android 14; Pixel 8)");
  assert.match(href, /^intent:\/\/www\.youtube\.com\/watch\?v=abc#Intent;scheme=https;package=com\.google\.android\.youtube;/);
  assert.match(href, /S\.browser_fallback_url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3Dabc;end$/);
});
