# Visual Regression Testing (Playwright)

This project uses Playwright snapshot assertions for visual regression checks on critical pages:

- `login.spec.js`
- `dashboard.spec.js`
- `scoring.spec.js`

## Viewports

Visual projects run at fixed widths:

- Mobile: `375x812` (`visual-mobile`)
- Tablet: `768x1024` (`visual-tablet`)
- Desktop: `1920x1080` (`visual-desktop`)

## Baseline storage

Baseline snapshots are stored under:

- `tests/visual/__screenshots__/`

Playwright automatically compares current screenshots with baseline images and creates diff artifacts on mismatch.

## Commands

Run visual regression tests:

```bash
npx playwright test tests/visual
```

Create or update baselines after intentional UI changes:

```bash
npx playwright test tests/visual --update-snapshots
```

## Review workflow

1. Run visual tests locally.
2. If failures occur, inspect generated expected/actual/diff images in Playwright output.
3. If the UI change is intentional, re-run with `--update-snapshots`.
4. Commit updated baseline images with the related UI change.
