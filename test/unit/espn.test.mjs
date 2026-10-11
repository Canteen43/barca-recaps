import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeStandings, normalizeFixtures } from "../../app/lib/espn.js";

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

test("tolerates empty or broken payloads", () => {
  assert.deepEqual(normalizeStandings({}).rows, []);
  assert.deepEqual(normalizeFixtures(null), []);
});
