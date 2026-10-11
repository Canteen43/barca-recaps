import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeUploads } from "../../scripts/lib/store.mjs";
import { parseFeed } from "../../scripts/lib/youtube.mjs";

const feed = parseFeed(readFileSync(new URL("../fixtures/feed.xml", import.meta.url), "utf8"));
const now = new Date("2026-10-11T19:00:00Z");

test("first run stores current recaps as baseline without notifying", () => {
  const { store, changed, added, toNotify } = mergeUploads(null, feed, now);
  assert.ok(changed);
  assert.equal(added.length, 1); // only Barça - Getafe is in the fixture
  assert.ok(store.videos.every((v) => v.baseline === true));
  assert.equal(toNotify.length, 0);
});

test("new recap on a later run is added and notified", () => {
  const { store } = mergeUploads(null, feed, now);
  const fresh = {
    id: "NEWVIDEO001",
    title: "Krimi: Real Betis - FC Barcelona | 9. Spieltag | LALIGA | DAZN Highlights",
    published: "2026-10-17T20:30:00.000Z",
  };
  const later = new Date("2026-10-17T20:45:00Z");
  const r = mergeUploads(store, [fresh, ...feed], later);
  assert.ok(r.changed);
  assert.deepEqual(r.toNotify.map((v) => v.id), ["NEWVIDEO001"]);
  assert.equal(r.store.videos[0].id, "NEWVIDEO001");
  assert.equal(r.store.videos[0].baseline, undefined);
  assert.equal(r.store.videos[0].firstSeen, later.toISOString());
});

test("unchanged feed reports no change", () => {
  const { store } = mergeUploads(null, feed, now);
  const r = mergeUploads(store, feed, new Date("2026-10-11T19:15:00Z"));
  assert.equal(r.changed, false);
  assert.equal(r.store.updatedAt, store.updatedAt);
});

test("title edits are applied without notifying", () => {
  const { store } = mergeUploads(null, feed, now);
  const id = store.videos[0].id;
  const edited = feed.map((e) => (e.id === id ? { ...e, title: e.title + " Highlights" } : e));
  const r = mergeUploads(store, edited, now);
  assert.ok(r.changed);
  assert.equal(r.toNotify.length, 0);
  assert.ok(r.store.videos[0].title.endsWith(" Highlights"));
});

test("old recaps that show up late are added but not notified", () => {
  const { store } = mergeUploads(null, [], now);
  const old = { id: "OLDVIDEO001", title: "FC Barcelona - FC Sevilla | 1. Spieltag | LALIGA | DAZN", published: "2026-08-15T20:00:00.000Z" };
  const r = mergeUploads(store, [old], now);
  assert.equal(r.added.length, 1);
  assert.equal(r.toNotify.length, 0);
});

test("non-recap uploads are ignored", () => {
  const { store } = mergeUploads(null, [], now);
  const r = mergeUploads(store, [{ id: "X", title: "Tor oder kein Tor? 🥶", published: now.toISOString() }], now);
  assert.equal(r.changed, false);
});
