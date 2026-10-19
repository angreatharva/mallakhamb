---
doc: 06-SCREENS/public-home-and-scores
covers:
  - src/pages/public/Home.jsx
  - src/pages/public/home/**
  - src/pages/public/PublicScores.jsx
read_when: "changing the public landing page or the public results viewer"
depends_on: [07-COMPONENTS, 05-DESIGN-SYSTEM]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## `Home.jsx` — the landing page (rebuilt 2026-10-06, `9814afa`)

**The reference is `docs/homepage/README.md`** (fixed requirements, facts,
quality bar). The old 839-line Home (particles, `MagneticCursor`, dead
`/about`/`/gallery`/`/contact` links) is gone.

- **`Home.jsx` (156 lines)** renders only the first screen in JSX: masthead,
  hero, and a **static role portal** of real `<Link>`s — Player/Coach/Judge
  login + register, Admin login only — plus `/scores` and the `AppearanceMenu`.
  `appearance-everywhere.spec.js` picks Light on Home, so the switch must stay.
- **`home/sections.html` + `home/footer.html`**: static markup injected with
  `dangerouslySetInnerHTML`, rendered once and never re-rendered. Links inside
  it go through `navigate` (no reload). The footer links `/scores` and
  `/superadmin/login`.
- **`home/runtime/{index,name,apparatus,code}.js`**: GSAP, lazy-loaded after
  first paint; three.js only when the apparatus section is near. On unmount
  everything is reverted (ScrollTriggers killed, WebGL disposed, listeners
  removed, pristine markup restored) — keeps StrictMode's double mount safe.
- **`home/home.css`**: every rule scoped to `.mk-home`, because Vite keeps a
  lazy route's CSS on the page after you leave it.
- **Phones and tablets are shown the laptop layout** (`327054f`, 2026-10-10):
  on `/` the viewport meta becomes `width=1280` (past Home's own `big`
  breakpoint, min-width 1024), scaled to fit, pinch-zoom kept. Set before
  first paint by an inline script in `index.html` and, when arriving from
  inside the app, by `useDesktopViewport()` (`home/desktopViewport.js`,
  called in `Home.jsx`), which restores `width=device-width,
  initial-scale=1.0` on unmount. `DESKTOP_VIEWPORT` must equal the
  `index.html` string. Consequence: a portrait phone is a ~1280×2770 frame,
  a sideways one 1280×534 — `3c5c725` fixed the two bugs that caused (3D view
  offset grows with frame height so the pole's height label clears the text;
  the unpinned stopwatch dial is capped by viewport height). The narrow
  (< 1024) rules in `home.css` still exist and still matter for small
  desktop windows.
- **Touch targets:** footer and photo-credit links are ≥ 44px tall and wide
  below the laptop layout and on touch (`99c4372`, `529e52f`, `81207da`).
- **`home/preload.js`**, called from `main.jsx` on `/` only: the Home chunk,
  the hero photo (a `<link rel=preload as=image fetchpriority=high>` added
  here, because the hero's URL is hashed at build time and `index.html` can't
  name it) and the fonts (self-hosted Fontsource Teko + Archivo, CSP
  `font-src 'self'`) start with the app's boot.
- Home is a **dark island**: its own palette (black stage, teak, chalk,
  saffron), whatever the appearance. It's the reference implementation of the
  "Prime Time" language that `docs/design-language/PLAN.md` rolls out
  site-wide. Note `.cd-rb` sets local `--bg`/`--fg` that shadow global token
  names — rename before Home consumes shared tokens.
- Brand rule: the page says **"Mallakhamb India"**; "Bhausaheb", "Ranade",
  "Navodit" must not appear. `src/assets/main-home.jpg` shows "RANADE" in its
  pixels — never use it here.
- No data fetching. **Photos are local** since 2026-10-11 (`274c13a`):
  `home/images.js` imports five files from `Web/assets/images` (hero
  `China-Main.jpg`, pole `veerbadrasana-III.jpg`, hanging
  `Hanging-Mallakhamb.jpg`, rope `wadi.jpg`, live `Mallakhamba-Mumbai-1.jpg`),
  so Vite bundles and hashes them and nothing loads from another site.
  `sections.html` is imported `?raw`, so its `<img>`s name a placeholder
  `src="%img:<key>%"` that `fillImages()` swaps for the bundled URL (an
  unknown key throws). The Wikimedia/Pexels hotlinks are gone, and so are the
  `footer.html` credit lines for the photos they replaced, and `docs/homepage/images.json` was deleted.
- **Verify:** `npm run build && npm run preview`, then `npm run audit:home`
  (41 device profiles). Measured phone (4x CPU, fast 4G) FCP 1.5 s / LCP 2.5 s /
  CLS 0.

## `PublicScores.jsx` — the public results viewer (362 lines)

Route `/scores`, no auth. A cascading 5-filter UI (Competition → Gender
→ Age Group → Competition Type → Apparatus), each selection resetting
everything below it via 4 chained `useEffect`s (`:58-86`). **Only the
final selection (apparatus) triggers the score fetch** (`:91-97`) — all
5 filters must be set before any API call fires. Comment confirms:
"Apparatus is the last selection, so it is the one that triggers the
read" — the same "apparatus is deliberately last" pattern documented for
[admin-scores.md](admin-scores.md)'s and
[admin-judges.md](admin-judges.md)'s filter ladders.

**Data fetching**: `publicAPI.getCompetitions()` on mount populates the
competition dropdown, with `competitionTypes`/`apparatusConfig`
embedded per competition used to derive the cascading options
client-side (`getAvailableCompetitionTypes()`/`getAvailableApparatus()`,
`:42-55`) — no further API calls needed for those two levels.
`publicAPI.getScores({competitionId, gender, ageGroup, competitionType,
apparatus})` (`:125-152`) fires only once all 5 are set.

**This screen is a thin filter-and-fetch shell, not a ranking/formatting
authority**: converts raw scores through `rowsFromPublicScores(scores)`
then `filterRows(rows, searchTerm)` (see
[07-COMPONENTS.md](../07-COMPONENTS.md#scores)), then renders via
`<PlayerRankingBoard players={filteredPlayers} />` — reusing `SkeletonRow`
from that same module for the loading state (4 skeleton rows).

**A known, defensively-handled data gap**: the `ageGroups` field on each
competition option is noted in-code as "Absent from the public payload
today, so the age-group filter falls back to the gender's full list"
(`:109-112`) — the public competitions endpoint doesn't currently return
`ageGroups`, so the filter can't narrow by what the competition actually
runs (only by gender-validity). Written defensively "so that it narrows
on its own if the endpoint ever starts sending it" — a client-side gap
tracking a server-side incompleteness, not something the UI itself can
fix.

**Three distinct empty/loading states**: pre-filter ("Select Filters to
View Scores"), post-filter-but-no-scores ("No Scores Available...
Scores will appear here after judges complete their scoring"), and a
search-yields-nothing sub-state within results ("No players found for
'{term}'" with a "Clear search" button).

## Change guidance

- If the public competitions endpoint ever starts returning
  `ageGroups`: no client change should be needed — `PublicScores.jsx`
  is already written to use it once present (`:109-112`).
- Changing Home: follow `docs/homepage/README.md`'s fixed requirements and
  re-run `npm run audit:home` on a preview build.
