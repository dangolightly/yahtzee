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
- Automatic player timeout after 3 minutes of inactivity
- Default-win completion when an opponent leaves or times out
- Local persistence with `localStorage` in offline mode
- Offline asset caching with a service worker

## Run locally

The project has no build step and no external dependencies beyond Node.js.

```bash
npm start
```

Then open `http://localhost:4173` on one or more devices on the same network. Each player enters a name, opens a table, or joins one from the waiting list. Closing and reopening the same browser profile reconnects to the same table because the client identity is stored locally.

## Deploy from this repo

The repository is ready to deploy as a Node web service.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new?referralCode=github&repo=https://github.com/dangolightly/yahtzee)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dangolightly/yahtzee)

### Railway

1. Open the Railway deploy link above.
2. Sign in to Railway with GitHub if prompted.
3. Select this repo.
4. Railway should auto-detect the Node app and use `npm start`.
5. After deploy, generate a public domain for the service.
6. Open that Railway URL from both devices.

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

## AI fun-line setup (optional)

To replace static score phrases with live AI-generated one-liners, set these environment variables on your host:

```bash
CP_OPENAI_API_KEY=your_key_here
CP_OPENAI_MODEL=gpt-4o-mini
CP_AI_TIMEOUT_MS=20000
CP_OPENAI_BASE_URL=https://api.openai.com/v1
```

When enabled, each scoring click requests one short funny line from OpenAI. If the API is unavailable, the app falls back to local phrases from `yahtzee-fun-config.json`.

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
