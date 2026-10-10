# Prime Time, site-wide: the design-language plan

**Status:** Phases 0–7 done (2026-10-11) on stacked branches ending at `look/phase-6-retire-classic`; **not merged, not deployed** (merging and the Render deploy wait for the owner). Prime-time is the only look. See the progress log (§14), [REPORT.md](REPORT.md) and [LOOKS.md](LOOKS.md).
**Reference implementation:** the landing page, at commit `9814afa`:
- `src/pages/public/Home.jsx`
- `src/pages/public/home/home.css`
- `docs/homepage/README.md`

**Builds on:**
- `docs/RESPONSIVE_UIUX_PLAN.md`: the Appearance system, the responsive primitives and the audit harness. All of these stay.
- Project memory: protected behaviours, the audit traps and the working style.

---

## 0. In one page

**Goal.** Every screen of the site should look like the new home page. That page uses a sports-broadcast graphics package ("Prime Time"):
- a black stage with teak bands
- chalk-coloured type
- saffron as the one colour you can press
- Teko numerals and headings
- hairline rules and square corners
- cut-eased wipes

This has to hold in Dark and in Light, for all six roles and on every device, iPhone and Safari included. No user flow may change. The structure must also let the *next* restyle be a change of values, not a rewrite.

**How:**
1. **A third styling axis, *Look*.** It sits beside *Appearance* (dark | light) and *Role* (the per-role accent).
   - Each look is one **pack**: a plain JS file of values, compiled into CSS custom properties.
   - Today's design becomes the `classic` pack, byte for byte. The new language is the `prime-time` pack.
2. **Components read semantic tokens only**, such as `--surface`, `--fg-secondary`, `--radius-control` and `--ease-cut`.
   - They never use a hex value, a font name or a look name.
   - Tailwind's colour, radius, font, shadow, blur and easing scales point at the same tokens. So the 621 `rounded-*` uses and the blur utilities change with the look without editing those files.
3. **The look is picked per route group** from one table, `LOOK_BY_ROUTE`.
   - A group switches to prime-time only after its wave passes every gate.
   - Switching a group back is a one-line revert. That is the kill switch if a regression appears during a live competition.
4. **Four waves, lowest risk first:** public and auth → player and coach → admin and superadmin → judge. After the last wave, the classic pack and the glass-era components are deleted.
5. **Gates that make the work safe and keep it safe:**
   - A **token contract test** that runs in milliseconds with no browser. It checks every token is present, and WCAG contrast, for every look × appearance × role.
   - The existing Playwright audits.
   - A lint ratchet.
   - A bundle guard, so GSAP and three.js stay on Home only.
   - A font budget.

Making a future change: edit a pack, or add one that `extends` it. Then run the contract test, check the specimen page and switch routes. §11 is the playbook.

---

## 1. What the home page uses: the language, extracted

These are measured values, not adjectives. Contrast is WCAG 2.x relative luminance.

| Facet | The rule on Home | Notes |
|---|---|---|
| **Stage** | Black `#000`. Bands are teak `#140E09`; the raised and hover state is teak-2 `#20160E`. | Depth comes from a step in surface colour plus a hairline. Never a shadow or blur. |
| **Text** | Chalk `#F3EEE6` is primary text: 18.2:1 on the stage, 15.4:1 on teak-2. Ash `#A9A198` is secondary: 8.2:1 on the stage, 6.97:1 on teak-2 (the worst case). | There are only two text levels. Hierarchy comes from size and type family, not from fading the text. |
| **The one accent** | Saffron `#FF6B00` marks what you can press, the active state and the clock. The label on saffron is black, at 7.36:1. | Saffron as text on the stage is 7.36:1. Every other colour is either data or status. |
| **Lines** | Hairlines are chalk at 16%. Line buttons have a 1.5px inset ring. A **3px saffron rule** means "this is live or active". | The 3px rule appears on the portal top, the slip top, the active slip row and the stopwatch-legend mark. |
| **Shape** | Corners are 0 to 2px, 4px at most. | No pills. Tags are square. |
| **Display type** | Teko 600, uppercase, line-height 0.8 to 0.9. | It covers Devanagari too (मल्लखांब). |
| **Numbers** | Teko 500 with tabular figures. Units are 0.56em and saffron. | Examples: spec sheets, the slip and the timeline. |
| **Text type** | Archivo Variable: 17px/1.55 for body, 600 at 14.5px for buttons. | Self-hosted through Fontsource, because the CSP is `font-src 'self'`. |
| **Tags** | Archivo 700, 12px, width 125%, tracking 0.06em, uppercase. | Used for eyebrows, table heads and labels. |
| **Composition** | Broadcast graphics: lower thirds (the portal), a channel bug, spec sheets (label on the left, Teko value on the right, hairline rows), a running order (numbered rows), a score graphic (the slip and total), a ticker. | — |
| **Motion** | GSAP; the cut ease `cubic-bezier(.62,0,.12,1)`; clip-path wipes, masked text reveals, rolling counters. Scrubbed pins only where they teach something. Durations 0.3 to 1.1s. | Nothing bounces or scales on hover. Buttons swap colour in 160ms and press down 1px. Every effect has a reduced-motion path. |
| **Signatures** | Film grain at 7.5%, the stinger (a saffron bar wipes across a heading), the pole rule, the pole-mark logo, the channel bug, the ticker. | These belong to "stage" screens (§5.7). |
| **Instrument island** | The stopwatch keeps the app's `StopwatchFace` Apple colours and the system font. | Its amber and red band is the COP 60–90 s window, so those colours carry rule meaning. |
| **Accessibility** | 3px saffron focus ring (chalk on saffron), 44px targets, no text under 11px, a skip link, full reduced motion. | — |
| **Speed** | Fonts are self-hosted. Motion code loads after the first paint, and three.js only when its section is near. CLS is 0. | Phone LCP is 2.5 s. |

**What Home doesn't have, but the app needs:**
- forms, tables, dialogs, toasts, tabs, menus
- status messages, and empty, loading and error states
- dense working screens
- a Light appearance

§5 to §7 derive these from Home's rules, so they read as one language rather than as additions.

---

## 2. The rest of the site today (measured at `9814afa`)

| Measure | Count | What it means for the migration |
|---|---:|---|
| Pages and components in scope | 39 pages, ~40 shared components | Wave sizes are in §9. |
| Inline `style={{…}}` blocks | 1,377 | Most of the visual styling lives here. Each wave replaces these with primitives. |
| Hex literals in JSX | 134 | Banned in each folder once it has migrated. |
| Tailwind palette utilities (`text-gray-400`, `from-orange-500`, …) | 144 | These won't follow any token; they are rewritten per wave. |
| `rounded-*` utilities | 621 | Change for free once the radius scale reads tokens (§4.5). |
| Backdrop blur | 42 (36 inline, 6 as utilities) | The utilities change for free. The inline ones are removed per wave. |
| Linear and radial gradients | 86 | All decorative ones go; photo scrims stay. |
| framer-motion | 52 files: 54 `whileHover`, 54 `whileTap`, 141 `AnimatePresence`, 25 `Reorder` | Decorative motion moves to CSS. `AnimatePresence` and `Reorder` stay. |
| `FadeIn` wrappers | 19 users | Replaced by one CSS entrance utility. |
| `uppercase` | 164 | Audited against the COP-verbatim rule (§8). |
| Ad-hoc font sizes | 66 arbitrary `text-[…]` + 97 inline `fontSize` | Replaced by the type scale. |
| `font-bold/extrabold/black` | 486 | Teko and Archivo weights replace "make it heavier" as the source of hierarchy. |
| **Font actually rendered** | — | `Inter` is declared but **never loaded**, so every device shows its own system font (Segoe UI, San Francisco, Roboto). The app has never had one typeface. |
| **Old brand** | — | "Bhausaheb Ranade" appears on 6 screens and the `BHA.png` logo on 9. **The favicon is `vite.svg`.** |
| Lint baseline | 1,437 warnings, 859 of them hard-coded colours | Becomes the ratchet's starting point. |

**Keep these as they are:**
- **The Appearance system:** RGB-triplet tokens, the no-flash bootstrap, `[data-appearance]` islands. Contrast passes 88/88 in both appearances.
- **Token helpers:** `alpha()`, `FG`, `DATA_COLORS`.
- **Shared scales:** `breakpoints.js` and the z-index scale.
- **Responsive building blocks:** `.tap-safe`, `mouse:`, `.modal-overlay` / `.modal-panel`, `.stacked-table`, `useResponsive`.
- **The audit harness**, and `StopwatchFace`.

**Already dead or nearly dead** (re-verify before deleting):

| Component | Users |
|---|---:|
| `TiltCard` | 0 |
| `CoachOrnament` | 0 |
| `ThemedTextarea` | 0 |
| `LiveRegion` (imports) | 0 |
| `GlassCard` | 2 |
| `StatCard` | 2 |
| `ThemedButton` | 5 |

---

## 3. Decisions

I picked each of these myself, following the working style: take the recommended option unless it changes a user flow. None of them changes a flow. Each one lives in a pack or a shared component, so changing your mind later means editing a value, not rewriting screens.

| # | Decision | Why |
|---|---|---|
| **D1** | Prime Time becomes the one design language of the whole site. Home is its reference implementation. | The owner asked for exactly this, and one language is cheaper to keep consistent than two. |
| **D2** | The new axis is called **Look** (`data-look`). Appearance keeps `data-appearance`, and Role keeps `data-role` and `ThemeProvider`. | "Theme" already means the role accent, and "Appearance" means dark or light. A third word avoids the naming collision the responsive plan's §14.1 warned about. |
| **D3** | **Saffron is the action colour for every role.** The role colour becomes an **ident**: a small labelled tag in the header and on the login screen, plus focus context. It never colours buttons. | This is Home's rule: one colour you can press. It also removes the 5 roles × 2 appearances accent matrix that cost most of the contrast work. Switching back is one line in the pack (`accent: 'role'`). |
| **D4** | Light gets a **designed counterpart, "chalk paper"**, not an inversion: page `#F3EEE6`, panels `#FBF8F3`, text in teak-black `#140E09`. Home itself stays a dark island. | It is the same materials, inverted (chalk and teak). It is a low-saturation warm grey, not the cream-plus-saffron template the responsive plan rejected. All values are measured in §5. |
| **D5** | **Fonts:** Archivo Variable for text and UI. Teko for display and for numbers of 24px and up. The system font only inside the stopwatch island. Inter is removed. | One typeface on every device for the first time. Teko is condensed: it is excellent large and poor small. |
| **D6** | **No glass, no decorative gradients, no orbs or hex grids anywhere.** Signatures (grain, stinger, pole rule, channel bug) appear only on *stage* screens: the public screens and the login side panel. | Working screens need calm. Blur is also the most expensive effect on low-end Android. |
| **D7** | **Motion on app screens is CSS driven by tokens.** framer-motion stays only for `AnimatePresence` and `Reorder`. GSAP and three.js stay on Home only, enforced by the bundle guard. | Judges' phones get no new JavaScript. The stopwatch already proved CSS beats framer for responsiveness. |
| **D8** | **Roll out by route group** behind `LOOK_BY_ROUTE`. The `classic` pack reproduces today's design exactly until its last route switches. | Nobody sees a half-migrated screen, and a production rollback is one line. |
| **D9** | **Brand sweep:** "Mallakhamb India" and the pole mark everywhere. `BHA.png` is retired from the interface. A real favicon and an apple-touch-icon are made from the pole mark. | This extends the owner's renaming from the home page to the rest of the site. |
| **D10** | **Uppercase only on text we write** (display headings, tags). Never on COP text, stored values or people's names. | The COP-verbatim rule (memory), `levelLabel()`, and names keep their spelling. |
| **D11** | **"Tailwind for layout, primitives for the look."** Pages use Tailwind for grid, flex, gap, padding and position. Colour, type, borders, corners and surfaces come only from primitives and tokens. | This is what makes the next restyle a pack edit. Restyles break when visual decisions live in 39 pages. |
| **D12** | **There is no density axis.** Stage screens and working screens differ by which type steps and patterns they use (§7), not by a fourth attribute. | Fewer axes means fewer combinations to test. |

---

## 4. Architecture: the scalable part

### 4.1 Three axes

```
<html data-look="prime-time" data-appearance="light" data-role="judge">
         └─ what it looks like └─ dark | light         └─ which role (ident)
```

| Axis | Values | Set by | Changes at runtime by |
|---|---|---|---|
| Look | `classic`, `prime-time` (later: any pack) | `applyLook(pathname)`, called next to `applyRoleAccent` | navigating, which flips the attribute; nothing remounts |
| Appearance | `dark`, `light` (preference `system`) | `appearance-init.js` before first paint; then `AppearanceProvider` | the Light/Dark switch |
| Role | `player`, `coach`, `judge`, `admin`, `superadmin`, or none (public) | `applyRoleAccent(getRoleFromPath())` | navigating |

**Islands:** any element can carry `data-appearance` (the stopwatch is always dark; Home is always dark). During the migration, Home's root also carries `data-look="prime-time"`. It has no role, so no role values need resolving on it.

### 4.2 Three token tiers and one contract

| Tier | Example | Who may reference it |
|---|---|---|
| **Primitive**: raw material, named for what it *is* | `saffron`, `teak`, `chalk`, `ash`, `paper`, `band`, `inkLight` | **Only the pack** it belongs to. |
| **Semantic**: a job in the interface, named for what it *does* | `--bg`, `--surface-raised`, `--fg-secondary`, `--line-strong`, `--accent`, `--on-accent`, `--ident`, `--focus-ring`, `--danger-fg`, `--font-display`, `--radius-control`, `--ease-cut`, `--dur-2` | Every component and page (through Tailwind, `FG`, CSS). |
| **Component**: one component's knobs, defaulting to semantic tokens | `--btn-h`, `--btn-radius`, `--field-ring`, `--panel-rule`, `--tab-bar` | That component's CSS. A pack may override them. |

`src/styles/looks/contract.js` is **the stable interface between looks and components**. It lists:
1. Every semantic and component token: name, type (colour triplet, colour, length, font stack, easing, duration, number) and a one-line purpose.
2. **Contrast pairs** with minimums, which the contract test enforces for every look × appearance (× role, for ident):
   - `fg` on every surface ≥ 12
   - `fg-secondary` and `fg-muted` ≥ 4.5 (prime-time aims for ≥ 6)
   - `accent-fg`, `ident-fg`, status `-fg` and the data palette ≥ 4.5 on every surface
   - `on-accent` on `accent` ≥ 4.5
   - `focus-ring` and `line-strong` ≥ 3 on every surface
3. **Fixed islands** that are deliberately outside the contract: the stopwatch's Apple colours.

Existing token names are kept on purpose (`--bg`, `--surface*`, `--ink`, `--fg*`, `--line*`, `--accent*`, status, `--cat-*`, `--medal-*`). Nothing that reads them today needs to change. The new tokens are:
- `--ident`, `--ident-fg`, `--on-ident`
- fonts and type composites
- shape
- motion
- the signature tokens
- component tokens

`--accent` keeps its meaning: *the colour you press*. In prime-time it is saffron for every role. That one value is all D3 needs.

### 4.3 Packs: one file per look

```js
// src/styles/looks/prime-time.js  (sketch; the shape, not final values)
export default defineLook({
  id: 'prime-time',
  extends: null,                       // a seasonal skin would say extends: 'prime-time'
  primitives: { stage: '#000000', teak: '#140E09', teak2: '#20160E', chalk: '#F3EEE6', ash: '#A9A198',
                saffron: '#FF6B00', saffronDeep: '#9A2C06', paper: '#FBF8F3', band: '#E8E0D4',
                inkLight: '#140E09', ashLight: '#544B42' },
  appearances: {
    dark:  { bg: 'stage', surface: 'teak', 'surface-raised': 'teak2', ink: 'chalk', 'fg-secondary': 'ash',
             accent: 'saffron', 'accent-fg': 'saffron', 'on-accent': '#000000', 'focus-ring': 'saffron', /* … */ },
    light: { bg: 'chalk', surface: 'paper', 'surface-sunken': 'band', ink: 'inkLight', 'fg-secondary': 'ashLight',
             accent: 'saffron', 'accent-fg': 'saffronDeep', 'on-accent': '#000000', 'focus-ring': 'saffronDeep', /* … */ },
  },
  roles: { player: { dark: 'saffron', light: 'saffronDeep' }, coach: { dark: '#22C55E', light: '#166534' }, /* … → --ident */ },
  accentPolicy: 'single',              // 'single' = accent ignores role (D3); 'role' = classic behaviour
  type:   { text: "'Archivo Variable', Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif",
            display: "Teko, 'Arial Narrow', Impact, sans-serif", /* steps in §5.4 */ },
  shape:  { 'radius-control': '2px', 'radius-panel': '0px', rule: '3px', ring: '1.5px', /* Tailwind radius scale */ },
  motion: { 'ease-cut': 'cubic-bezier(.62,0,.12,1)', 'dur-1': '120ms', /* … */ },
  components: { 'btn-h': '44px', 'btn-h-mouse': '36px', 'btn-radius': 'var(--radius-control)', /* … */ },
});
```

**The generator** is `scripts/build-looks.mjs`, about 150 lines with no new dependency. It runs through `npm run looks`, and is also hooked into `predev` and `prebuild`. It:
- resolves `extends`, then primitives, then semantic tokens
- writes `src/styles/generated/looks.css`, which is committed, with:
  - one block per look × appearance, in the selector form islands need: `[data-look=L][data-appearance=A], [data-look=L] [data-appearance=A]`
  - every derived token re-declared inside each block (the rule `index.css` already follows)
  - role blocks `[data-look=L][data-role=R]`
  - a `prefers-reduced-motion` block that sets every `--dur-*` to `0ms`
- writes `looks.meta.json` (resolved values) for the tests and for the `theme-color` values

**Adding a look:** add a file, register it in `looks/index.js` and run `npm run looks`. No component changes.

### 4.4 How the look reaches the page

- `src/utils/ui/look.js` defines:
  - `LOOK_BY_ROUTE`: an ordered list of `{ match: RegExp, look }`
  - `DEFAULT_LOOK`
  - `applyLook(pathname)`, which sets `html[data-look]`
  - `useLook()`, for the rare component that must branch, such as the specimen page
- `AppContent`'s layout effect calls it beside `applyRoleAccent`. A route change flips one attribute; nothing remounts or reloads. This is protected behaviour 4: a judge mid-slip keeps everything.
- **During the migration:** `DEFAULT_LOOK = 'classic'`, and `/` maps to prime-time. Each wave adds its route patterns in the same PR that finishes it.
- **Developer preview:** `?look=prime-time` is kept for the browser tab (sessionStorage). It is honoured in dev and in preview builds with `VITE_LOOK_OVERRIDE=1`, and ignored in the deployed build. That shows the half-finished state to developers only.
- **First paint:** `appearance-init.js` sets `data-look` to the default. The only visible difference before React sets the route's look is the page background (`#0A0A0A` against `#000`), which is imperceptible. Once the migration ends there is one look and the question goes away.
- `THEME_COLOR` in `appearance.js` and `appearance-init.js` (the browser chrome colour) must equal the look's `--bg`. The contract test reads `looks.meta.json` and asserts this.

### 4.5 Tailwind consumes tokens and never holds values

In `tailwind.config.js`, every visual scale reads a variable. The `classic` pack holds **Tailwind's own default values**, so nothing moves until a route group switches:

| Scale | Becomes | Effect when a route switches to prime-time |
|---|---|---|
| `colors.*` (already tokens) | unchanged | follows the pack |
| `borderRadius` sm…3xl | `var(--radius-sm)` … `var(--radius-3xl)`; `full` stays 9999px | 621 `rounded-*` drop to 0–4px without editing a file |
| `fontFamily.sans` (+ new `display`) | `var(--font-text)`, `var(--font-display)` | the text font changes everywhere at once |
| `boxShadow` | `var(--shadow-*)` | prime-time removes all shadows |
| `backdropBlur` | `var(--blur-*)` | prime-time sets them to `0` (the 6 utility uses) |
| `transitionTimingFunction` / `transitionDuration` | `var(--ease-*)` / `var(--dur-*)` | motion feel follows the pack; reduced motion zeroes the durations |
| type steps (new utilities) | `type-display-l`, `type-tag`, `type-num-m`, … from the pack | one vocabulary for type |

Because `tailwind.config.js` only knows token *names*, **a new look never edits Tailwind's config.** Remember to restart the dev server after any config edit (responsive-system memory).

### 4.6 JavaScript consumers

- `FG`, `DATA_COLORS` and `DESIGN_TOKENS.colors.surfaces/borders/text` already hold `rgb(var(--…))` strings, so they follow the look unchanged. New `IDENT` and `MOTION` exports follow the same pattern.
- framer-motion cannot read CSS variables for easing. `readEase('--ease-cut')` parses the computed `cubic-bezier()` into an array, so `AnimatePresence` timings follow the pack too.
- Razorpay can't read variables either. `CoachPayment` and `SuperAdminAddPlayerPayment` pass `getComputedStyle(html).getPropertyValue('--accent-hex')`, which the generator emits.
- **Banned:** importing a pack file from a component. Only the generator, the tests and the specimen page may do that. A lint rule enforces it (§10).

### 4.7 Where the visual decisions live (D11)

| Layer | May decide | May not |
|---|---|---|
| Pack (`styles/looks/*.js`) | every value | — |
| Look signatures (`styles/looks/<id>/signatures.css`) | look-specific CSS that tokens can't express (grain texture, stinger) | anything another look needs |
| Primitives (`components/ui/*`, a CSS file each, `ui-` prefix, `@layer components`) | anatomy and states, using semantic and component tokens | hex values, font names, look ids |
| Shells (`components/shell/*`) | page frame, header, nav, account cluster | colours outside tokens |
| Pages | layout through Tailwind; which primitives to use | colour, type, borders, radius, shadow, blur, inline visual styles (`style` only for CSS variables and layout maths) |

**Component CSS is global but prefixed** (`.ui-btn`, `.ui-panel`). That's safe even though Vite keeps a lazy route's CSS loaded, the same reason `home.css` is scoped to `.mk-home`.

### 4.8 File layout (new and changed)

```
src/styles/looks/contract.js        the interface (§4.2)
src/styles/looks/define.js          defineLook + extends resolution
src/styles/looks/classic.js         today's values, moved verbatim from index.css
src/styles/looks/prime-time.js      the new language (§5)
src/styles/looks/prime-time/signatures.css
src/styles/generated/looks.css      generated, committed, drift-tested
src/styles/generated/looks.meta.json
src/styles/fonts.js                 the one place fonts are imported (§5.4)
src/utils/ui/look.js                LOOK_BY_ROUTE, applyLook, useLook, readEase
src/components/ui/…                 primitives (§6)
src/components/shell/…              AppHeader, AccountControls, RoleIdent, PageHeader, TabNav
src/components/brand/…              PoleMark, Wordmark
src/pages/dev/LookSpecimen.jsx      /__look (dev and preview only)
scripts/build-looks.mjs
scripts/bundle-guard.mjs
docs/design-language/README.md      the rules, with specimen screenshots (written in Phase 3)
docs/design-language/LOOKS.md       the §11 playbook, kept current
```

---

## 5. The prime-time pack: values

### 5.1 Colour

Ratios are computed. The contract test re-checks them on every commit.

| Semantic token | Dark: value (worst ratio) | Light "chalk paper": value (worst ratio) |
|---|---|---|
| `--bg` (stage / page) | `#000000` | `#F3EEE6` chalk |
| `--surface` (bands, panels) | `#140E09` teak | `#FBF8F3` paper |
| `--surface-raised` (hover, selected, menus) | `#20160E` teak-2 | `#FFFFFF` |
| `--surface-sunken` (wells, table heads) | `#000000` | `#E8E0D4` band |
| `--surface-overlay` (dialogs) | `#20160E` | `#FFFFFF` |
| `--ink` → `--fg` | `#F3EEE6` chalk (15.4 on teak-2) | `#140E09` teak-black (14.6 on band) |
| `--fg-secondary` = `--fg-muted` | `#A9A198` ash (6.97 on teak-2) | `#544B42` (6.52 on band) |
| `--fg-subtle` (disabled, decorative) | chalk at 50% (4.8 on teak) | ink at 50% (3.5 on page) |
| `--line` | chalk at 16% | ink at 14% |
| `--line-strong` (input rings, 1.4.11) | chalk at 55% (5.6 on stage) | ink at 50% (3.5 on page; the contract floor is 3.0) |
| `--accent` (fill you press) | `#FF6B00` | `#FF6B00` (the same brand saffron) |
| `--on-accent` | `#000000` (7.36) | `#000000` (7.36) |
| `--accent-fg` (saffron as text) | `#FF6B00` (6.2 on teak-2) | `#9A2C06` deep saffron (5.9 on band) |
| `--focus-ring` | `#FF6B00`; chalk on saffron fills | `#9A2C06`; ink on saffron fills |

Notes:
- **Two text levels, as on Home.** Secondary and muted share one value, and hierarchy comes from type. The contract keeps them as two tokens, so a future look can split them.
- **The saffron fill against the light page is 2.47:1.** The label identifies the button (7.36:1), so WCAG 1.4.11 doesn't apply to the fill edge. Focus rings and input borders, where it does apply, are ≥ 3:1.
- **Measured trap:** today's light status shades fail on chalk paper. `#15803D` success is 4.34 and `#B45309` warning is 4.35, both under 4.5. Prime-time light therefore uses the -800 shades (§5.3).

### 5.2 Role ident (D3)

The ident is a small square tag ("JUDGE") in the header and on the login screen. It is always text plus colour, never colour alone.

| Role | Dark (on teak) | Light (on page) |
|---|---|---|
| player | `#FF6B00` | `#9A2C06` |
| coach | `#22C55E` (8.4) | `#166534` (6.2) |
| admin / judge | `#A78BFA` (7.0) | `#6D28D9` (6.2) |
| superadmin | `#F5A623` (9.5) | `#92400E` (6.1) |
| public | chalk | ink |

### 5.3 Status and data

**Status text:**

| Status | Dark | Light |
|---|---|---|
| success | `#22C55E` | `#166534` (6.2) |
| warning | `#F59E0B` | `#92400E` (6.1) |
| danger | `#F87171` (6.4 on teak-2) | `#B91C1C` (5.6) |
| info | `#60A5FA` | `#1D4ED8` (5.8) |

Status shows as a **square tag with a tint**, or as **a 3px rule plus text**. It never appears as a filled pill.

**The data palette** (Difficulty, Combination, Originality, deductions, medals, girls) keeps its meanings and hues. Its light shades are re-tuned against chalk paper until the contract test passes. On boards, these colours are the only colour besides saffron.

### 5.4 Type

**Fonts:**
- Loaded once, app-wide, in `styles/fonts.js`: `@fontsource-variable/archivo/wdth.css` and `@fontsource/teko/500.css` + `600.css`. Home's imports move there.
- The latin first paint costs **≤ 100 KB**: Archivo wdth latin is 88 KB and Teko 600 latin is 7.7 KB. Teko's Devanagari subset (33 KB) loads only where Marathi text appears, through `unicode-range`.
- **Preload:** Archivo latin on every prime-time route, and Teko 600 where the first screen has a display heading (the same pattern as `preloadHome()`).
- **Metric-matched fallbacks:** `@font-face` declarations over local Arial and Arial Narrow with `size-adjust` and `ascent-override`. While a font swaps in, nothing shifts, so CLS stays 0.
- **Fallback budget:** if the 100 KB budget fails on the phone profile, subset Archivo to latin-basic plus ₹ and common punctuation.

**Type steps.** Each step is a token composite emitted as separate properties.

| Step | Use | Prime-time value |
|---|---|---|
| `display-xl` | public stage headings only | Teko 600, `clamp(52px, 8vw, 136px)`/.85, uppercase |
| `display-l` | page titles on working screens | Teko 600, `clamp(40px, 4.2vw, 64px)`/.88, uppercase |
| `display-m` | section and panel titles | Teko 600, `clamp(28px, 2.4vw, 38px)`/.9, uppercase |
| `display-s` | dialog titles, group heads | Teko 600, 26px/.9, uppercase |
| `num-l` | final score, totals, key stats | Teko 500, `clamp(40px, 4vw, 64px)`/.85, tabular; unit 0.56em in accent-fg |
| `num-m` | spec values, ranks | Teko 500, 30px/.9, tabular |
| `body` | text | Archivo 400, 16px/1.55 (17px on stage screens) |
| `body-s` | dense table cells, meta | Archivo 400, 14.5px/1.45 |
| `caption` | help text, captions | Archivo 400, 13.5px/1.4 |
| `tag` | eyebrows, table heads, labels, idents | Archivo 700, 12px/1, width 125%, tracking 0.06em, uppercase |
| `button` | buttons | Archivo 600, 14.5px/1 |
| `input` | fields | Archivo 400, **16px on touch** (iOS zoom rule), 15px with `mouse:`; tabular figures in mark fields |

**Rules:**
- Teko only at 24px and above. Never in inputs, body copy, COP text or table cells.
- Numbers in tables use Archivo with tabular figures. Teko is for numbers that are the point of a screen.
- The text floor is 12px; tags may go down to 11px.

### 5.5 Shape, lines, space

| Token | Value |
|---|---|
| `radius-control` | 2px |
| `radius-panel` | 0 |
| Tailwind radius scale | sm…lg = 2px, xl…3xl = 4px, `full` unchanged (dots, avatars) |
| Hairline | 1px `--line` |
| `ring` (line buttons and inputs) | 1.5px inset, `--line-strong` |
| `rule` | 3px, `--accent`: the "live" marker. Top of a feature panel or dialog, left of an active row. `--danger-fg` for destructive dialogs. |
| `focus-width` / `focus-offset` | 3px / 2px everywhere, Home included once it joins the shared layer |
| Shadows | none. Elevation = a surface step plus a hairline. A dialog sits on `--scrim`. |
| Page gutter `--pad` | `clamp(16px, 4vw, 56px)` |
| Spacing | the 4px Tailwind scale. Section rhythm `clamp(48px, 7vw, 112px)` on stage screens, `clamp(24px, 3vw, 40px)` on working screens. |

### 5.6 Motion

| Token | Value | Use |
|---|---|---|
| `ease-cut` | `cubic-bezier(.62,0,.12,1)` | wipes, rules growing, tab bars |
| `ease-out` | `cubic-bezier(.22,1,.36,1)` | menus, dialogs |
| `dur-1` | 120ms | press (1px) |
| `dur-2` | 160ms | hover colour swaps |
| `dur-3` | 300ms | wipes, dialog in, tab bar |
| `dur-4` | 600ms | the most any entrance may take on a working screen |

**Rules:**
- **No springs.** The spring easing token goes in Phase 6.
- **No hover scale** (`whileHover: { scale }` goes). No global hover lift: prime-time cancels the `index.css` `button:hover` translate, as Home already does.
- **Entrances:** one `wipe-in` (clip-path from the left) for page headers, and a short fade for lists, at most 6 staggered items.
- **Reduced motion:** the generator sets every `--dur-*` to 0ms, and framer reads `useReducedMotion`. One switch covers everything.

### 5.7 Signatures: allowed only on stage screens

**Stage screens:** `/`, `/scores`, the 404 page, and the side panel of login, register, forgot and reset.

| Signature | Stage screens | Working screens |
|---|---|---|
| Grain overlay | yes | no (it reduces legibility of dense data) |
| Stinger (saffron bar wipe on a heading) | yes, at most one per screen | no |
| Pole rule (the vertical line that fills) | Home only | no |
| Channel bug | Home only | the masthead's competition "segment" plays this role |
| 3px accent rule | yes | yes: the one signature working screens keep |
| Teko numerals with saffron units | yes | yes |

---

## 6. Component inventory

New primitives live in `components/ui/`; each replaces something that exists today.

| Primitive | Prime-time anatomy | Replaces |
|---|---|---|
| `Button`: solid, line, ghost, danger; sizes sm/md/lg; loading; icon | 44px on touch through `.tap-safe`, 36px with `mouse:`. Radius 2px, Archivo 600. Solid is saffron with a black label and turns chalk on hover. Line has a 1.5px inset ring. 1px press, no scale. | `ThemedButton`, `SAFFRON_CTA` (6 files), hand-rolled gradient buttons |
| `IconButton` | a 44px square with a line ring and an accessible name | ad-hoc icon buttons |
| `Field` with `Input`, `Select`, `Textarea`, `PasswordInput` and mark-field styling | Label above in `tag` style; help text in `caption`. 1.5px inset ring. Errors in `--danger-fg` with a 3px danger rule. 16px on touch. | `ThemedInput/Select/Textarea`, `Dropdown` styling, auth fields |
| `Panel`: plain, band, feature | A flat surface step plus a hairline. *Feature* adds the 3px accent top rule (the lower third). | `GlassCard`, `DarkCard`, `COMMON_STYLES.glassCard/cardBase`, ~200 inline card styles |
| `Stat`, `SpecList` | Tag label, Teko number, saffron unit, hairline rows (Home's spec sheet) | `StatCard`, the stats in `AdminKit` |
| `Heading` (steps from §5.4; `sting` only on stage screens), `Tag` | — | `GradientText`, ad-hoc headings |
| `StatusTag` | a square tag, status colour with a tint, always text | `rounded-full` status pills |
| `DataTable` | Tag-style heads, hairline rows, tabular figures. Hover is the raised surface; the active row gets a 3px left rule. Keeps `.stacked-table` below `md`. | `ResponsiveTable` styling, hand-rolled tables |
| `Tabs`, `Segmented` | Text tabs with a 3px bar under the active one (accent, `ease-cut`). Segmented works like Home's panel picker. | dashboard tab buttons, filter toggles |
| `Dialog`, `ConfirmDialog` | Keeps `.modal-overlay` and `.modal-panel`. Square panel with a 3px top rule (danger for destructive), `display-s` title, actions on the right (stacked on phones). | `ConfirmDialog` styling, the 17 dialogs |
| `Menu`, `Popover` | square, hairline, raised surface, arrow-key behaviour unchanged | the `AppearanceMenu` popover, `Dropdown` |
| Toast styles | a black or paper panel with a 3px status rule on the left | the `Toaster` options in `App.jsx` |
| `EmptyState`, `ErrorState`, `Skeleton`, `Spinner` | Flat. Skeleton blocks use the raised surface with a slow opacity pulse, turned off for reduced motion. | ad-hoc loaders, `AuthLoadingSpinner` |
| Shell: `AppHeader`, `AccountControls`, `RoleIdent`, `PageHeader`, `TabNav` with the phone drawer | §7 | `Navbar`, the `UnifiedDashboard` header, the judge headers, the `CornerAppearanceMenu` frame |
| Brand: `PoleMark`, `Wordmark` | lifted out of `Home.jsx` | `BHA.png`, the "Bhausaheb Ranade" text |
| Stage signatures: `Grain`, `Sting` | lifted out of Home | `HexGrid`, `AmbientOrbs` and `ShieldOrnament` on public screens |
| Motion: `wipe-in`, `fade-in` CSS utilities; `readEase()` | — | `FadeIn` |

**Kept, restyled only through tokens:**
- `StopwatchFace` (an island; never touched)
- `SortableList` (`Reorder`)
- the `AppearanceMenu` logic
- `PasswordStrength`
- `LiveRegion`
- the responsive primitives

**Home joins the shared layer.** Its `.btn`, `.tag`, display headings and stinger move to the primitives, so the site has one button, not two. `home.css` keeps only the page's own sections, and its local variables become aliases of the semantic tokens, so a future pack edit reaches Home too.

---

## 7. Screen patterns: how each kind of screen adopts the language

| Screen kind | Pattern |
|---|---|
| **Stage**: `/`, `/scores`, 404 | Black stage, `display-xl`, signatures allowed, photos with scrims. `/scores` reads as a results graphic: a lower-third podium (stacked below `sm`, as it does now), Teko ranks and totals, medals in data colours, the published panel-rule average with no per-judge pills. |
| **Auth**: login, register, forgot, reset, admin register | Split layout. A **stage side**: role ident, the role name very large in Teko, pole mark, grain, and no photo, to keep phone LCP low. A **form side** on the surface: one saffron submit, links as underlined text, errors inline. The role switcher is a row of roles like Home's portal. Lockout, rate-limit and OTP states are unchanged. |
| **Selection**: level, competition | **Running order:** numbered rows, Teko names, hairlines, a chevron, raised surface on hover. "Opening ‹name›…" pass-through and "Counting…" are unchanged; no new skeleton replaces them. |
| **Working-screen shell**: every signed-in screen | A **masthead bar**: black or paper, hairline bottom. It holds the pole mark and wordmark; the **role ident**; the **current competition as the "segment"** (the channel bug's job); tabs with a 3px accent bar; and **AccountControls** [Appearance] [Profile] [Log out]. Then a **page header**: tag, `display-l` title, actions on the right. Content sits on the stage, with panels on the surface. On phones, tabs move to the drawer, and the switch stays reachable on every page (appearance-everywhere 114/114). |
| **Boards and tables** | Spec-sheet and running-order patterns. Numbers that matter are in Teko; cell numbers are Archivo with tabular figures. The active row has a 3px rule. `.stacked-table` cards below `md`. No sideways scroll anywhere, and especially not on the score sheet. |
| **Forms** | One column on phones. Group headings are tags. One saffron solid button per view; everything else is line or ghost. Destructive actions go through a danger dialog. |
| **Judge slip** (look, not mechanics) | Rows read like Home's slip: `display-s` section titles, tabular values, the 3px active rule, the total in `num-l` turning saffron at full marks. Everything in §8 items 1–6 stays: number-only text inputs, three tabs on phones, sticky Submit with nothing under it, chief-copy column, refresh keeps the slip. COP text is Archivo in its own case, verbatim. |
| **Time Keeper** | `StopwatchFace` is an untouched island; the screen around it uses the working-screen shell. |
| **Dialogs, toasts, menus** | The primitives above. |
| **Empty, loading and error states** | A tag, a short sentence and one action. No illustrations, no gradients. |

---

## 8. Protected behaviours

Treat these as the spec. Items 1–9 carry over from `RESPONSIVE_UIUX_PLAN.md` §15 and project memory; 10–17 are new for this plan.

1. **The score sheet never scrolls sideways.** It divides the width it has, and no column is dropped. Below 1024px it becomes athlete cards.
2. **The chief's copy is a display seat.** Column count is not panel size.
3. **Mark fields are number-only text inputs** (`inputMode="decimal"`), never `type="number"`, at 16px on touch.
4. **The judge slip:**
   - three tabs on phones, with the Live Final Score pinned
   - nothing under the fixed Submit bar
   - refresh keeps the slip
   - **nothing may trigger a reload**: a look or appearance change only flips an attribute
5. **COP wording is verbatim, capitals included.** No `uppercase` or `capitalize` on COP text. Stored values render through `levelLabel()`.
6. **The stopwatch:** rAF-driven SVG, plain CSS buttons, no framer, whole seconds. A dark island with Apple colours in every look.
7. **Pass-through** "Opening ‹name›…" and "Counting…" stay as they are.
8. **Public breakdown:** the panel-rule average, with no per-judge J1–J4 pills.
9. **Every device includes iPhone and Safari**, so WebKit is in every wave's matrix.
10. **Uppercase only on text we write** (D10). People's names keep their case everywhere.
11. **Teko only at 24px and above.** Never in inputs, body, COP or table cells.
12. **One saffron solid button per view.**
13. **The Light/Dark switch is on every page**, and one choice carries across the whole site.
14. **Home stays a dark island:** its 41-device audit and its visual baseline stay green through every phase.
15. **Role is never shown by colour alone.** The ident always carries its text.
16. **Working screens get no new JavaScript:** no GSAP and no three.js; the bundle guard checks it. Fonts stay within budget.
17. **Look, not mechanics.** A wave changes how screens look. A behaviour change, however tempting, needs its own commit, its own test and its own reason.

---

## 9. Phases and waves

Each phase ends at an **exit gate**. A wave switches its route group to prime-time **only** when it passes. Sizes are measured at `9814afa`.

### Phase 0: agreement and baselines (no UI change)

- 0.1 Owner reads this plan.
- 0.2 Re-record `/` in `visual-baseline` (the new Home). Record dark and light baselines for every audited route on the unchanged build. Note the void-run signature: branch, HEAD and `git diff | md5sum`.
- 0.3 `lint-baseline.json`: warning counts per rule. This is where the ratchet starts.
- 0.4 Performance baseline on the phone profile (4× CPU, fast 4G): LCP and CLS for `/player/login`, `/scores` and the judge dashboard, plus chunk sizes.

*Exit:* comparing the unchanged build against its own baseline gives 0 diff.

### Phase 1: token architecture, with **zero visual change**

- 1.1 `contract.js`, `define.js` and the generator. Add `npm run looks`; hook it into `predev` and `prebuild`.
- 1.2 Create the **`classic` pack** by moving `index.css`'s token blocks into it *verbatim*: role palettes, both appearances, data palette, derived tokens. `index.css` then imports `generated/looks.css`.
- 1.3 Point Tailwind's scales at the tokens (§4.5), with classic holding Tailwind's default values.
- 1.4 The `data-look` axis: `look.js`, `applyLook` in `AppContent`, the default set in `appearance-init.js`, `/` mapped to prime-time, the dev override.
- 1.5 The **`prime-time` pack** with dark copied from Home and light from §5. It must pass the contract test.
- 1.6 Home reads the shared tokens:
  - `.mk-home`'s local variables become aliases.
  - Rename `.cd-rb`'s local `--bg` and `--fg` to `--rb-bg` and `--rb-fg`. They shadow global token names today.
- 1.7 Tests: contract completeness, the contrast matrix, route mapping, generator drift.

*Exit:* the pixel gate (threshold 0) reports **0 diff** on every audited route in dark *and* light. Home is 41/41 with an unchanged visual baseline. vitest and lint are green.

### Phase 2: type and fonts

- 2.1 `styles/fonts.js`, metric-matched fallbacks, per-route preload for prime-time routes.
- 2.2 The type steps as utilities generated from the pack.

*Exit:* the font budget holds. CLS is 0 on login, `/scores` and the judge dashboard (still classic, so unchanged) and on Home. Classic routes show 0 diff.

### Phase 3: primitives and the specimen page

- 3.1 `components/ui/*` (§6): one CSS file each, unit tests for roles, keyboard behaviour and states.
- 3.2 Home moves onto the shared `Button`, `Tag`, `Heading` and `Sting`. Home must pass 41/41 again.
- 3.3 The **specimen page** `/__look`, in dev and preview only. It shows every primitive in every state, with toggles for look, appearance and role. It is the single page where a future restyle is judged.
- 3.4 `e2e/look-specimen.spec.js`: screenshots and the contrast audit of the specimen for prime-time × dark/light × 6 roles.
- 3.5 **Owner checkpoint:** the owner reviews specimen screenshots in both appearances before any screen is converted.

*Exit:* the specimen is contrast-clean in both appearances, and the owner has signed off.

### Phase 4: shells and the brand sweep

- 4.1 `AppHeader`, `AccountControls`, `RoleIdent`, `PageHeader`, `TabNav` with the phone drawer; the corner appearance control restyled.
- 4.2 The **brand sweep**, which applies right away on classic screens too because it is the rename itself:
  - "Mallakhamb India" replaces "Bhausaheb Ranade" on the 6 screens.
  - `PoleMark` replaces `BHA.png` on the 9.
  - A favicon (SVG plus a PNG fallback), an apple-touch-icon and `theme-color` values per look.
- 4.3 Toaster styles from tokens.

*Exit:* the brand-sweep diffs are reviewed and re-baselined; everything else shows 0 diff.

### Phase 5: the four waves

The same checklist runs for every wave:
1. Branch `look/wN-…`.
2. Fresh baselines.
3. Convert file by file: inline visuals → primitives; decorative framer → CSS; behaviour untouched.
4. Preview with `?look=prime-time`.
5. Run the gates in §10.
6. **Add the route group to `LOOK_BY_ROUTE` in the same PR.**
7. Merge, let Render deploy, and verify live in Chromium and WebKit.
8. Add an entry to the log in `docs/design-language/README.md`.

| Wave | Routes | Files / lines / inline style blocks | Special care |
|---|---|---|---|
| **W1 Public and auth** | `/scores`; every `/*/login` and `/*/register`; `/forgot-password`; `/reset-password`; 404; every `/*/select-level` and `/*/select-competition` | 18 / 6,161 / 378 | Public breakdown rule; podium stacking; pass-through states; lockout, rate-limit and OTP states; `ResponsiveRankings` (79 inline blocks) |
| **W2 Player and coach** | `/player/*`, `/coach/*`, with `Navbar` and `PerformancePanel` | 8 / 3,651 / 229 | Razorpay theme colour; the payment and fee-window flows; team selection |
| **W3 Admin and superadmin** | `/admin/*`, `/superadmin/*`: `UnifiedDashboard` and its 13 tabs, scoring, teams, add-player-payment | 15 / 8,430 / 435 | `.stacked-table` everywhere; the lots drag (`Reorder` stays); end-date lock states (423); deep-screens audit. `SuperAdminManagement` is the largest file (1,675 lines, 94 inline blocks). |
| **W4 Judge** | `/judge/*` | 11 / 7,026 / 288 | Protected behaviours 1–6. **Only on days with no live competition**, with a rehearsed kill switch. `StopwatchFace` is untouched. Audits: judge-walk, score-sheet, judge-deep-screens. Before this wave, add a TRIALS account seated as Scorer and as Time Keeper: audits have never opened those seats live. |

Shared pieces (`ConfirmDialog`, `Dropdown`, the design-system folder: 20 files, 2,827 lines) are replaced by the primitives as each wave adopts them. The old versions stay until Phase 6, because classic routes still use them.

### Phase 6: retire classic

- `DEFAULT_LOOK = 'prime-time'`. Delete the classic pack and the route-map entries. **Keep the mechanism**: it is how the next look rolls out.
- **Delete** (re-verify that each has no users first):
  - `GlassCard`, `DarkCard`, `TiltCard`, `StatCard`, the `Themed*` components, `GradientText`, `HexGrid`, `AmbientOrbs`, `ShieldOrnament`, `CoachOrnament`, `FadeIn`
  - `COMMON_STYLES.glassCard/cardBase`, `SAFFRON_CTA`, the `COLORS` and `ADMIN_COLORS` proxies, the spring easing exports
  - the global `button:hover` lift
  - Tailwind's legacy `primary` and `secondary` palettes, and any unused responsive text utilities
- Lint: `no-hardcoded-colors` and the new rules become **errors** across the repo.
- `theme-color` and the meta tags take prime-time values.

*Exit:* full regression in both appearances, on every device project, in WebKit; the performance budget holds; the final report is written to `docs/design-language/REPORT.md`.

### Phase 7: hand-over for the future

- `docs/design-language/README.md`: the rules, dos and don'ts, and specimen screenshots.
- `LOOKS.md`: the §11 playbook.
- Project memory updated.

---

## 10. Gates and tooling

**Run audits one at a time:** shared audit accounts and a 7.7 GB machine. Keep each run **under 2 hours**. Any run whose signature (branch, HEAD, diff hash) changes mid-run is void.

| Gate | Checks | When | Status |
|---|---|---|---|
| `looks.contract.test.js` | Every look × appearance defines every contract token, with the right type and no extras. `THEME_COLOR` equals `--bg`. | every commit | **new** |
| `looks.contrast.test.js` | The §4.2 pair matrix for every look × appearance × role: text, ident, status, data palette, focus ring and line-strong against every surface. Pure maths, no browser. | every commit | **new** |
| `looks.drift.test.js` | The committed `generated/looks.css` equals the generator's output. | every commit | **new** |
| `look-routing.test.js` | Each route resolves to the expected look; the override works only in dev and preview. | every commit | **new** |
| `colourHygiene.test.js` | Today's two rules, plus, in folders that have migrated: no hex values, no `backdrop-filter`/`backdropFilter`/`backdrop-blur`, no `font-family` literals, no look ids outside `styles/looks`. | every commit | extend |
| Lint ratchet (`npm run lint:ratchet`) | Warnings per rule may never rise above `lint-baseline.json`. Migrated folders run `no-hardcoded-colors` plus the new `no-inline-visual-style` and `no-pack-import` as **errors**. | CI | **new** |
| vitest (405 tests today) | everything | CI | exists |
| `visual-baseline` (threshold 0) | Routes that haven't switched: **0 diff**. Switched routes: reviewed and re-baselined. | each phase and wave | exists |
| `contrast-audit` | real backgrounds, both appearances | each wave | exists |
| `responsive-audit`, `-tablet`, `-modals`, `desktop-fold`, `edge-cases`, `focus-visible` | layout, targets, modals, focus | each wave | exists |
| `appearance-everywhere`, `appearance-persistence` | the switch on every page; one choice everywhere | each wave | exists |
| `deep-screens`, `judge-deep-screens`, `responsive-judge-walk`, `responsive-score-sheet` | screens behind state | W1/W3 (deep), W4 (judge) | exists |
| `audit:home` (41 devices) | Home is unharmed by shared-layer changes | Phases 1–3 and 6 | exists |
| `look-specimen.spec.js` | every primitive × state × appearance × role | Phase 3 onward | **new** |
| `scripts/bundle-guard.mjs` (with `build.manifest: true`) | `gsap` and `three` only in Home chunks; entry and per-route chunk size budgets | every build | **new** |
| Speed check (Playwright + CDP, as for Home) | phone-profile LCP ≤ 2.5 s, CLS 0 on login, `/scores`, judge dashboard; fonts ≤ 100 KB | Phase 2 and each wave | **new script** |

---

## 11. Playbook: changing the look later

This is the reason for the architecture. Find the kind of change, edit only the listed place, run the listed gates.

| You want to… | Edit | Then |
|---|---|---|
| Adjust a colour (a different saffron, a warmer teak) | `primitives` in the pack | `npm run looks` → contract and contrast tests → specimen → re-baseline. **Zero component edits.** |
| Retune Light or Dark only | that `appearances.*` block | the same |
| Go back to per-role accents, or make one role special | `accentPolicy`, or `roles` | the same |
| Change fonts | the pack's `type` + `styles/fonts.js` + the fallback metrics | plus the font budget and CLS check |
| Rounder corners, heavier rules, shadows back | the pack's `shape` (Tailwind follows) | the same |
| Reshape buttons, fields or tabs | the pack's `components` tokens | the same |
| Change the motion feel | the pack's `motion` | `focus-visible` and reduced motion |
| Replace a signature (grain, stinger) | `styles/looks/<id>/signatures.css` + the signature component | specimen and Home audit |
| An event skin (e.g. "Nationals 2027") | a new pack with `extends: 'prime-time'`, about 10 lines, mapped to routes or a date window | the full gate set on the specimen, then switch routes |
| **A whole new design language** | a new pack → specimen → `LOOK_BY_ROUTE` wave by wave → delete the old pack | Phase 5's checklist, as-is |
| Something tokens can't express | a new component token in `contract.js` (every pack must then define it; the contract test says where) | the contract test lists every pack that is missing it |

What must **never** be needed for a restyle: editing pages, editing Tailwind's config, or search-and-replace across `src/`. If a restyle needs one of those, a token is missing; add it to the contract.

---

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Phase 1's token move shifts pixels | The classic pack is generated from today's values verbatim. The gate is threshold-0 pixel diff in both appearances. |
| R2 | Cascade or specificity clashes between packs, islands and roles | The generator owns the selector form, and the contract test runs per block. The stopwatch-island and Home-island checks stay in the specimen spec. |
| R3 | Fonts slow the first paint on phones | The 100 KB budget, preload, metric-matched fallbacks, and the subset if needed. Tested on the phone profile. |
| R4 | Teko hurts legibility in dense data | Teko only at 24px and above. Table numbers are Archivo with tabular figures. |
| R5 | Uppercase breaks COP-verbatim text | D10 and protected behaviour 5. A unit test asserts COP-rendering components never use the `type-tag` or `display-*` steps. |
| R6 | Chalk paper fails status contrast | **Already measured**: today's success and warning shades are 4.34 and 4.35 on chalk. The -800 shades are specified, and the contrast test blocks any regression. |
| R7 | A live competition is disrupted | The judge wave goes last, on a day with no competition, with the kill switch rehearsed (a one-line revert; Render redeploys in minutes). |
| R8 | Users see half-migrated screens | Route groups switch only after their wave passes. The in-between state exists only behind the dev override. |
| R9 | framer colour animations can't read variables | They are removed (D7). Easing goes through `readEase()`. |
| R10 | Scope creep: rewriting logic while restyling | Protected behaviour 17. A behaviour diff in a wave PR is a review failure. |
| R11 | The shared checkout is switched mid-run | The void-run signature (memory). |
| R12 | Expected visual churn hides a real regression | Diffs are reviewed route by route. Routes that haven't switched must stay at **0**. |
| R13 | Saffron fill against the light page is 2.47:1 | The label identifies the control (7.36:1). The 1.4.11 checks apply to focus rings and inputs, which are ≥ 3:1. |

---

## 13. Out of scope

- Server email templates and PDF or print output.
- The Razorpay hosted checkout, beyond passing its theme colour.
- Any change to flows, routes, permissions or copy, except the brand rename (D9).
- GSAP or three.js on app screens.
- Per-competition skins: the architecture makes them possible (§11), but none is built.
- Self-hosting the Home photos as AVIF. That is a separate change, and downloading the photos needs the owner's OK.

---

## 14. Progress log

### 2026-10-07: Phase 0 and Phase 1 (branch `look/phase-1-tokens`, from `a5c7556`)

**Phase 0 (baselines)**
- 0.1: the owner asked for the work to start.
- 0.2: fresh pixel baselines for every audited route × 375/768/820/1024/1366 × dark/light, recorded against a **frozen production build** of `a5c7556` served by `vite preview` on :4174 (launch config `look-frozen`). Source edits can't reach a frozen build, so Phase 1 was written while the baselines recorded. Baselines: `D:/Mallakhamb-Repo/.mallakhamb-visual-baseline-look/` (outside the repo; the 2026-09-30 set is untouched). Runner: `.mk-look-builds/look-visual.sh <update|compare> <tag>` (one area at a time, a lock, a void-run signature of the served build and the spec files).
- **Home is not pixel-gated.** Its full-page capture never settles: the GSAP runtime flips ~27% of the pixels between two shots of the same build. Compare runs use `VISUAL_ONLY='^(?!home$)'`. Home stays covered by `npm run audit:home` (41 devices), as §8 item 14 already says.
- 0.3: `lint-baseline.json` (1,429 warnings: colours 855, spacing 490, hooks 35, unused vars 49) and `npm run lint:ratchet`. The look packs are exempt from the two design-system rules: they are the token source.
- 0.4 (performance baseline): not done yet. Needed before Phase 2.

**Phase 1 (token architecture)**
- 1.1: `src/styles/looks/{contract,define,build,color,index}.js` and `scripts/build-looks.mjs` (`npm run looks`, `looks:check`, run by `predev`/`prebuild`). Output: `src/styles/generated/looks.css` + `looks.meta.json`, committed.
- 1.2: the `classic` pack holds `index.css`'s token blocks verbatim; `index.css` now `@import`s the generated file. A one-off parse of the old `index.css` confirmed every old declaration is reproduced exactly. New tokens only: `ident`, `ident-fg`, `on-ident` (classic mirrors the role accent), and the look tokens below.
- 1.3: Tailwind's `fontFamily.sans` (+ new `display`), `borderRadius`, `boxShadow`, `backdropBlur`, `transitionTimingFunction` (+ `cut`) and `transitionDuration` (+ `press`/`hover`/`wipe`/`entrance`) read tokens; `classic` holds the old values. No coloured shadows exist in the app, so tokenised shadows lose nothing.
- 1.4: `src/utils/ui/look.js` (`LOOK_BY_ROUTE`, `applyLook`, `?look=` dev override, `currentLook`), called beside `applyRoleAccent`; `appearance-init.js` sets the default look before first paint.
- 1.5: the `prime-time` pack: dark from Home, light "chalk paper" from §5. **It passes every contrast pair with no exceptions.** One data colour re-tuned for dark teak: Combination purple `#C084FC` (classic's `#A855F7` is 4.49 on teak-2, just under 4.5); the rest keep classic's dark hexes.
- **Deviation from 1.4/1.6 (decided on the owner's behalf):** `/` is **not** mapped to prime-time yet, and Home's local variables are not yet aliases of the shared tokens. Home's masthead holds the shared `AppearanceMenu` (Tailwind `rounded-lg`, `text-ink`, …), which prime-time tokens would visibly restyle, and Phase 1's exit gate requires Home unchanged. Both move to Phase 3.2, where Home adopts the shared primitives and is re-baselined anyway. Done now: `.cd-rb`'s local `--bg`/`--fg` renamed to `--rb-bg`/`--rb-fg`.
- 1.7: `looks.contract.test.js`, `looks.contrast.test.js`, `looks.drift.test.js`, `utils/ui/look.test.js` (47 tests). `classic` lists three contrast exceptions: worst-case pairings today's design fails (4.39–4.40) that no audited screen draws. They retire with classic.
- **Evidence (Phase 1 exit gate):**
  - **Computed styles:** frozen `a5c7556` build vs the Phase 1 build, every element × 20 properties, 8 public routes × 375/1366 × dark/light: **identical**. A positive control (player vs coach login) shows the comparison does detect a difference.
  - **Pixel gate, threshold 0, every audited route except Home × 375/768/820/1024/1366 × dark/light: identical.** Coach, admin and superadmin matched on the first run. Public, judge and player needed re-captures, for reasons the unchanged build shows too (the self-check of `a5c7556` against its own baseline failed on the same screens):
    - player `select-level` / `select-competition` land on the level chooser in one capture and pass straight through to the dashboard in another (one competition at the level; the CompetitionContext auto-select race). Both states matched exactly on re-capture.
    - judge `select-level`, `select-competition` and the dashboard family differed in one run and matched exactly in the next.
    - public `reset-password` at 375 dark differed by 8 pixels, in the self-check too; it matched on re-capture.
    - One self-check superadmin run failed to sign in ("Invalid credentials" with `loginAttempts: 0`): the API briefly lost Atlas. Void, re-run clean.
  - **The gate itself is only as deterministic as the data.** Before Phase 5 relies on it, make the chooser and dashboard captures wait for a settled competition state (or pin it), so a diff means a change.
  - **Home** (not pixel-gated): `npm run audit:home` against the Phase 1 build **41/41 devices clean**, and the computed-style comparison on `/` (≈1,050 elements, 375/1366, dark/light) **identical**.
  - vitest **435/435** (48 files); `npm run looks:check` clean; `npm run lint:ratchet` holds.

### 2026-10-07 (evening): Phase 0.4, a deterministic gate, Phase 2 (branch `look/phase-2-type`, from Phase 1)

Worked in a git worktree (`D:/Mallakhamb-Repo/mk-look`) so the main checkout stays on master. Its `node_modules` must be a real install (`npm ci`), not a junction: Vite refuses to serve files resolved outside the root ("Denied ID … ?url").

**Phase 0.4: performance baseline (done).** `e2e/perf-baseline.mjs`: phone profile (390×844, 4× CPU, Fast 4G, cold cache), median of 3, against a frozen production build. Master `a5c7556`:

| Route | LCP | CLS | Fonts | JS |
|---|---|---|---|---|
| Home | 2.09–2.20 s | 0 | 137 KB | 283 KB |
| Player login | 2.48 s | 0 | 0 | 244 KB |
| /scores | 1.70–2.60 s (bimodal on the same build) | 0 | 0 | 217 KB |
| Judge dashboard | 1.39–1.80 s | **0.077–0.091** | 0 | 239 KB |

The judge dashboard already shifts on master, so its gate is "no worse", not 0. Home's 137 KB = Archivo latin 88 + Teko latin 500/600 15 + Teko Devanagari 33×2 (मल्लखांब). A lever if the budget ever bites: Archivo's weight-only latin file is **34 KB** against 88 KB with the width axis (only the 125%-wide tags need it).

**The gate is deterministic now.**
- **Cause of the chooser flake:** `e2e/support/audit-routes.js` `signInAs` asked `count()` for the lazy level chooser the instant the URL changed. When it wasn't drawn yet, no level was chosen, and later `/select-competition` captures flipped between the chooser and a pass-through. It now waits for the chooser the URL promises.
- **Runner guard:** `.mk-look-builds/look-visual.sh` reads the API log and marks an area **VOID** if any Mongo network error falls inside its window. On 2026-10-07 Atlas dropped repeatedly from 20:30 to 21:43 IST and voided a whole baseline run; that run was discarded.
- Baselines v3: `D:/Mallakhamb-Repo/.mallakhamb-visual-baseline-look-v3`, recorded clean from master's frozen build.

**Phase 2 (type and fonts)**
- 2.1:
  - `src/styles/look-fonts.js`: the @font-face rules (Archivo Variable wdth+wght, Teko 500/600) plus `fonts-fallback.css`.
  - `fonts-fallback.css`: metric-matched 'Archivo Fallback' (Arial at 98.92%) and 'Teko Fallback' (Arial at 67.49%), measured in Chromium by `npm run fonts:metrics`.
  - `src/styles/fonts.js`: `loadLookFonts(look)`, called beside `applyLook`. For prime-time it preloads the two latin first-paint files and loads the faces; for classic it does nothing.
- **Deviation from §5.4 ("loaded once, app-wide"):** the faces are a separate chunk, loaded only by what is drawn in them:
  - Home (statically, as before);
  - prime-time routes;
  - from Phase 3, the primitives.
  - Why: merely declaring them in the entry CSS changed Chrome's anti-aliasing on a classic screen (judge profile avatar corner, 3–7 px, reproducible). A bisect pinned it to the fontsource faces. Classic routes now ship master's exact entry CSS rules plus unused tokens and utilities.
- 2.2: `type-display-xl/l/m/s`, `type-num-l/m`, `type-body`, `type-body-s`, `type-caption`, `type-tag`, `type-button`, `type-input`.
  - Tailwind utilities, safelisted, reading `--type-<step>-<prop>`. Values are in `looks/type-scale.js`, written against each look's own font tokens.
  - `type-scale.test.js` enforces: display face only at 24 px and up; text ≥ 12 px, tags ≥ 11 px; inputs 16 px on touch; uppercase only on display steps and tags; tabular numbers.
- Checked live on a `VITE_LOOK_OVERRIDE=1` build: every step resolves as specified (Teko 600 uppercase display, Teko 500 tabular numbers, Archivo 700 tags at 125%) in dark and chalk-paper light.

**Phase 2 exit gate**
- **Pixel gate (threshold 0, v3 baselines): every audited route identical.** Two screens needed a closer look:
  - coach `select-competition` 1024 light: master's own build fails it identically (3527 vs 3675 px), so the baseline caught an odd state;
  - `reset-password` 375 light: 8 px once, matched on re-capture, like master.
- **Computed styles:** identical on 9 public routes and Home.
- **Speed:**
  - Classic routes still download **0 font bytes**.
  - CSS +2.4 KB transferred (the type tokens and utilities); entry chunks 211.3 → 214.2 KB gzip.
  - LCP and CLS within master's own run-to-run spread on every route; Home unchanged (137 KB fonts, CLS 0).
- vitest **450/450**; `looks:check` clean; lint ratchet holds.
- **Not yet measurable:** the 100 KB first-paint font budget on a real prime-time screen. No route is prime-time until Phase 3's specimen page; measure it there.

### 2026-10-08: Phase 3 (branch `look/phase-3-primitives`, stacked on Phase 2)

**3.1 Primitives** (`src/components/ui/`, with the guide in [README.md](README.md)):
- Button, IconButton, Field with Input/Select/Textarea/PasswordInput, Panel, Heading, Tag, StatusTag, Stat, SpecList, DataTable, Tabs/TabPanel, Segmented, Dialog, ConfirmDialog, Menu, Spinner, Skeleton, EmptyState, ErrorState, Grain, `toastOptions`.
- New component tokens in the contract: radius-control, radius-panel, rule, ring, focus-width/offset, control-h(-mouse), pad, grain-opacity, hover-lift.
  - `index.css`'s focus ring and button hover lift now read tokens; classic's values reproduce today's exactly.
- Tailwind gained `ident` colours.
- `ui.test.jsx`: 17 tests (roles, keyboard, focus trap, states).

**Defects found and fixed on the way:**
- `:where()` base rules lost to Tailwind's preflight, so primitive base rules are single classes.
- Primitive CSS in lazy chunks beat pages' layout utilities. All of it is now one `ui.css`, imported at the top of `index.css`, before Tailwind's layers.
- A loading button lost its accessible name (`visibility: hidden`), so the label is `color: transparent`.
- The phone table's `::before` labels failed contrast, and the route audit can't see pseudo text. `ui-table` restyles them; the specimen spec measures them.
- Segmented options were 40 px on touch; now 44 px.
- The dev-only specimen chunk shipped in production builds. `vite.config.js` now `define`s `VITE_LOOK_OVERRIDE`.

**3.2 Home on the shared layer.**
- `/` maps to prime-time, and Home's root carries `data-look`.
- Its colour variables are aliases of the prime-time tokens.
- Its buttons and tags are `ui-btn` / `type-tag`; its grain is `<Grain/>`.
- The stinger stays Home's own (scroll-driven by GSAP).
- Computed styles of Home's own sections are unchanged, apart from the font-stack text. What changed is intended: the masthead's Light/Dark menu now takes the prime-time style.

**3.3 / 3.4 Specimen.**
- `/__look` (dev and `VITE_LOOK_OVERRIDE=1` builds only), driven by the URL: `?look=&appearance=&role=`.
- `e2e/look-specimen.spec.js`: prime-time × dark/light × 6 roles × 375/1366, plus dialog, confirm and menu open.
  - **0 contrast failures** (2,066 text elements per appearance, `::before` labels included).
  - No sideways scroll, and every target ≥ 44 px at touch widths.
- The contrast measurement moved to `e2e/support/contrast.js`. `measurePage` no longer counts focusable containers (tab panels, dialogs) as tap targets.

**Phase 3 exit gate:**
- **Classic routes: pixel-identical to master** (threshold 0, v3 baselines, no database-error windows). The only exception is the coach chooser capture that master's own build fails identically.
- **Home:** `audit:home` 41/41.
- **Speed:**
  - **Home LCP equal to master:** median 2168 vs 2184 ms, n=10 interleaved, CLS 0.
  - Classic routes: within master's spread, CSS +5.4 KB (the primitives' rules), still 0 font bytes.
  - Prime-time specimen: LCP 1.66 s, CLS 0.
- **A regression found and removed.** Home first measured ~90 ms slower. Bisecting ruled out `ui.css`, the `/` mapping and the barrel import (which was still fixed: Home imports `ui/Stage` directly). The cause was the metric-matched fallback faces in the font stacks: listing them cost ~80–90 ms before first render, and neither a single `local()` source nor `font-display: swap` helped. They were removed from the stacks; `npm run fonts:metrics` remains as a lever.
- **Font budget: 104.4 KB** on a prime-time page using every type step (Archivo 88 + Teko 500/600). That is over the §5.4 estimate, which counted only Teko 600. Speed is within budget, so this is accepted for now. The lever is Archivo's weight-only file (−54 KB, losing the 125% width on tags).
- vitest 467/467; lint ratchet holds; `looks:check` clean.

**3.5 Owner checkpoint.** The specimen screenshots are in [README.md](README.md), and every combination is at `/__look`. The owner asked to continue through the phases, so Phase 4 goes ahead. Any change asked for at this checkpoint is a pack or primitive edit, which the waves inherit.

### 2026-10-10: Phase 4 (branch `look/phase-4-shells`, stacked on Phase 3)

**4.1 Shells** (`src/components/shell/`):
- `AppHeader`: wordmark, `RoleIdent`, the competition as the "segment", `TabNav` from `lg`, `AccountControls` from `md`. Below those, one menu button opens a `Dialog sheet` drawer with the tabs and the account cluster, so the Light/Dark switch is reachable everywhere. Below 480 px the wordmark collapses to the mark, keeping its name for screen readers.
- `PageHeader`: the page's h1.
- Built and audited now; each rollout wave adopts them.
- `shell.test.jsx`: 8 tests.

**Defect found and fixed.** On phones, the account cluster sat on top of the wordmark and ident. The component had Tailwind's `flex` on its own root, and utilities beat the shell's breakpoint rules (which is the design). Rule: a component never puts a layout utility on its own root. `look-specimen.spec.js` now fails on masthead overlap or overflow; a positive control on the broken build confirmed it catches this.

**4.2 Brand sweep.**
- "Mallakhamb India" and `PoleMark` replace "Bhausaheb Ranade" (6 screens) and `BHA.png` (9 screens); the 3.9 MB `BHA.png` is deleted.
- The password pages' two-line "Bhausaheb Ranade / Mallakhamb Competition" lockup becomes "Mallakhamb India".
- `favicon.svg`, `favicon-32.png` and `apple-touch-icon.png` (the saffron mark on stage black) replace `vite.svg`.
- `theme-color` follows the look: `THEME_COLOR_BY_LOOK` is built from `looks.meta.json`, and `syncThemeColor()` runs on appearance and look changes.

**4.3 Toasts.** App's `<Toaster>` uses the token-driven `toastOptions` on prime-time routes. Classic routes keep the old literal options (deleted in Phase 6).

**Phase 4 exit gate:**
- **Pixel gate (threshold 0, v3 baselines).** Judge identical; coach identical apart from the known baseline capture. Every other difference was reviewed by measuring the bounding box of the changed pixels in each screenshot (`.mk-look-builds/diff-boxes.cjs`):
  - logins, registers, forgot/reset and team selection: only the brand lockup (2.2–4.2k px), no height change;
  - admin and superadmin dashboard tabs and scoring: only the header row (y14–49). The narrower pole mark shifts the title and tabs left;
  - one `superadmin-scoring` capture also caught "Loading competitions…", a timing state unrelated to Phase 4.
  - A public-area run voided by one database error was re-run clean.
- **New baselines** were recorded from the Phase 4 build as the reference for Phase 5: `D:/Mallakhamb-Repo/.mallakhamb-visual-baseline-look-v4`.
- **Specimen:** 0 failures (contrast, overflow, 44 px targets, masthead overlap), all roles, both appearances.
- **Speed:** within master's spread on every route; classic routes still 0 font bytes; CSS +6 KB.
- vitest **476/476**; lint ratchet holds; `looks:check` clean.

### 2026-10-10: W1, public and auth (branch `look/w1-public-auth`, commit `e1a8741`)

- `AuthLayout` (shell): the split sign-in layout — the black stage side (`data-appearance="dark"` island: role ident, the role name in Teko with the stinger, pole mark, grain, the portal row on sign-in pages) and the form side (one saffron submit, underlined `TextLink`s, `Notice` errors). Login, register, admin register, forgot and reset use it.
- The choosers are running orders (`RunningOrder`); "Opening ‹name›…" and "Counting…" are unchanged.
- `/scores` is a results graphic: medal colours on the rank and the podium's 3px rule, totals in the display face, the panel-rule average as ruled values. The board is shared with the admin scores page.
- The 404 claims its look (`claimLook`): no path can name it.
- Every id, heading and accessible name the e2e and seed flows read was kept (checked against `e2e/support`).
- **Gate:** pixel gate vs v4 — every difference is on a W1 route or on the admin/superadmin scores tabs (the shared board and filters, expected); one 7 px antialiasing change on the judge-profile avatar glyph (re-run alone: the same 7 px, a screen W4 rewrites). Specimen and unit tests green.

### 2026-10-10: W2, player and coach (branch `look/w2-player-coach`, commit `65ede8f`)

- The Navbar is the shared `AppHeader` (`fixed`, the picker in `extra`); the Light/Dark switch stays in the bar at every width.
- Player dashboard, team selection, coach dashboard (squad, summary, add-player and submit dialogs), create team and payment rebuilt on the primitives. Razorpay's theme reads `looks.meta.json`.
- Shared widgets restyled once: `Dropdown`, `CompetitionSelector`, `CompetitionDisplay`, the lock banner, `PerformancePanel`.

### 2026-10-10: W3, admin and superadmin (branch `look/w3-admin`, commit `87140ac`)

- `UnifiedDashboard`'s masthead is `AppHeader` with the tabs as links (from `xl`), `AdminKit` is drawn by the primitives, the old `ConfirmDialog` API wraps the primitive.
- Inline tints, pills, scrims and gradient fills became token classes, and decorative framer was removed, by three reviewed codemods (`.mk-look-builds/scratch/w1/codemod_*.py`).

### 2026-10-10: W4, judge (branch `look/w4-judge`, commit `b11c725`)

- The judge colour set `J` and every fill read tokens; ambient orbs gone; `LiveDot` a status tag; decorative framer removed. `StopwatchFace` untouched. All 176 judge unit tests pass unchanged.
- **Not done in this wave, deliberately:** the judge headers and the slip's row anatomy keep their structure (token colours only). See REPORT.md.

### 2026-10-11: Phase 6, retire classic (branch `look/phase-6-retire-classic`, commit `5425d98` + `59a0266`)

- `DEFAULT_LOOK = 'prime-time'`; the classic pack deleted; `LOOK_BY_ROUTE` empty (mechanism kept); theme-color and `appearance-init.js` paint prime-time.
- `components/design-system/` deleted except `LiveRegion`; the judge profile rebuilt on the primitives; the global hover lift and Tailwind's legacy palettes deleted.
- `no-hardcoded-colors` is an error in every folder at zero.
- **Audits on the W4 build** (before Phase 6): specimen 2/2, contrast-audit 6/6, appearance-everywhere 1/1, focus-visible 6/6, responsive-audit 6/6 (only Home's two footer links, untouched), score sheet 2/2, judge walk 1/1, judge deep screens 1/1. deep-screens failed once: the mark-only wordmark was a 13 px-wide link at 768 on admin tabs — fixed (`59a0266`).

### 2026-10-11: final verification (twice)

- **Pass 1** (Phase 6 build `59a0266`): all 12 browser audits green, Home 41/41, the pixel reference recorded (`.mallakhamb-visual-baseline-look-v5`).
- **Review by eye** of the recorded screens found three things the audits do not check: the old judge purple in labels and borders, old-sans section headings, and stretched tags. Fixed in `a79c8cb`.
- **Pass 2** (final build `a79c8cb`): all 12 audits green, Home 41/41, the reference re-recorded. A third, compare-only run reproduced it with 0 differences.
- **Speed:** login 1632 ms, `/scores` 1620 ms, judge dashboard 1472 ms LCP; fonts 96.7 KB; CLS ≤ 0.032. See REPORT.md.

### 2026-10-11: Phase 7, hand-over

- [LOOKS.md](LOOKS.md): the playbook (§11) as a working guide, the gates, the wave checklist, the traps.
- [REPORT.md](REPORT.md): what changed, the verification, what is left.
- README updated for the new primitives; Web/MEMORY (05, 07, GOTCHAS) and project memory updated.
