# Barça Recaps

A personal watchlist for FC Barcelona recaps on the German **DAZN Fußball** YouTube channel, built as an installable Android web app (PWA).

- **Watchlist:** every new Barça recap shows up as *to watch*. Tapping it opens the YouTube app and marks it watched. You can undo, mark a recap without watching it, or move it back to open.
- **Notifications:** one standard web push notification in the morning when new recaps came out, straight to the installed app. Only this repo's Actions can send it (signed with a private key), and tapping it can only open the app or YouTube.
- **Late-night check:** opening the app after a match whose recap isn't listed yet makes it look right away (optional, needs a GitHub token on the phone).
- **Spoiler protection** is on by default: teaser headlines are hidden, thumbnails blurred, and the table stays covered while you have unwatched recaps. Notifications are spoiler-free too.
- **Bonus:** upcoming matches across all competitions and the LaLiga table (from ESPN's public API).

## How it works

```
GitHub Actions (daily 05:37 UTC, or started by the app)   GitHub Pages
  scripts/check.mjs                                         app/ (PWA, no build step)
    ├─ YouTube RSS of DAZN Fußball (fallback: channel page)
    ├─ keep titles like "…: FC Barcelona - X | 8. Spieltag | LALIGA | DAZN"
    ├─ data/videos.json  ──commit──▶ deploy ──▶  data/videos.json
    └─ Web Push, signed with VAPID_PRIVATE_KEY ──▶ app's service worker ──tap──▶ app #/v/<id> ──▶ YouTube app

App opened after a match (kickoff ≥ 2 h ago, < 18 h, recap not listed, ESPN results)
  └─ GitHub API: run the workflow in "quiet" mode ──▶ same check, no notification ──▶ app reloads the list
```

- There is no backfill. The first run stores the recaps currently on the channel as *baseline* (already watched), so only recaps published after that show up as open.
- Your watched status lives on your phone (localStorage, with persistent storage requested). You can back it up from Settings via export/import.
- No accounts besides GitHub. Secrets: the VAPID private key and your phone's push subscription (repo secrets), and optionally a GitHub token that stays on the phone.
- A notification payload only carries video IDs and team names. The service worker ignores anything else, so even a forged message couldn't link anywhere but the app or YouTube.

## One-time setup (about 5 minutes)

1. **Create a public GitHub repo** (for example `barca-recaps`). GitHub Pages is free for public repos, and the repo only holds public video IDs. Then push:
   ```
   git remote add origin https://github.com/<you>/barca-recaps.git
   git push -u origin main
   ```
2. **Turn on Pages:** go to repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Create the push keys:** run `npm run setup:push` (needs the [GitHub CLI](https://cli.github.com), logged in). It stores the private key as the `VAPID_PRIVATE_KEY` secret without printing it and writes the public key into `app/lib/push.js`. Commit and push that file.
4. **Start the first run:** **Actions → Check for new recaps → Run workflow** (mode `check`). This creates the baseline and deploys the app to `https://<you>.github.io/barca-recaps/`.
5. **Set up your phone:**
   - Open that URL in Chrome, open the ⋮ menu, and tap **Add to Home screen / Install app**.
   - In the app, open **Settings → Enable notifications**, tap **Copy**, and save the text as the repo secret `PUSH_SUBSCRIPTION` (the Settings sheet links there). For several devices, store a JSON array of subscriptions.
   - To test it, run the workflow with mode `test-notification`.
6. **Optional, late-night check:** create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) with access to only this repo and the permission **Actions: Read and write**, and paste it into **Settings → Late-night check**. It stays on the phone. Its worst case if leaked: someone can start this workflow.

If you reinstall the app or clear its data, enable notifications again and update `PUSH_SUBSCRIPTION`; the run log warns when the old one has expired. Re-running `npm run setup:push` rotates the keys, which invalidates all subscriptions.

If a run fails, GitHub emails you. Short YouTube outages are only logged as warnings, and the next run catches up.

## Development

```
npm install                 # only dev dependency: Playwright
npm test                    # unit tests (parser, feed, store, notifications, web push, checks, ESPN)
npm run test:e2e            # builds with fixture data, runs the app in an emulated Pixel 7
npm run build && npm run dev   # serve dist/ at http://localhost:5173
npm run check               # run the watcher locally (writes data/videos.json)
npm run icons               # re-render PNG icons from app/icons/icon.svg
```

Behind a TLS-intercepting proxy on Windows, prefix commands that hit the network with `NODE_OPTIONS=--use-system-ca`.

| Path | What |
| --- | --- |
| `app/` | The PWA: `app.js` UI, `lib/` pure logic (shared with Node), `sw.js` offline cache and push |
| `scripts/check.mjs` | Watcher run by the Action |
| `scripts/lib/` | YouTube feed parsing, store merge, notification text, Web Push (no dependencies) |
| `data/videos.json` | Known recaps (written by the Action) |
| `test/` | Unit tests, e2e tests and real API fixtures |
