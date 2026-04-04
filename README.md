# Yahtzee Cabin

Yahtzee Cabin is a no-build Progressive Web App for two-player, pass-and-play Yahtzee on one phone. It is meant to be served as static files, installed to an iPhone home screen, and used offline.

## MVP scope

- Two named players on one shared device
- Full 13-category Yahtzee scorecard
- Up to three rolls per turn with hold toggles
- Upper-section bonus at 63 points
- Local persistence with `localStorage`
- Offline asset caching with a service worker

This MVP intentionally does not implement bonus Yahtzees or joker rules.

## Run locally

The project has no build step and no external dependencies beyond Node.js.

```bash
npm start
```

Then open `http://localhost:4173`.

## Try it on an iPhone

To test the installed PWA on iPhone, the app needs to be served over HTTPS from a static host such as GitHub Pages, Netlify, or Cloudflare Pages. Then:

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
- `server.js`: tiny static server for local testing