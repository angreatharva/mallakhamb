# The landing page (`/`)

`Web/src/pages/public/Home.jsx`, the first thing every visitor sees. Built as a dark "broadcast"
page: a static role portal, then a scroll-driven story of the sport and its three apparatus.

```
src/pages/public/Home.jsx            the first screen (masthead, hero, role portal) in React: real <Link>s
                                     to every login/register route, the Light/Dark switch; mounts the rest
src/pages/public/home/sections.html  01 The name · 02 Origins · 03 The apparatus · ticker · 04 The code · 05 Live
src/pages/public/home/footer.html    the channel bug + footer (contact, Super Admin, photo credits)
src/pages/public/home/home.css       every rule scoped to .mk-home (Vite keeps a lazy route's CSS loaded)
src/pages/public/home/runtime/       the motion runtime (GSAP), loaded after the first paint:
    index.js                         boots the sections in page order, stinger/ticker/badge, full teardown
    name.js · apparatus.js · code.js the sections; apparatus loads three.js only when it comes near
src/pages/public/home/preload.js     on "/": the Home chunk, hero photo + first-screen fonts start with the app's boot
src/pages/public/home/images.js      the photos: local files in Web/assets/images, filled into the markup
e2e/home-device-audit.mjs            41 devices (laptops 13-16", iPads/Galaxy Tabs, iPhones/Androids)
```

React renders the static markup once and never re-renders it; the runtime animates it and, on leaving
the page, everything is reverted and the pristine markup put back (which also keeps StrictMode's double
mount honest). In-app links inside that markup are routed through React Router, without a reload.

**Check it** (from `Web/`):
```
npm run build && npm run preview          # what Render serves, on http://localhost:4173
npm run audit:home                        # all 41 devices, ~15 min (-- --only phone|tablet|laptop|<name>)
```
The audit stops at every scene and reports sideways scroll, clipped/off-screen text, text under 11px,
44px touch targets, pinned scenes that do not fit the frame, 3D labels over text, console errors.
Playwright's WebKit on Windows draws variable fonts thin and widely spaced; that is the test browser,
not Safari (the measured text widths match Chromium), and the page now ships fixed Teko weights anyway.

**Speed** (production build, measured): mid-range phone on fast 4G with 4x CPU slowdown: first paint
1.5 s, largest paint 2.5 s, layout shift 0; laptop: 0.4 s / 1.0 s / 0. GSAP (~70 kB gz) loads after the
first paint; three.js (~187 kB gz) only when the apparatus section is within a screen and a half.

## 1. Fixed requirements

### Brand
- The name is **Mallakhamb India**. It replaces "Bhausaheb Ranade Navodit Mallakhamb
  Competition" everywhere. The words Bhausaheb, Ranade and Navodit must not appear anywhere
  on the page: not in the title, the footer or the copyright. `<title>`: "Mallakhamb India".
- Exactly one `<h1>`, and it reads "Mallakhamb India". It may be styled or split across spans,
  but its text content must be "Mallakhamb India".

### Block 1: the first screen. It must be STATIC.
The first block is a calm, instantly usable portal. It contains:

| Role   | Actions (exact hrefs)                                   |
|--------|---------------------------------------------------------|
| Player | Login `/player/login` · Register `/player/register`     |
| Coach  | Login `/coach/login` · Register `/coach/register`       |
| Judge  | Login `/judge/login` · Register `/judge/register`       |
| Admin  | Login `/admin/login` (no register)                      |

- "Static" means: no entrance animations, no scroll-linked or parallax motion, no autoplaying
  video, canvas, WebGL, marquee or slideshow, and no GSAP touching anything in block 1. It is
  fully visible and usable at first paint, even before JS loads. Hover, focus and press
  feedback is allowed and expected (CSS transitions of 200ms or less).
- All 7 links must be inside the first screen at 1440x900 AND 1280x720. On a 390x844 phone
  they should be in the first screen if at all possible (at most about 1.3 screens), each tap
  target at least 44x44px.
- Real links (`<Link to>`), not buttons with JS navigation, each labelled for screen readers
  ("Player — Log in").
- A static photo or illustration in block 1 is fine, and encouraged.
- A top nav is optional. If present: brand, plus a "Live Scores" link to `/scores`, plus
  optional in-page anchors.

### From block 2 on
GSAP-driven motion that stays in sync with the scroll: pinned scenes are scrubbed by ONE timeline
(text, photo and 3D change together) and snap to their stages.

## 2. Quality bar

- **Responsive, 320 to 1920px.** No horizontal page scroll at any width: watch `100vw`,
  off-canvas transforms and wide marquees, and clip them with `overflow: clip` on the section.
  Pinned horizontal-scroll scenes must turn into a sensible vertical layout below 768px, using
  `gsap.matchMedia()`. Use `svh`/`dvh` thoughtfully on mobile.
- **Reduced motion**: under `prefers-reduced-motion: reduce`, no pinning, no scrubbing and no
  continuous motion. All content is visible, with simple fades at most. Use `gsap.matchMedia()`.
  Never leave content at opacity 0 waiting for an animation that will not run. Prefer
  `gsap.from()` set up inside the motion-allowed branch, or `autoAlpha` with a visible CSS default.
- **Accessibility**: landmarks (`header`, `nav`, `main`, `footer`), logical heading order,
  meaningful `alt`, WCAG AA contrast (4.5:1 body text, 3:1 large text, including text over
  photos: add scrims), visible `:focus-visible` rings, and everything keyboard-operable. Hide
  decorative layers with `aria-hidden="true"`.
- **Performance**: animate `transform` and `opacity`. Avoid animating `filter`, `box-shadow` or
  layout properties on large elements. Use `will-change` sparingly. WebGL or canvas must pause
  when offscreen and cap DPR at 2.
- **No fabricated facts or stats.** No "500+ athletes" or "40 years of legacy". Use only the
  facts in section 4. If you show sample leaderboard data, label it visibly as demo data.
- **No AI-slop aesthetics** (see https://impeccable.style): no purple-to-blue gradients, no
  glassmorphism card soup, no eyebrow chip above every heading, no emoji icons, no nested cards,
  no generic "Unleash / Elevate / Revolutionize" copy, no Inter/Roboto/Arial as the display
  face, and avoid the default "trendy" trio of Space Grotesk, Fraunces and Instrument Serif
  italic. The type is Teko (display) and Archivo (text). Copy should be short, specific to
  Mallakhamb and confident. English, with Devanagari (मल्लखांब) welcome as a graphic or
  secondary element.
- The page's palette: stage black `#000`, teak `#140e09`, saffron `#FF6B00` (the one accent:
  things you press, the active state, the clock), chalk `#F3EEE6` text, ash `#A9A198` secondary
  text (7.6:1 on black). The stopwatch keeps the app's own Apple-style colours, as StopwatchFace does.

## 3. Facts you may use (and only these)

- **Name**: *malla* = wrestler, *khamb* = pole, so "the wrestler's pole". It began as a
  training aid for wrestlers.
- **Origins**: first described in the Sanskrit text *Manasollasa* (1135 CE, by the Western
  Chalukya king Someshvara III). Revived in the early 19th century in Pune by **Balambhatt Dada
  Deodhar**, teacher to Peshwa Bajirao II. The rope form grew out of practice on cane: when good
  cane became scarce, cotton rope replaced it.
- **Milestones**: 1958, first competitive appearance (National Gymnastics Championships) ·
  1962, first national championship (Gwalior) · 1981, the Mallakhamb Federation of India holds
  the first all-India nationals and sets the rules · 2013, Madhya Pradesh makes it the state
  sport · 2019, first World Mallakhamb Championship (Mumbai) · 2021, Pole Mallakhamb opened to
  girls at the Nationals.
- **Pole Mallakhamb**: a vertical teak or sheesham pole fixed in the ground and smeared with
  castor oil to control friction. It has a head, a neck and a body that tapers toward the top.
  Senior pole: 2.6–2.8 m above ground (another 0.8–0.9 m buried); circumference 53–55 cm at
  the base, about 35 cm at the top.
- **Hanging Mallakhamb**: a shorter pole (1.7–1.9 m) hung from hooks and a chain, 65–70 cm off
  the ground. It swings, and athletes must master it. It is contested by men.
- **Rope Mallakhamb**: a cotton rope 6–6.5 m long and 18–20 mm thick (seniors). Skills are
  performed without knotting the rope. The code requires the rope to be held in the legs at a
  height of 4 m at least once.
- **The routine**: 60–90 seconds. The time keeper gives a short whistle at 60 s and a long
  one at 90 s.
- **The 10-point code**: Difficulty 3.80 + Combination 1.60 + Execution 4.40 + Originality
  bonus 0.20 = 10.00. Difficulty elements are graded A, B and C classes. Execution deductions
  include improper posture, pauses longer than 2 s, and 0.50 for each fall.
- **The panel**: a Chief (Senior) Judge plus evaluation judges (panels of 3, 4 or 5 on this
  platform), with a Scorer and a Time Keeper.
- **Competitions on the platform**: Competition I (Team Championship), Competition II
  (All-round Individual), Competition III (Apparatus), each split by gender and age group,
  from Under-10 to Seniors. The team championship counts each team's best 3 or best 5 per apparatus.
- **What the platform does**: player and coach registration · team building · entry-fee
  payments · judge panels with digital score slips · real-time live scoring · public live
  scores and rankings (`/scores`) · team championship standings.

## 4. Images

Only local files from `Web/assets/images`, imported in `src/pages/public/home/images.js` and named in
the markup as `src="%img:<key>%"`; nothing loads from another site. Credit every photo used (author,
licence, source link) in the footer, in `home/footer.html`. Do NOT use `src/assets/main-home.jpg`: the banner behind the group shows the
old competition name in the pixels.
