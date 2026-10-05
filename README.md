# Yahtzee Cabin

Yahtzee Cabin is a no-build Progressive Web App for two-player Yahtzee. When it is served through the bundled Node server, players enter a name, open a table, and join waiting tables from a shared lobby on separate devices. When the multiplayer API is unavailable, it falls back to pass-and-play on one shared device and can still be installed for offline play.

## Road-ready hosting

If you want this to work while traveling with internet access, the correct model is:

- Keep all code in this repo
- Deploy this repo to a Node-capable host
- Open the hosted URL from both devices

The multiplayer logic already lives in this repo in `server.js`. The only thing GitHub Pages cannot do is execute that Node server. For road use, deploy this same repo to a host such as Render, Railway, Fly.io, or any VPS that can run `npm start`.

This means the solution still fully lives in the repo. The repo just needs to be hosted on a platform that can run Node, rather than a static-only host.

## MVP scope

- Two named players on one shared device when offline
- Two live players on separate devices or browser sessions when served through the Node server
- Full 13-category Yahtzee scorecard
- Up to three rolls per turn with hold toggles
- Upper-section bonus at 63 points
- Yahtzee bonus and joker rule handling
- Name-first online lobby with waiting tables
- Joinable challenger queue for multiple family games
- Automatic player timeout after 5 minutes without a session heartbeat
- Default-win completion when an opponent leaves or times out
- Local persistence with `localStorage` in offline mode
- Offline asset caching with a service worker

## Run locally

The project has no build step and no external dependencies beyond Node.js 24.

```bash
npm start
```

Then open `http://localhost:4173` on this computer, or `http://<this-computer-LAN-IP>:4173` on another device on the same network. Each player enters a name, opens a table, or joins one from the waiting list. Online identity is stored in `sessionStorage`: a reload in the same tab reconnects, but closing the tab or opening a separate browser session may create a new identity. Offline scores are stored in `localStorage`.

Before deployment, run `npm run check` and `npm test`. The tests start temporary localhost servers and check public assets, private-file protection, a complete two-player game, and handling of an occupied platform port.

## Deploy from this repo

The repository is ready to deploy as a Node web service.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new?referralCode=github&repo=https://github.com/dangolightly/yahtzee)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dangolightly/yahtzee)

### Railway

Use the existing Railway service for an update; the deploy button above is for creating a new service.

The repo now includes `railway.json` with the Railpack builder, `npm start`, `/api/health`, a 60-second startup healthcheck timeout, and up to three retries after a crash. `package.json` selects Node 24. `nixpacks.toml` is retained for legacy Nixpacks use and also selects Node 24. Railway configuration details are documented in [Config as Code](https://docs.railway.com/config-as-code/reference); Railpack's Node version selection is documented in [Node.js](https://railpack.com/languages/node/).

For the previous manual deployment workflow:

1. Run the local checks, review the changes, then commit and push the intended release to GitHub when authorized.
2. Open the existing Railway project and service. Verify its source is `dangolightly/yahtzee`, connected branch is `main` (or the intended release branch), root directory is the repository root, and config file is `/railway.json`.
3. Keep automatic deployment disabled if releases should remain manual. A GitHub-connected service can deploy automatically on push when this setting is enabled, so verify it before pushing.
4. Confirm one replica in one region, with server sleeping disabled for reliable live games. The service needs no database or API keys; leave `PORT` to Railway. Check for a `RAILPACK_NODE_VERSION` override that could supersede the repo's Node version.
5. Wait for current matches to end. In Railway's Command Palette select **Deploy Latest Commit**, then confirm the intended commit in the deployment details. This fetches the connected branch's latest commit. See [Railway GitHub deployment controls](https://docs.railway.com/deployments/github-autodeploys).
6. Wait for successful build, startup, and healthcheck. Use the existing public HTTPS domain; generate a domain only for a new service.
7. Open `/api/health` at that domain and confirm `ok: true`. Open the app on two separate devices or browser sessions, enter names, join a challenger, roll, and score a turn. Reload the same tab and confirm reconnection.
8. Test an installed home-screen app launching and offline pass-and-play on the target phone. Existing installations may need to be removed and re-added after the manifest launch-path correction. A normal page load installs the updated service worker.

Use **Deploy Latest Commit** for new GitHub code. Redeploying a previous deployment is a different action and may reuse its previous source. If the release fails, use Railway's deployment history to roll back to a known working deployment and repeat the health and two-device checks. Rolling back also clears in-memory matches.

If Railway asks for a start command manually, use:

```bash
npm start
```

### Render

1. Push this repo to GitHub.
2. In Render, create a new Web Service from the repo.
3. Use these settings:
	- Runtime: `Node`
	- Build command: `npm install`
	- Start command: `npm start`
4. Deploy.
5. Open the Render URL from both devices.

### Any Node host

If the host supports standard Node apps, it only needs to:

1. clone the repo
2. run `npm install`
3. run `npm start`

The server already respects the `PORT` environment variable, so standard platform routing will work.

It binds to `0.0.0.0`. If a platform-provided `PORT` is occupied, startup fails instead of silently moving to a port the host cannot route. Without `PORT`, local startup may try the next port after 4173.

## Try it on an iPhone

To test the installed PWA on iPhone, the app needs to be served over HTTPS. Static hosts such as GitHub Pages support the offline single-device mode only, because they cannot run the multiplayer session API. For true two-device online play on the road, deploy this repo to a Node-capable host and then:

1. Open the site in Safari.
2. Use Share > Add to Home Screen.
3. Launch from the home screen once while online so the service worker caches the app shell.
4. After that, the game should continue working offline on the device.

## File layout

- `index.html`: app shell
- `styles.css`: responsive UI styling
- `app.js`: Yahtzee state and scoring logic
- `sw.js`: offline caching
- `manifest.webmanifest`: install metadata
- `server.js`: tiny Node server with multiplayer session management

## Multiplayer hosting note

If you are online and want two separate devices to play each other, do not use GitHub Pages for the live game URL.

- GitHub Pages: offline installable, static, single-device fallback only
- Node deployment from this repo: online two-device multiplayer and offline fallback

All online games and player profiles are held in server memory. A restart, deployment, or rollback clears them. Keep one running replica in one region; independent replicas do not share a lobby. Adding persistent storage or support for multiple replicas would be a separate project change.

## Project handoff — October 5, 2026

- Reviewed baseline: commit `d453629` on `main`; the workspace was clean before preparation.
- Architecture: no build or third-party packages. `app.js` handles UI, offline scoring, and four-second session polling. `server.js` validates online moves, calculates scores, and owns in-memory lobbies. `sw.js` caches the browser app and leaves API calls online. Scoring logic exists separately in client and server, so future rule changes need both updated.
- Prepared: explicit Railway config, Node 24 selection, public asset allowlist, strict platform port handling, relative PWA launch/scope URLs, and cache version 68. Only browser assets are served; source, Git metadata, configuration, and local env files are blocked.
- Preserved: gameplay, existing offline storage keys, and legacy AI config files. The AI feature was removed in the baseline commit; those env files are remnants and are not required for game deployment. Local env files remain ignored by Git.
- Verified locally on Node 24.15.0: JavaScript syntax checks and all four deployment integration tests passed. Tests cover a complete game through the API, not every scoring-rule edge case.
- Pending: existing Railway service settings and public URL verification, actual Railpack build, and phone/browser checks for visual layout, installation, service-worker updates, and offline use.
- Release checkpoint: user authorized committing and pushing this preparation to `main` on October 5, 2026, including the existing AI-removal commit. Syntax checks and all four integration tests passed again before the push. No Railway settings were changed or deployment manually triggered; a GitHub push may trigger a release if Railway autodeploy is enabled. The Railway CLI was not found in this workspace environment, and the existing service was not inspected.
