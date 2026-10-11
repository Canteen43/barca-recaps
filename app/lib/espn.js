// Normalizers for ESPN's public (unofficial) soccer API. Pure functions, unit-tested with fixtures.

export const BARCA_ESPN_ID = "83";
export const STANDINGS_URL = "https://site.api.espn.com/apis/v2/sports/soccer/esp.1/standings";
export const FIXTURES_URL = `https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${BARCA_ESPN_ID}/schedule?fixture=true`;

const stat = (entry, name) => {
  const s = entry.stats?.find((x) => x.name === name);
  return s ? Number(s.value ?? s.displayValue) : 0;
};

export function normalizeStandings(json) {
  const group = json?.children?.[0];
  const entries = group?.standings?.entries ?? [];
  const rows = entries
    .map((e) => ({
      id: e.team.id,
      name: e.team.shortDisplayName || e.team.displayName,
      abbr: e.team.abbreviation,
      logo: e.team.logos?.[0]?.href ?? "",
      rank: stat(e, "rank"),
      played: stat(e, "gamesPlayed"),
      won: stat(e, "wins"),
      drawn: stat(e, "ties"),
      lost: stat(e, "losses"),
      goalsFor: stat(e, "pointsFor"),
      goalsAgainst: stat(e, "pointsAgainst"),
      goalDiff: stat(e, "pointDifferential"),
      points: stat(e, "points"),
      note: e.note ? { color: e.note.color, label: e.note.description } : null,
      isBarca: e.team.id === BARCA_ESPN_ID,
    }))
    .sort((a, b) => a.rank - b.rank);
  return { season: group?.standings?.seasonDisplayName ?? group?.name ?? "", rows };
}

const team = (c) => ({
  id: c?.team?.id ?? "",
  name: c?.team?.shortDisplayName || c?.team?.displayName || "TBD",
  logo: c?.team?.logos?.[0]?.href ?? c?.team?.logo ?? "",
});

const prettyCompetition = (name) =>
  name.replace(/^Spanish\s+LALIGA$/i, "LaLiga").replace(/^Spanish\s+Copa del Rey$/i, "Copa del Rey").replace(/^Spanish\s+/i, "");

export function normalizeFixtures(json, now = new Date()) {
  const events = json?.events ?? [];
  return events
    .map((ev) => {
      const comp = ev.competitions?.[0] ?? {};
      const competitors = comp.competitors ?? [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      const state = comp.status?.type?.state ?? "pre";
      return {
        id: ev.id,
        date: ev.date,
        timeValid: ev.timeValid !== false,
        competition: prettyCompetition(ev.league?.name ?? ev.season?.displayName ?? ""),
        round: ev.seasonType?.name && !/^\d{4}/.test(ev.seasonType.name) ? ev.seasonType.name : "",
        home: team(home),
        away: team(away),
        venue: comp.venue?.fullName ?? "",
        state,
      };
    })
    .filter((f) => f.state !== "post" && new Date(f.date).getTime() > now.getTime() - 3 * 3600_000)
    .sort((a, b) => a.date.localeCompare(b.date));
}
