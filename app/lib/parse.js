// Parses DAZN Fußball highlight titles. Shared by the GitHub Action (Node) and the PWA (browser).
//
// Observed formats:
//   "Jesus gibt den perfekten Raphinha-Ersatz: FC Barcelona - FC Getafe | 8. Spieltag | LALIGA | DAZN"
//   "Guadalajara - FC Barcelona | 3. Runde | Copa del Rey | DAZN Highlights"
//   "Lewa-Doppelpack lässt Flick bei Debüt jubeln: Valencia - FC Barcelona | LaLiga | DAZN"

const BARCA = /^(fc\s+)?barcelona$|^bar[cç]a$/i;

const COMPETITIONS = [
  [/^la\s?liga$/i, "LaLiga"],
  [/copa del rey/i, "Copa del Rey"],
  [/supercopa/i, "Supercopa"],
  [/champions league/i, "Champions League"],
  [/europa league/i, "Europa League"],
  [/club world cup|klub-wm/i, "Klub-WM"],
  [/testspiel|friendly|trofeo|gamper/i, "Testspiel"],
];

const ROUND = /spieltag|runde|finale|hinspiel|rückspiel|playoff|play-off|gruppe|ligaphase|league phase/i;

export function isBarca(team) {
  return BARCA.test(team.trim());
}

/**
 * @returns {null | {home: string, away: string, isHome: boolean, opponent: string,
 *   competition: string, round: string, teaser: string}}
 */
export function parseRecapTitle(title) {
  if (typeof title !== "string") return null;
  const segments = title.split("|").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (segments.length < 2) return null;

  let head = segments[0];
  let meta = segments.slice(1);
  if (/^dazn\b/i.test(meta[meta.length - 1])) meta = meta.slice(0, -1);

  let teaser = "";
  const colon = head.lastIndexOf(": ");
  if (colon !== -1) {
    teaser = head.slice(0, colon).trim();
    head = head.slice(colon + 2).trim();
  }

  const teams = head.split(/\s+[-–—]\s+/);
  if (teams.length !== 2) return null;
  const [home, away] = teams.map((t) => t.trim());
  if (!home || !away) return null;
  const homeIsBarca = isBarca(home);
  const awayIsBarca = isBarca(away);
  if (homeIsBarca === awayIsBarca) return null;

  let competition = "";
  const rounds = [];
  for (const m of meta) {
    const known = COMPETITIONS.find(([re]) => re.test(m));
    if (known && !competition) competition = known[1];
    else if (ROUND.test(m)) rounds.push(m);
    else if (!competition) competition = m;
    else rounds.push(m);
  }

  return {
    home,
    away,
    isHome: homeIsBarca,
    opponent: homeIsBarca ? away : home,
    competition,
    round: rounds.join(" · "),
    teaser,
  };
}
