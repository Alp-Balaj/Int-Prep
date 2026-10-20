# Int-Prep

Interview preparation for the ISA Consulting Senior AI Engineer role.

## brian-brennt

A spaced-repetition interview-prep game, published as a Claude artifact:
https://claude.ai/artifact/WvG8yHupQi5obCC3WZ39q6

- `brian-brennt/index.html` and `brian-brennt/app.js` — the game (plain HTML/CSS/JS, no build step).
- `brian-brennt/content/*.json` — content packs: lessons, recall cards, explain prompts, scenarios and hearing (boss) questions per tier. Schema in `content/SCHEMA.md`; validate with `node content/validate.js <pack.json>`.
- `brian-brennt/content/stories.json`, `quests.json` — story prompts and the 14-day schedule.
- `brian-brennt/test-local.html` — headless smoke test. Serve the folder (`python3 -m http.server 8765`) and open it in Chromium headless with `--enable-logging=stderr` to see `[TEST]` lines.

Progress is stored in the artifact's database and in the browser; nothing in this repo holds personal progress or stories.
