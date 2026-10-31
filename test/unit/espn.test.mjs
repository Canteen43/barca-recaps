import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeStandings, normalizeFixtures, latestResult } from "../../app/lib/espn.js";

const load = (f) => JSON.parse(readFileSync(new URL(`../fixtures/${f}`, import.meta.url), "utf8"));

test("normalizes LaLiga standings", () => {
  const { rows, season } = normalizeStandings(load("espn-standings.json"));
  assert.equal(rows.length, 20);
  assert.match(season, /LALIGA/i);
  assert.deepEqual(rows.map((r) => r.rank), Array.from({ length: 20 }, (_, i) => i + 1));
  const barca = rows.find((r) => r.isBarca);
  assert.equal(barca.points, 24);
  assert.equal(barca.won + barca.drawn + barca.lost, barca.played);
  assert.equal(barca.goalsFor - barca.goalsAgainst, barca.goalDiff);
});

test("normalizes upcoming fixtures across competitions", () => {
  const list = normalizeFixtures(load("espn-fixtures.json"), new Date("2026-10-11T19:00:00Z"));
  assert.ok(list.length > 5);
  assert.equal(list[0].home.name, "Galatasaray");
  assert.equal(list[0].competition, "UEFA Champions League");
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(list, sorted);
  assert.ok(list.every((f) => f.home.id === "83" || f.away.id === "83"));
});

test("finds the most recent completed match", () => {
  const json = load("espn-results.json");
  const latest = latestResult(json);
  assert.ok(latest.id && latest.date);
  const completed = json.events.filter((e) => e.competitions[0].status.type.completed).map((e) => e.date);
  assert.equal(latest.date, completed.sort().at(-1));
  // A match that hasn't finished doesn't count.
  const live = { id: "live", date: "2099-01-01T00:00Z", competitions: [{ status: { type: { completed: false } } }] };
  assert.equal(latestResult({ events: [...json.events, live] }).id, latest.id);
});

test("tolerates empty or broken payloads", () => {
  assert.deepEqual(normalizeStandings({}).rows, []);
  assert.deepEqual(normalizeFixtures(null), []);
  assert.equal(latestResult(null), null);
});
