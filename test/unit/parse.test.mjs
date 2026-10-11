import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecapTitle, isBarca } from "../../app/lib/parse.js";

test("parses teaser, teams, matchday and competition", () => {
  const r = parseRecapTitle("Jesus gibt den perfekten Raphinha-Ersatz: FC Barcelona - FC Getafe | 8. Spieltag | LALIGA | DAZN");
  assert.deepEqual(r, {
    home: "FC Barcelona",
    away: "FC Getafe",
    isHome: true,
    opponent: "FC Getafe",
    competition: "LaLiga",
    round: "8. Spieltag",
    teaser: "Jesus gibt den perfekten Raphinha-Ersatz",
  });
});

test("handles titles without teaser and away games", () => {
  const r = parseRecapTitle("Guadalajara - FC Barcelona | 3. Runde | Copa del Rey | DAZN Highlights");
  assert.equal(r.teaser, "");
  assert.equal(r.isHome, false);
  assert.equal(r.opponent, "Guadalajara");
  assert.equal(r.competition, "Copa del Rey");
  assert.equal(r.round, "3. Runde");
});

test("handles swapped meta order, double spaces and missing round", () => {
  assert.equal(
    parseRecapTitle("Adeyemi-Premiere krönt Barca-Sieg: FC Elche - FC Barcelona | LALIGA | 2. Spieltag | DAZN Highlights").round,
    "2. Spieltag",
  );
  const r = parseRecapTitle("Barça zerlegt auch Valencia: FC Valencia - FC Barcelona |  4. Spieltag | LaLiga | DAZN Highlights");
  assert.equal(r.round, "4. Spieltag");
  assert.equal(r.competition, "LaLiga");
  const r2 = parseRecapTitle("Lewa-Doppelpack lässt Flick bei Debüt jubeln: Valencia - FC Barcelona | LaLiga | DAZN");
  assert.equal(r2.round, "");
  assert.equal(r2.competition, "LaLiga");
});

test("handles teaser ending in '?:' and extra spaces", () => {
  const r = parseRecapTitle("Schafft Barca das Mega-Comeback?:  FC Barcelona - Atletico Madrid | Halbfinale | Copa del Rey | DAZN");
  assert.equal(r.home, "FC Barcelona");
  assert.equal(r.away, "Atletico Madrid");
  assert.equal(r.teaser, "Schafft Barca das Mega-Comeback?");
  assert.equal(r.round, "Halbfinale");
});

test("ampersands in the teaser are fine", () => {
  assert.equal(
    parseRecapTitle("Adeyemi-Traumsolo & Raphinha zaubert: FC Barcelona - Santander | 6. Spieltag | LALIGA | DAZN").opponent,
    "Santander",
  );
});

test("unknown competition is kept verbatim, known ones normalized", () => {
  assert.equal(parseRecapTitle("FC Barcelona - Inter Miami | Freundschaftsspiel | DAZN").competition, "Freundschaftsspiel");
  const cl = parseRecapTitle("Yamal zaubert: Inter - FC Barcelona | Ligaphase, 3. Spieltag | Champions League | DAZN Highlights");
  assert.equal(cl.competition, "Champions League");
  assert.equal(cl.round, "Ligaphase, 3. Spieltag");
});

test("rejects non-Barça games, Espanyol Barcelona, shorts and junk", () => {
  for (const t of [
    "PLATZVERWEIS! Vini Jr. sorgt für Aufreger: Real Madrid - FC Villarreal | 8. Spieltag | LALIGA | DAZN",
    "Mourinhos LALIGA-Comeback bei Real: Espanyol Barcelona - Real Madrid | 2. Spieltag | LALIGA | DAZN",
    "Tor oder kein Tor? 🥶",
    "Derry Scherhants Lieblingsspieler 💥",
    "Wer steigt aus der Bundesliga ab?",
    "Flick nach dem Sieg gegen Getafe | Interview | DAZN",
    "FC Barcelona | Pressekonferenz | DAZN",
    "",
    null,
  ]) {
    assert.equal(parseRecapTitle(t), null, String(t));
  }
});

test("isBarca variants", () => {
  for (const t of ["FC Barcelona", "Barcelona", "Barça", "Barca", " fc barcelona "]) assert.ok(isBarca(t), t);
  for (const t of ["Espanyol Barcelona", "Barcelona SC", "Real Madrid"]) assert.ok(!isBarca(t), t);
});
