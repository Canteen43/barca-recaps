# Barça Recaps

A personal watchlist for FC Barcelona recaps on the German **DAZN Fußball** YouTube channel, built as an installable Android web app (PWA).

- **Watchlist:** every new Barça recap shows up as *to watch*. Tapping it opens the YouTube app and marks it watched. You can undo, mark a recap without watching it, or move it back to open.
- **Notifications:** a push notification through the free [ntfy](https://ntfy.sh) app as soon as a recap is out.
- **Spoiler protection** is on by default: teaser headlines are hidden, thumbnails blurred, and the table stays covered while you have unwatched recaps. Notifications are spoiler-free too.
- **Bonus:** upcoming matches across all competitions and the LaLiga table (from ESPN's public API).

## How it works

```
GitHub Actions (every 15 min)                       GitHub Pages
  scripts/check.mjs                                   app/ (PWA, no build step)
    ├─ YouTube RSS of DAZN Fußball (fallback: channel page)
    ├─ keep titles like "…: FC Barcelona - X | 8. Spieltag | LALIGA | DAZN"
    ├─ data/videos.json  ──commit──▶ deploy ──▶  data/videos.json
    └─ ntfy.sh push ──▶ phone ──tap──▶ app #/v/<id> ──▶ YouTube app
```

- There is no backfill. The first run stores the recaps currently on the channel as *baseline* (already watched), so only recaps published after that show up as open.
- Your watched status lives on your phone (localStorage, with persistent storage requested). You can back it up from Settings via export/import.
- No API keys and no accounts are needed, except GitHub and a secret ntfy topic.

## One-time setup (about 5 minutes)

1. **Create a public GitHub repo** (for example `barca-recaps`). GitHub Pages is free for public repos, and the repo only holds public video IDs. Then push:
   ```
   git remote add origin https://github.com/<you>/barca-recaps.git
   git push -u origin main
   ```
2. **Turn on Pages:** go to repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Add the notification secret:** go to **Settings → Secrets and variables → Actions → New repository secret**, name it `NTFY_TOPIC`, and use a long random value (for example the one from the setup notes). Anyone who knows the topic can read or send its notifications, so keep it private.
4. **Start the first run:** **Actions → Check for new recaps → Run workflow**. This creates the baseline and deploys the app to `https://<you>.github.io/barca-recaps/`.
5. **Set up your phone:**
   - Open that URL in Chrome, open the ⋮ menu, and tap **Add to Home screen / Install app**.
   - Install **ntfy** from the Play Store, tap **+**, and subscribe to your topic on server `ntfy.sh`.
   - To test it, run the workflow again with **Send a test notification** checked.

If a run fails, GitHub emails you. Short YouTube outages are only logged as warnings, and the next run catches up.

## Development

```
npm install                 # only dev dependency: Playwright
npm test                    # unit tests (parser, feed, store, notifications, ESPN)
npm run test:e2e            # builds with fixture data, runs the app in an emulated Pixel 7
npm run build && npm run dev   # serve dist/ at http://localhost:5173
npm run check               # run the watcher locally (writes data/videos.json)
npm run icons               # re-render PNG icons from app/icons/icon.svg
```

Behind a TLS-intercepting proxy on Windows, prefix commands that hit the network with `NODE_OPTIONS=--use-system-ca`.

| Path | What |
| --- | --- |
| `app/` | The PWA: `app.js` UI, `lib/` pure logic (shared with Node), `sw.js` offline cache |
| `scripts/check.mjs` | Watcher run by the Action |
| `scripts/lib/` | YouTube feed parsing, store merge, ntfy |
| `data/videos.json` | Known recaps (written by the Action) |
| `test/` | Unit tests, e2e tests and real API fixtures |
