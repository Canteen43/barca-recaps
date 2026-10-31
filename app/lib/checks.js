// When the app may ask GitHub Actions to look for a recap right away (pure logic, unit-tested in Node).
// Normally the watcher runs once a day; this covers "they just played and I can't wait until tomorrow".

// DAZN publishes about 2.5 h after kickoff (≈35 min after full time); start looking a bit earlier.
export const LOOK_FROM_MS = 2 * 3600_000;
// After this the daily run picks it up anyway.
export const LOOK_UNTIL_MS = 18 * 3600_000;
export const MIN_GAP_MS = 15 * 60_000;
export const MAX_AUTO_CHECKS = 3;

/** owner/repo of a GitHub Pages project site, e.g. https://me.github.io/barca-recaps/ */
export function repoFromLocation({ hostname, pathname }) {
  const owner = hostname.match(/^([\w-]+)\.github\.io$/i)?.[1];
  const repo = pathname.split("/").filter(Boolean)[0];
  return owner && repo ? { owner, repo } : null;
}

/** A match ended recently and its recap isn't in the list yet. */
export function recapDue(match, videos, now = Date.now()) {
  if (!match) return false;
  const kickoff = new Date(match.date).getTime();
  if (now < kickoff + LOOK_FROM_MS || now > kickoff + LOOK_UNTIL_MS) return false;
  return !videos.some((v) => new Date(v.published).getTime() >= kickoff);
}

/**
 * Throttles automatic checks per match. `log` is { matchId, count, at } from the last automatic check.
 * Some matches never get a DAZN recap, so give up after a few tries.
 */
export function mayAutoCheck(match, log, now = Date.now()) {
  if (!log || log.matchId !== match.id) return true;
  return log.count < MAX_AUTO_CHECKS && now - log.at >= MIN_GAP_MS;
}

export function nextLog(match, log, now = Date.now()) {
  return { matchId: match.id, count: log?.matchId === match.id ? log.count + 1 : 1, at: now };
}
