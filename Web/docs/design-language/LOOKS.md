# Looks: how to change the way the site looks

The playbook for the next restyle (design-language PLAN §11). Read [README.md](README.md) first for how a screen is built; this file is about changing the look of every screen at once.

## How a look works

A **look** is a set of design tokens: colours for both appearances, the role idents, type, shape, motion and a few component measures. It lives in one file, `src/styles/looks/<id>.js`, written with `defineLook()`.

`npm run looks` turns every pack into `src/styles/generated/looks.css` (custom properties on `html[data-look="<id>"]`) and `looks.meta.json` (the page colours for `theme-color` and Razorpay). Both are committed; `looks.drift.test.js` fails if they are stale.

Components never name a look. Primitives (`src/components/ui`), the shell and pages read the custom properties, through the primitives' CSS and Tailwind's scales. That is why a restyle is a pack edit.

Three attributes on `<html>` decide every value:

| Attribute | Set by | Values |
|---|---|---|
| `data-look` | `applyLook()` in App, from `LOOK_BY_ROUTE`, else `DEFAULT_LOOK` | `prime-time` today |
| `data-appearance` | the Light/Dark control (`AppearanceProvider`) | `dark` · `light` |
| `data-role` | the URL (`applyRoleAccent`) | `player` · `coach` · `judge` · `admin` · `superadmin` |

A change to any of them only flips an attribute. Nothing remounts or reloads, so a judge mid-slip keeps every mark.

## The playbook

Find the change, edit only the listed place, run the listed gates.

| You want to… | Edit | Then |
|---|---|---|
| Adjust a colour | `primitives` in the pack | `npm run looks`, then the tests below |
| Retune Light or Dark only | that `appearances.*` block | the same |
| Make one role special | `roles` in the pack | the same |
| Change fonts | the pack's font tokens, `src/styles/fonts.js` and `look-fonts.js` | plus the font budget and the phone LCP check |
| Rounder corners, heavier rules | the pack's shape tokens (Tailwind follows) | the same |
| Reshape buttons, fields or tabs | the pack's component tokens (`control-h`, `ring`, `rule`, `radius-control`…) | the same |
| Change the motion feel | the pack's motion tokens | plus `focus-visible` and reduced motion |
| An event skin ("Nationals 2027") | a new pack with `extends: 'prime-time'`, a few lines, mapped in `LOOK_BY_ROUTE` | the full gate set on the specimen, then switch routes |
| **A whole new design language** | a new pack, then `LOOK_BY_ROUTE` route group by route group, then delete the old pack | the wave checklist below |
| Something no token expresses | add a token to `src/styles/looks/contract.js` | the contract test lists every pack that is missing it |

A restyle must never need page edits, Tailwind config edits, or search-and-replace across `src/`. If it does, a token is missing: add it to the contract.

## Gates for any look change

```bash
npm run looks
```

```bash
npx vitest run src/styles
```

`looks.contract.test.js` (every look defines every token), `looks.contrast.test.js` (every text pair ≥ 4.5:1, or 3:1 large, on every surface, both appearances, every role), `looks.drift.test.js` (the generated files are current), `type-scale.test.js`.

Then on a preview build (`VITE_LOOK_OVERRIDE=1 npm run build`, served on :4175):

```bash
E2E_BASE_URL=http://localhost:4175 npx playwright test e2e/look-specimen.spec.js --project=chromium
```

The specimen at `/__look?look=<id>&appearance=light&role=judge` is the one page a restyle is judged on: every primitive in every state.

Before a look reaches users, the browser audits on real screens, one at a time (shared audit accounts): `contrast-audit`, `appearance-everywhere`, `focus-visible`, `responsive-audit`, `deep-screens`, `responsive-score-sheet`, `responsive-judge-walk`, `judge-deep-screens`, and the pixel gate (`visual-baseline`, threshold 0) for routes that should not move.

## Rolling out a new look (the wave checklist)

How prime-time replaced classic (PLAN §9, the progress log in §14):

1. Write the pack; pass the contract and contrast tests; review the specimen in both appearances.
2. Keep the current look as `DEFAULT_LOOK`. Add the new look's first route group to `LOOK_BY_ROUTE` only when that group's screens pass every gate.
3. Go group by group: public and auth, then player and coach, then admin, then judge. **The judge group only on a day with no live competition**: its kill switch is deleting its `LOOK_BY_ROUTE` line and redeploying.
4. Shared components either read tokens (and change for every screen at once — say so in the commit) or wait for the wave that owns them.
5. When every group has moved: make the new look the default, empty `LOOK_BY_ROUTE`, delete the old pack, run every gate once more.

`?look=<id>` previews a look in one browser tab, in dev and in `VITE_LOOK_OVERRIDE=1` builds only; `?look=off` clears it. It never works in the deployed build.

A screen no path can name (the 404) claims its look with `claimLook(pathname, look)` while it is mounted.

## Traps we hit

- **Cascade order.** `components/ui/ui.css` is imported at the top of `index.css`, before Tailwind's layers. Never import a primitive's CSS from its component: a lazy chunk lands after the utilities and wins their ties.
- **A utility on a component's own root** beats the component's breakpoint rules. Give the root its own class.
- **`@font-face` in the entry** moved pixels on screens that never draw the font. Fonts load with what draws them (`loadLookFonts`).
- **Metric-matched fallback faces** cost ~90 ms of phone LCP; they are not used.
- **Stored values** (names, competition and team names) keep their own case: use `Heading asIs`, `PageHeader asIs`, or the running order's titles, never a display step's uppercase.
- **e2e and the seed chains** find controls by id, heading and accessible name. Keep every one when restyling; `grep -rn "getByRole\|locator('#" e2e/` before renaming anything.
