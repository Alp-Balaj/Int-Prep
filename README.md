# Int-Prep

Interview preparation for the ISA Consulting Senior AI Engineer role.

## brian-brennt

A spaced-repetition interview-prep game, published as a Claude artifact:
https://claude.ai/artifact/WvG8yHupQi5obCC3WZ39q6

- `brian-brennt/index.html` and `brian-brennt/app.js` — the game (plain HTML/CSS/JS, no build step).
- `brian-brennt/content/*.json` — content packs: lessons, recall cards, explain prompts, scenarios and hearing (boss) questions per tier. Schema in `content/SCHEMA.md`; validate with `node content/validate.js <pack.json>`.
- `brian-brennt/content/cv-*.json` — the "Your CV, line by line" tier (`cv`): every technology and claim on the CV, so any line an interviewer picks can be defended.
- `brian-brennt/content/stories.json`, `quests.json` — story prompts and the 14-day schedule.
- `brian-brennt/test-local.html` — headless smoke test. Serve the folder (`python3 -m http.server 8765`) and open it in Chromium headless with `--enable-logging=stderr` to see `[TEST]` lines.

- Priority: tiers are ordered and weighted for the interview (`TIER_LEVEL` in `app.js` overrides the packs' levels): CV and Agentic first, AWS/React-Python/Security middle, eDiscovery last. The docket asks for 40 new items a day (20 in the last days); hearings unlock at 60% stable.
- Mock interview (Docket screen): 7 quick questions, 2 scenarios and 1 spoken explain prompt drawn from every tier, timed, scored at the end. It does not touch the review schedule; scores are kept in `mocks` in the progress doc.
- Ranks: XP maps to Intern → Paralegal → Associate → Senior Associate → Counsel → Partner → Managing Partner, shown in the top bar.

Progress is stored in the artifact's database and in the browser; nothing in this repo holds personal progress or stories.

### Railway

Also hosted on Railway (project `brian-brennt`, service `web`): https://brian-brennt.up.railway.app. Pushes to `main` deploy automatically.

- `server.js` serves `brian-brennt/` (no dependencies, `npm start`). It wraps `index.html` in a document skeleton, since the artifact runtime normally adds one.
- With `APP_PASSPHRASE` set, it injects `brian-brennt/sync.js` — a stand-in for the artifact's `db` and `user` capabilities — and stores docs as JSON files in `DATA_DIR` (a Railway volume at `/data`). The app asks for the passphrase once per browser; without it, progress stays in that browser.
- Installable as a PWA (add to home screen): server.js adds the manifest, icons and service-worker registration to the page head. `brian-brennt/sw.js` is network-first with an offline fallback and never caches `/api`. Icons in `brian-brennt/icons/` (SVG sources plus rendered PNGs).
- Run locally: `APP_PASSPHRASE=dev npm start` (data goes to `./data/`).
