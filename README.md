# Yahtzee Cabin

Yahtzee Cabin is a no-build Progressive Web App for two-player Yahtzee. When it is served through the bundled Node server, two online sessions can claim Player 1 and Player 2 and play from separate devices. When the multiplayer API is unavailable, it falls back to pass-and-play on one shared device and can still be installed for offline play.

## MVP scope

- Two named players on one shared device when offline
- Two live players on separate devices or browser sessions when served through the Node server
- Full 13-category Yahtzee scorecard
- Up to three rolls per turn with hold toggles
- Upper-section bonus at 63 points
- Yahtzee bonus and joker rule handling
- Online seat claiming for Player 1 and Player 2
- Session blocking when both seats are occupied
- Automatic player timeout after 3 minutes of inactivity
- Local persistence with `localStorage` in offline mode
- Offline asset caching with a service worker

## Run locally

The project has no build step and no external dependencies beyond Node.js.

```bash
npm start
```

Then open `http://localhost:4173` on one or two devices on the same network. The first active session claims Player 1, the second claims Player 2, and any later sessions are blocked until a seat opens.

## Try it on an iPhone

To test the installed PWA on iPhone, the app needs to be served over HTTPS. Static hosts such as GitHub Pages support the offline single-device mode only, because they cannot run the multiplayer session API. For true two-device online play, the same files need to be served from a Node-capable host. Then:

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
- `server.js`: tiny static server with multiplayer session management