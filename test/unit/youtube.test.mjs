import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFeed, parseChannelPage, decodeXml, fetchLatestUploads } from "../../scripts/lib/youtube.mjs";

const feed = readFileSync(new URL("../fixtures/feed.xml", import.meta.url), "utf8");
const page = readFileSync(new URL("../fixtures/channel-videos.html", import.meta.url), "utf8");
const quiet = { warn() {} };

test("parses the real RSS feed", () => {
  const entries = parseFeed(feed);
  assert.equal(entries.length, 15);
  const getafe = entries.find((e) => e.title.includes("FC Getafe"));
  assert.ok(getafe);
  assert.match(getafe.id, /^[\w-]{11}$/);
  assert.equal(getafe.published, "2026-10-10T18:59:32.000Z");
});

test("parses the channel page fallback", () => {
  const entries = parseChannelPage(page);
  assert.ok(entries.length >= 15, `got ${entries.length}`);
  const feedIds = new Set(parseFeed(feed).map((e) => e.id));
  assert.ok(entries.filter((e) => feedIds.has(e.id)).length >= 5, "page and feed should overlap (page omits Shorts)");
  assert.ok(entries.some((e) => e.title.includes("FC Barcelona - FC Getafe")));
});

test("decodes XML entities", () => {
  assert.equal(decodeXml("Tom &amp; Jerry &quot;x&quot; &#39;y&#39; &#x1F600;"), "Tom & Jerry \"x\" 'y' 😀");
});

test("falls back to the channel page when RSS fails", async () => {
  const fetchImpl = async (url) =>
    url.includes("feeds/videos.xml") ? new Response("nope", { status: 500 }) : new Response(page, { status: 200 });
  const res = await fetchLatestUploads({ fetchImpl, log: quiet, retries: 1 });
  assert.equal(res.source, "page");
  assert.ok(res.entries.length >= 15);
});

test("uses RSS when it works", async () => {
  const res = await fetchLatestUploads({ fetchImpl: async () => new Response(feed), log: quiet });
  assert.equal(res.source, "rss");
});
