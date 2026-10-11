import { enrich, partition, youtubeHref, youtubeUrl, isWatched } from "./lib/watchlist.js";
import { normalizeStandings, normalizeFixtures, STANDINGS_URL, FIXTURES_URL } from "./lib/espn.js";

// ---------- persistence (localStorage can throw or be empty; never rely on it blindly) ----------
const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};
const K = { watched: "barca:watched", settings: "barca:settings", espn: "barca:espn" };

const state = {
  videos: [],
  meta: null,
  videosError: null,
  overrides: storage.get(K.watched, {}),
  settings: { spoilerFree: true, ...storage.get(K.settings, {}) },
  fixtures: null,
  standings: null,
  espnError: null,
  tab: "recaps",
  showAllWatched: false,
  tableRevealed: false,
  lastLoad: 0,
};

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ua = navigator.userAgent;

const fmtDay = (d) => new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (d) => new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
function fmtAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDay(iso);
}

const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8 5.5v13l11-6.5z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
};

// ---------- data ----------
async function loadVideos() {
  try {
    const res = await fetch(`data/videos.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.meta = { updatedAt: data.updatedAt, createdAt: data.createdAt };
    state.videos = enrich(data.videos ?? []);
    state.videosError = null;
  } catch (err) {
    state.videosError = err.message;
  }
}

async function loadEspn() {
  const cached = storage.get(K.espn, null);
  try {
    const [s, f] = await Promise.all([fetch(STANDINGS_URL), fetch(FIXTURES_URL)]);
    if (!s.ok || !f.ok) throw new Error(`HTTP ${s.status}/${f.status}`);
    state.standings = normalizeStandings(await s.json());
    state.fixtures = normalizeFixtures(await f.json());
    state.espnError = null;
    storage.set(K.espn, { standings: state.standings, fixtures: state.fixtures, at: Date.now() });
  } catch (err) {
    state.espnError = err.message;
    if (cached && !state.standings) {
      state.standings = cached.standings;
      state.fixtures = normalizeFixturesCached(cached.fixtures);
    }
  }
}
const normalizeFixturesCached = (list) => (list ?? []).filter((f) => new Date(f.date).getTime() > Date.now() - 3 * 3600_000);

async function refresh() {
  const btn = $("#refresh-btn");
  btn.classList.add("spinning");
  state.lastLoad = Date.now();
  await Promise.all([loadVideos().then(render), loadEspn().then(render)]);
  btn.classList.remove("spinning");
}

// ---------- watched state ----------
function saveOverrides() {
  storage.set(K.watched, state.overrides);
}

function setWatched(id, value, { toast: showToast = true } = {}) {
  const had = Object.hasOwn(state.overrides, id);
  const prev = state.overrides[id];
  state.overrides[id] = value;
  saveOverrides();
  render();
  if (showToast) {
    toast(value ? "Marked as watched" : "Moved back to open", () => {
      if (had) state.overrides[id] = prev;
      else delete state.overrides[id];
      saveOverrides();
      render();
    });
  }
}

// ---------- rendering ----------
function matchupHtml(info) {
  const team = (name) => (name === (info.isHome ? info.home : info.away) ? `<span class="barca">${esc(name)}</span>` : esc(name));
  return `${team(info.home)} – ${team(info.away)}`;
}
const metaText = (v) => [v.info.competition, v.info.round].filter(Boolean).join(" · ");

function linkAttrs(id) {
  const href = youtubeHref(id, ua);
  const external = href.startsWith("https:") ? ' target="_blank" rel="noopener"' : "";
  return `href="${esc(href)}"${external}`;
}

function cardHtml(v) {
  const isNew = Date.now() - new Date(v.published).getTime() < 36 * 3600_000;
  const teaser = !state.settings.spoilerFree && v.info.teaser ? `<div class="card-teaser">${esc(v.info.teaser)}</div>` : "";
  return `
  <article class="card" data-id="${esc(v.id)}">
    <a class="card-link" ${linkAttrs(v.id)} data-action="watch" data-id="${esc(v.id)}" aria-label="Watch ${esc(v.info.home)} vs ${esc(v.info.away)} on YouTube">
      <div class="thumb">
        <img src="https://i.ytimg.com/vi/${esc(v.id)}/mqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">
        ${isNew ? '<span class="chip">NEW</span>' : ""}
        <div class="play"><span>${ICON.play}</span></div>
        <div class="matchup-overlay">${matchupHtml(v.info)}</div>
      </div>
    </a>
    <div class="card-body">
      <div class="card-text">
        <div class="card-meta">${esc(metaText(v))}${metaText(v) ? " · " : ""}${esc(fmtDay(v.published))}</div>
        ${teaser}
      </div>
      <button class="check-btn" data-action="mark" data-id="${esc(v.id)}" aria-label="Mark as watched" title="Mark as watched">${ICON.check}</button>
    </div>
  </article>`;
}

function rowHtml(v) {
  return `
  <div class="row">
    <a class="row-link" ${linkAttrs(v.id)} data-action="rewatch" data-id="${esc(v.id)}">
      <span class="row-tick">${ICON.check}</span>
      <span style="min-width:0">
        <div class="row-title">${esc(v.info.home)} – ${esc(v.info.away)}</div>
        <div class="row-meta">${esc(metaText(v))}${metaText(v) ? " · " : ""}${esc(fmtDay(v.published))}</div>
      </span>
    </a>
    <button class="icon-btn" data-action="unmark" data-id="${esc(v.id)}" aria-label="Mark as unwatched" title="Mark as unwatched">${ICON.undo}</button>
  </div>`;
}

function nextMatchHtml() {
  const f = state.fixtures?.[0];
  if (!f) return "";
  const when = f.state === "in" ? "LIVE now" : f.timeValid ? `${fmtDay(f.date)}, ${fmtTime(f.date)}` : fmtDay(f.date);
  return `<div class="next-match" data-action="tab" data-tab="matches" role="button">⚽ <span>Next: <b>${esc(f.home.name)} – ${esc(f.away.name)}</b> · ${esc(when)}</span></div>`;
}

function renderRecaps() {
  const el = $("#view-recaps");
  if (!state.videos.length && !state.meta) {
    el.innerHTML = state.videosError
      ? `<div class="empty"><strong>Couldn't load recaps</strong><span class="error">${esc(state.videosError)}</span></div>`
      : `<div class="loading">Loading…</div>`;
    return;
  }
  const { open, watched } = partition(state.videos, state.overrides);
  el.classList.toggle("spoiler-free", state.settings.spoilerFree);

  const openHtml = open.length
    ? `<div class="cards">${open.map(cardHtml).join("")}</div>`
    : `<div class="empty"><span class="big">✅</span><strong>All caught up</strong>You'll get a notification as soon as the next Barça recap is on DAZN.</div>`;

  const limit = state.showAllWatched ? watched.length : 8;
  const watchedHtml = watched.length
    ? `<div class="section-title"><span>Watched</span><span class="count">${watched.length}</span></div>
       <div class="rows">${watched.slice(0, limit).map(rowHtml).join("")}</div>
       ${watched.length > limit ? `<button class="btn block more" data-action="more">Show all ${watched.length}</button>` : ""}`
    : "";

  const updated = state.meta?.updatedAt ? `<p class="muted small" style="text-align:center;margin-top:18px">Last new recap found ${esc(fmtAgo(state.meta.updatedAt))}</p>` : "";

  el.innerHTML = `
    ${nextMatchHtml()}
    <div class="section-title"><span>To watch</span><span class="count">${open.length}</span></div>
    ${openHtml}
    ${watchedHtml}
    ${updated}`;
}

function renderMatches() {
  const el = $("#view-matches");
  if (!state.fixtures) {
    el.innerHTML = state.espnError
      ? `<div class="empty"><strong>Couldn't load matches</strong><span class="error">${esc(state.espnError)}</span></div>`
      : `<div class="loading">Loading…</div>`;
    return;
  }
  if (!state.fixtures.length) {
    el.innerHTML = `<div class="empty"><strong>No upcoming matches</strong>Nothing scheduled right now.</div>`;
    return;
  }
  const teamHtml = (t, side) => `<div class="team ${side}">${t.logo ? `<img src="${esc(t.logo)}" alt="" loading="lazy">` : ""}<span>${esc(t.name)}</span></div>`;
  el.innerHTML =
    `<div class="section-title"><span>Upcoming</span><span class="count">${state.fixtures.length}</span></div>` +
    state.fixtures
      .map(
        (f) => `
    <div class="fixture ${f.state === "in" ? "live" : ""}">
      <div class="fixture-head"><span class="comp">${esc(f.competition)}${f.round ? ` · ${esc(f.round)}` : ""}</span><span>${esc(fmtDay(f.date))}</span></div>
      <div class="fixture-teams">
        ${teamHtml(f.home, "home")}
        <div class="kickoff">${f.state === "in" ? "LIVE" : f.timeValid ? esc(fmtTime(f.date)) : "TBD"}</div>
        ${teamHtml(f.away, "away")}
      </div>
      ${f.venue ? `<div class="fixture-venue">📍 ${esc(f.venue)}</div>` : ""}
    </div>`,
      )
      .join("") +
    (state.espnError ? `<p class="muted small">Offline – showing cached data.</p>` : "");
}

function renderTable() {
  const el = $("#view-table");
  if (!state.standings) {
    el.innerHTML = state.espnError
      ? `<div class="empty"><strong>Couldn't load the table</strong><span class="error">${esc(state.espnError)}</span></div>`
      : `<div class="loading">Loading…</div>`;
    return;
  }
  const { rows, season } = state.standings;
  const barca = rows.find((r) => r.isBarca);
  const openCount = partition(state.videos, state.overrides).open.length;
  const guard = state.settings.spoilerFree && openCount > 0 && !state.tableRevealed;

  const zones = [];
  for (const r of rows) if (r.note && !zones.some((z) => z.label === r.note.label)) zones.push(r.note);

  const summary = barca
    ? `<div class="summary">
        <div class="stat"><b>${barca.rank}.</b><span>Position</span></div>
        <div class="stat"><b>${barca.points}</b><span>Points</span></div>
        <div class="stat"><b>${barca.won}-${barca.drawn}-${barca.lost}</b><span>W-D-L</span></div>
        <div class="stat"><b>${barca.goalsFor}:${barca.goalsAgainst}</b><span>Goals</span></div>
      </div>`
    : "";

  el.innerHTML = `
    <div class="section-title"><span>${esc(season || "LaLiga")}</span></div>
    <div class="table-wrap">
      ${guard ? `<div class="spoiler-guard"><p><strong>Spoiler alert</strong></p><p class="muted">You have ${openCount} unwatched recap${openCount > 1 ? "s" : ""}. The table may give away results.</p><button class="btn primary" data-action="reveal">Show anyway</button></div>` : ""}
      <div class="${guard ? "blurred" : ""}">
        ${summary}
        <table>
          <thead><tr><th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr class="${r.isBarca ? "is-barca" : ""}">
                <td style="${r.note ? `--zone:${esc(r.note.color)}` : ""}">${r.rank}</td>
                <td class="team-cell">${r.logo ? `<img src="${esc(r.logo)}" alt="" loading="lazy">` : ""}${esc(r.name)}</td>
                <td>${r.played}</td><td>${r.goalDiff > 0 ? "+" : ""}${r.goalDiff}</td><td class="pts">${r.points}</td></tr>`,
              )
              .join("")}
          </tbody>
        </table>
        <div class="legend">${zones.map((z) => `<span><i style="background:${esc(z.color)}"></i>${esc(z.label)}</span>`).join("")}</div>
      </div>
    </div>
    ${state.espnError ? `<p class="muted small">Offline – showing cached data.</p>` : ""}`;
}

function renderBadge() {
  const n = partition(state.videos, state.overrides).open.length;
  const badge = $("#tab-badge");
  badge.hidden = n === 0;
  badge.textContent = String(n);
  try {
    if (n && navigator.setAppBadge) navigator.setAppBadge(n);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch {
    /* unsupported */
  }
}

function render() {
  renderRecaps();
  renderMatches();
  renderTable();
  renderBadge();
}

function switchTab(tab) {
  state.tab = tab;
  for (const v of document.querySelectorAll(".view")) v.hidden = v.dataset.view !== tab;
  for (const t of document.querySelectorAll(".tab")) {
    if (t.dataset.tab === tab) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
}

// ---------- toast ----------
let toastTimer;
function toast(text, onUndo) {
  const el = $("#toast");
  el.innerHTML = `<span>${esc(text)}</span>${onUndo ? '<button type="button">Undo</button>' : ""}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (onUndo) {
    el.querySelector("button").onclick = () => {
      el.hidden = true;
      onUndo();
    };
  }
  toastTimer = setTimeout(() => (el.hidden = true), 6000);
}

// ---------- sheets ----------
function openSheet(html) {
  const sheet = $("#sheet");
  sheet.innerHTML = `<div class="grabber"></div>${html}`;
  sheet.hidden = false;
  $("#sheet-backdrop").hidden = false;
}
function closeSheet() {
  $("#sheet").hidden = true;
  $("#sheet-backdrop").hidden = true;
}

function openFocus(id) {
  const v = state.videos.find((x) => x.id === id);
  const watched = v ? isWatched(v, state.overrides) : state.overrides[id] === true;
  const body = v
    ? `<div class="focus-matchup">${matchupHtml(v.info)}</div><p class="muted">${esc(metaText(v))} · ${esc(fmtDay(v.published))}</p>`
    : `<div class="focus-matchup">New recap</div><p class="muted">It's so fresh the app hasn't synced it yet. You can watch it right away.</p>`;
  openSheet(`
    <h2>${watched ? "Already watched" : "New Barça recap"}</h2>
    ${body}
    <div class="actions">
      <a class="btn primary block" ${linkAttrs(id)} data-action="watch" data-id="${esc(id)}">${ICON.play} Watch on YouTube</a>
      ${watched ? "" : `<button class="btn block" data-action="mark" data-id="${esc(id)}">${ICON.check} Mark as watched</button>`}
      <button class="btn block" data-action="close">Later</button>
    </div>`);
}

function openSettings() {
  const updated = state.meta?.updatedAt ? new Date(state.meta.updatedAt).toLocaleString("en-GB") : "–";
  openSheet(`
    <h2>Settings</h2>
    <label class="switch-row">
      <span>Spoiler protection<small>Blur thumbnails, hide headlines, guard the table while recaps are open.</small></span>
      <span class="switch"><input type="checkbox" id="spoiler-toggle" ${state.settings.spoilerFree ? "checked" : ""}><span></span></span>
    </label>

    <h3>Notifications</h3>
    <p class="small">New recaps are pushed via the free <b>ntfy</b> app:</p>
    <ol class="small">
      <li>Install <b>ntfy</b> from the Play Store.</li>
      <li>Tap <b>+</b> and subscribe to your private topic (see the README / setup output).</li>
      <li>Tapping a notification opens the recap here; the <b>▶ YouTube</b> button opens it directly.</li>
    </ol>

    <h3>Watchlist</h3>
    <div class="actions">
      <button class="btn block" data-action="mark-all">Mark all as watched</button>
      <button class="btn block" data-action="export">Export backup</button>
      <label class="btn block">Import backup<input type="file" id="import-file" accept="application/json" hidden></label>
    </div>

    <h3>About</h3>
    <p class="small muted">Recaps from the DAZN Fußball YouTube channel, checked every 15 minutes. Standings &amp; fixtures from ESPN. Data last changed: ${esc(updated)}.</p>
    <div class="actions"><button class="btn block" data-action="close">Done</button></div>`);

  $("#spoiler-toggle").addEventListener("change", (e) => {
    state.settings.spoilerFree = e.target.checked;
    storage.set(K.settings, state.settings);
    render();
  });
  $("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || typeof data.watched !== "object") throw new Error("not a backup file");
      state.overrides = { ...state.overrides, ...data.watched };
      saveOverrides();
      render();
      closeSheet();
      toast("Backup imported");
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
  });
}

function exportBackup() {
  const blob = new Blob([JSON.stringify({ app: "barca-recaps", exportedAt: new Date().toISOString(), watched: state.overrides }, null, 2)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `barca-recaps-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- events ----------
document.addEventListener("click", (e) => {
  const target = e.target.closest("[data-action]");
  if (!target) return;
  const { action, id } = target.dataset;
  switch (action) {
    case "watch":
      // Let the link navigate first (re-rendering removes it), then update the list.
      setTimeout(() => {
        closeSheet();
        setWatched(id, true);
      }, 400);
      break;
    case "rewatch":
      break;
    case "mark": {
      e.preventDefault();
      closeSheet();
      const card = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
      if (card) {
        card.classList.add("leaving");
        setTimeout(() => setWatched(id, true), 220);
      } else setWatched(id, true);
      break;
    }
    case "unmark":
      setWatched(id, false);
      break;
    case "more":
      state.showAllWatched = true;
      renderRecaps();
      break;
    case "reveal":
      state.tableRevealed = true;
      renderTable();
      break;
    case "tab":
      switchTab(target.dataset.tab);
      break;
    case "close":
      closeSheet();
      break;
    case "mark-all": {
      const before = { ...state.overrides };
      for (const v of partition(state.videos, state.overrides).open) state.overrides[v.id] = true;
      saveOverrides();
      render();
      closeSheet();
      toast("All marked as watched", () => {
        state.overrides = before;
        saveOverrides();
        render();
      });
      break;
    }
    case "export":
      exportBackup();
      break;
  }
});

for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => switchTab(t.dataset.tab));
$("#refresh-btn").addEventListener("click", refresh);
$("#settings-btn").addEventListener("click", openSettings);
$("#sheet-backdrop").addEventListener("click", closeSheet);

function handleDeepLink() {
  const m = location.hash.match(/^#\/v\/([\w-]{6,20})/);
  if (!m) return;
  history.replaceState(null, "", location.pathname + location.search);
  openFocus(m[1]);
}
window.addEventListener("hashchange", handleDeepLink);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - state.lastLoad > 60_000) refresh();
});

// ---------- boot ----------
render();
state.lastLoad = Date.now();
loadEspn().then(render);
await loadVideos();
render();
// If the deep-linked recap isn't deployed yet, the focus sheet shows a fallback.
handleDeepLink();

try {
  navigator.storage?.persist?.();
} catch {
  /* ignore */
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !reloaded) {
      reloaded = true;
      location.reload();
    }
  });
}
