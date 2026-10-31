import { test } from "node:test";
import assert from "node:assert/strict";
import { repoFromLocation, recapDue, mayAutoCheck, nextLog, MAX_AUTO_CHECKS } from "../../app/lib/checks.js";

const H = 3600_000;
const match = { id: "401", date: "2026-10-10T16:30Z" };
const kickoff = new Date(match.date).getTime();
const older = [{ id: "a", published: "2026-09-19T21:24:40Z" }];

test("repo is read from the GitHub Pages URL", () => {
  assert.deepEqual(repoFromLocation({ hostname: "canteen43.github.io", pathname: "/barca-recaps/" }), { owner: "canteen43", repo: "barca-recaps" });
  assert.equal(repoFromLocation({ hostname: "localhost", pathname: "/" }), null);
  assert.equal(repoFromLocation({ hostname: "me.github.io", pathname: "/" }), null);
});

test("a recap is due from 2 h after kickoff until it shows up", () => {
  assert.equal(recapDue(match, older, kickoff + 1.5 * H), false); // still playing
  assert.equal(recapDue(match, older, kickoff + 2.5 * H), true);
  assert.equal(recapDue(match, [...older, { id: "b", published: "2026-10-10T18:59:32Z" }], kickoff + 2.5 * H), false);
  assert.equal(recapDue(match, older, kickoff + 20 * H), false); // the daily run has it covered
  assert.equal(recapDue(null, older, kickoff), false);
});

test("automatic checks are throttled and capped per match", () => {
  const t = kickoff + 3 * H;
  assert.equal(mayAutoCheck(match, null, t), true);
  let log = nextLog(match, null, t);
  assert.equal(mayAutoCheck(match, log, t + 5 * 60_000), false);
  assert.equal(mayAutoCheck(match, log, t + 16 * 60_000), true);
  for (let i = 1; i < MAX_AUTO_CHECKS; i++) log = nextLog(match, log, t + i * H);
  assert.equal(log.count, MAX_AUTO_CHECKS);
  assert.equal(mayAutoCheck(match, log, t + 10 * H), false);
  // A new match starts over.
  assert.equal(mayAutoCheck({ id: "402", date: "2026-10-17T19:00Z" }, log, t + 10 * H), true);
});
