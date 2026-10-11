// Fetches the latest uploads of a YouTube channel without an API key.
// Primary source: the public RSS feed (latest 15 uploads). Fallback: the channel's /videos page.

export const CHANNEL_ID = "UClBFnQJMlinWDCvfSXj60CA"; // DAZN Fußball
export const CHANNEL_HANDLE = "DAZNFussball";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export function decodeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e] ?? m;
  });
}

/** @returns {{id: string, title: string, published: string}[]} */
export function parseFeed(xml) {
  const entries = [];
  for (const [, body] of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const id = body.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = body.match(/<title>([^<]*)<\/title>/)?.[1];
    const published = body.match(/<published>([^<]+)<\/published>/)?.[1];
    if (id && title && published) {
      entries.push({ id, title: decodeXml(title), published: new Date(published).toISOString() });
    }
  }
  return entries;
}

/** Fallback parser for the channel /videos page. Publish dates are only relative there, so `now` is used. */
export function parseChannelPage(html, now = new Date()) {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  const data = JSON.parse(m[1]);
  const out = [];
  const seen = new Set();
  (function walk(o) {
    if (!o || typeof o !== "object") return;
    const l = o.lockupViewModel;
    if (l?.contentType === "LOCKUP_CONTENT_TYPE_VIDEO" && l.contentId && !seen.has(l.contentId)) {
      const title = l.metadata?.lockupMetadataViewModel?.title?.content;
      if (title) {
        seen.add(l.contentId);
        out.push({ id: l.contentId, title, published: now.toISOString() });
      }
    }
    const v = o.videoRenderer;
    if (v?.videoId && !seen.has(v.videoId)) {
      const title = v.title?.runs?.map((r) => r.text).join("") ?? v.title?.simpleText;
      if (title) {
        seen.add(v.videoId);
        out.push({ id: v.videoId, title, published: now.toISOString() });
      }
    }
    for (const k in o) walk(o[k]);
  })(data);
  return out;
}

async function fetchText(url, { retries = 3, fetchImpl = fetch } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

export async function fetchLatestUploads({ fetchImpl = fetch, log = console, retries = 3 } = {}) {
  try {
    const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`, { fetchImpl, retries });
    const entries = parseFeed(xml);
    if (entries.length) return { source: "rss", entries };
    log.warn("RSS feed returned no entries, trying channel page");
  } catch (err) {
    log.warn(`RSS feed failed (${err.message}), trying channel page`);
  }
  const html = await fetchText(`https://www.youtube.com/@${CHANNEL_HANDLE}/videos`, { fetchImpl, retries });
  return { source: "page", entries: parseChannelPage(html) };
}
