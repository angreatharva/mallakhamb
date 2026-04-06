# Lighthouse Audit Plan - Pages Folder Refactoring

## Overview

This document outlines the comprehensive Lighthouse audit plan for the pages folder refactoring project. The goal is to verify that the refactored pages meet performance and accessibility targets.

## Performance Targets

- **Performance Score**: 90+
- **Accessibility Score**: 95+
- **Best Practices Score**: 90+
- **SEO Score**: 90+

## Pages to Audit

### Public Pages
1. **Home Page** (`/`)
   - Baseline: Pre-refactoring score
   - Refactored: Post-refactoring score
   - Key metrics: FCP, LCP, TBT, CLS

2. **Public Scores** (`/scores`)
   - Baseline: Pre-refactoring score
   - Refactored: Post-refactoring score
   - Key metrics: FCP, LCP, TBT, CLS

### Authentication Pages (Unified Components)
3. **Coach Login** (`/coach/login`)
   - Uses: UnifiedLogin component
   - Key metrics: FCP, LCP, TBT, CLS
   - Accessibility: Form labels, ARIA attributes, keyboard navigation

4. **Player Login** (`/player/login`)
   - Uses: UnifiedLogin component
   - Key metrics: FCP, LCP, TBT, CLS
   - Accessibility: Form labels, ARIA attributes, keyboard navigation

5. **Admin Login** (`/admin/login`)
   - Uses: UnifiedLogin component
   - Key metrics: FCP, LCP, TBT, CLS
   - Accessibility: Form labels, ARIA attributes, keyboard navigation

6. **Judge Login** (`/judge/login`)
   - Uses: UnifiedLogin component
   - Key metrics: FCP, LCP, TBT, CLS
   - Accessibility: Form labels, ARIA attributes, keyboard navigation

7. **SuperAdmin Login** (`/superadmin/login`)
   - Uses: UnifiedLogin component
   - Key metrics: FCP, LCP, TBT, CLS
   - Accessibility: Form labels, ARIA attributes, keyboard navigation

8. **Coach Register** (`/coach/register`)
   - Uses: UnifiedRegister component
   - Key metrics: FCP, LCP, TBT, CLS
   - Accessibility: Form labels, ARIA attributes, keyboard navigation

9. **Player Register** (`/player/register`)
   - Uses: UnifiedRegister component
   - Key metrics: FCP, LCP, TBT, CLS
   - Accessibility: Form labels, ARIA attributes, keyboard navigation

### Protected Pages (Require Authentication)
10. **Coach Dashboard** (`/coach/dashboard`)
    - Key metrics: FCP, LCP, TBT, CLS
    - Accessibility: Navigation, interactive elements

11. **Player Dashboard** (`/player/dashboard`)
    - Key metrics: FCP, LCP, TBT, CLS
    - Accessibility: Navigation, interactive elements

12. **Admin Dashboard** (`/admin/dashboard`)
    - Uses: UnifiedDashboard component
    - Key metrics: FCP, LCP, TBT, CLS
    - Accessibility: Navigation, interactive elements, data tables

13. **SuperAdmin Dashboard** (`/superadmin/dashboard`)
    - Uses: UnifiedDashboard component
    - Key metrics: FCP, LCP, TBT, CLS
    - Accessibility: Navigation, interactive elements, data tables

14. **Coach Competition Selection** (`/coach/select-competition`)
    - Uses: UnifiedCompetitionSelection component
    - Key metrics: FCP, LCP, TBT, CLS
    - Accessibility: Card selection, keyboard navigation

15. **Player Team Selection** (`/player/select-team`)
    - Uses: UnifiedCompetitionSelection component
    - Key metrics: FCP, LCP, TBT, CLS
    - Accessibility: Card selection, keyboard navigation

## Audit Procedure

### Step 1: Setup Environment

1. **Build Production Bundle**
   ```bash
   cd Web
   npm run build
   ```

2. **Start Production Preview Server**
   ```bash
   npm run preview
   ```
   - Server will run on `http://localhost:4173`

3. **Install Lighthouse CLI** (if not already installed)
   ```bash
   npm install -g lighthouse
   ```

### Step 2: Run Lighthouse Audits

#### For Public Pages (No Authentication Required)

Run Lighthouse from command line:

```bash
# Home Page
lighthouse http://localhost:4173/ \
  --output html \
  --output-path ./lighthouse-reports/home-page.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo

# Public Scores
lighthouse http://localhost:4173/scores \
  --output html \
  --output-path ./lighthouse-reports/public-scores.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo
```

#### For Login Pages (No Authentication Required)

```bash
# Coach Login
lighthouse http://localhost:4173/coach/login \
  --output html \
  --output-path ./lighthouse-reports/coach-login.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo

# Player Login
lighthouse http://localhost:4173/player/login \
  --output html \
  --output-path ./lighthouse-reports/player-login.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo

# Admin Login
lighthouse http://localhost:4173/admin/login \
  --output html \
  --output-path ./lighthouse-reports/admin-login.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo

# Judge Login
lighthouse http://localhost:4173/judge/login \
  --output html \
  --output-path ./lighthouse-reports/judge-login.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo

# SuperAdmin Login
lighthouse http://localhost:4173/superadmin/login \
  --output html \
  --output-path ./lighthouse-reports/superadmin-login.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo

# Coach Register
lighthouse http://localhost:4173/coach/register \
  --output html \
  --output-path ./lighthouse-reports/coach-register.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo

# Player Register
lighthouse http://localhost:4173/player/register \
  --output html \
  --output-path ./lighthouse-reports/player-register.html \
  --chrome-flags="--headless" \
  --only-categories=performance,accessibility,best-practices,seo
```

#### For Protected Pages (Require Authentication)

**Option 1: Using Chrome DevTools (Recommended for Protected Pages)**

1. Open Chrome browser
2. Navigate to the page (after logging in)
3. Open DevTools (F12)
4. Go to "Lighthouse" tab
5. Select categories: Performance, Accessibility, Best Practices, SEO
6. Select "Desktop" or "Mobile" device
7. Click "Analyze page load"
8. Save report as HTML

**Option 2: Using Puppeteer Script with Authentication**

Create a script `lighthouse-auth.js`:

```javascript
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');
const puppeteer = require('puppeteer');

async function runLighthouseWithAuth(url, authToken, outputPath) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  // Set authentication token
  await page.evaluateOnNewDocument((token) => {
    localStorage.setItem('coach_token', token);
  }, authToken);
  
  await page.goto(url);
  await browser.close();
  
  // Run Lighthouse
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const options = {
    logLevel: 'info',
    output: 'html',
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    port: chrome.port,
  };
  
  const runnerResult = await lighthouse(url, options);
  
  // Save report
  const fs = require('fs');
  fs.writeFileSync(outputPath, runnerResult.report);
  
  await chrome.kill();
}

// Example usage
runLighthouseWithAuth(
  'http://localhost:4173/coach/dashboard',
  'YOUR_AUTH_TOKEN_HERE',
  './lighthouse-reports/coach-dashboard.html'
);
```

### Step 3: Analyze Results

For each page, record the following metrics:

#### Performance Metrics
- **First Contentful Paint (FCP)**: Time when first content is painted
  - Target: < 1.8s
- **Largest Contentful Paint (LCP)**: Time when largest content is painted
  - Target: < 2.5s
- **Total Blocking Time (TBT)**: Time when main thread is blocked
  - Target: < 200ms
- **Cumulative Layout Shift (CLS)**: Visual stability
  - Target: < 0.1
- **Speed Index**: How quickly content is visually displayed
  - Target: < 3.4s

#### Accessibility Metrics
- **ARIA attributes**: Proper usage of ARIA labels and roles
- **Color contrast**: WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)
- **Form labels**: All form inputs have associated labels
- **Keyboard navigation**: All interactive elements are keyboard accessible
- **Focus indicators**: Visible focus indicators for all interactive elements
- **Alt text**: All images have descriptive alt text
- **Heading hierarchy**: Proper heading structure (h1, h2, h3, etc.)

### Step 4: Document Findings

Create a comparison table for each page:

| Page | Metric | Baseline | Refactored | Change | Target Met? |
|------|--------|----------|------------|--------|-------------|
| Home | Performance | XX | XX | +/-XX | ✓/✗ |
| Home | Accessibility | XX | XX | +/-XX | ✓/✗ |
| Coach Login | Performance | XX | XX | +/-XX | ✓/✗ |
| Coach Login | Accessibility | XX | XX | +/-XX | ✓/✗ |
| ... | ... | ... | ... | ... | ... |

### Step 5: Address Issues

If any page fails to meet targets:

1. **Performance Issues**
   - Check bundle size (see Task 11.2)
   - Verify lazy loading (see Task 11.3)
   - Check for unnecessary re-renders (see Task 11.4)
   - Optimize images and assets
   - Review third-party scripts

2. **Accessibility Issues**
   - Fix ARIA attribute errors
   - Improve color contrast
   - Add missing form labels
   - Fix keyboard navigation issues
   - Add missing alt text
   - Fix heading hierarchy

## Key Metrics to Monitor

### Performance
- **Bundle Size**: Should be reduced by 30%+ for pages code
- **Load Time**: Should be < 2 seconds
- **Time to Interactive (TTI)**: Should be < 3.8 seconds
- **First Input Delay (FID)**: Should be < 100ms

### Accessibility
- **WCAG AA Compliance**: All pages should meet WCAG AA standards
- **Keyboard Navigation**: All interactive elements should be keyboard accessible
- **Screen Reader Compatibility**: All content should be accessible to screen readers
- **Touch Targets**: All interactive elements should be at least 44px × 44px

## Expected Improvements

Based on the refactoring:

1. **Unified Components**: Reduced code duplication should improve bundle size
2. **Lazy Loading**: All routes use React.lazy, improving initial load time
3. **Design System Integration**: Consistent components should improve accessibility
4. **Modern React Patterns**: React.memo and useMemo should reduce re-renders
5. **Code Splitting**: Manual chunks should optimize bundle loading

## Reporting

After completing all audits, create a summary report:

### Summary Report Template

```markdown
# Lighthouse Audit Summary - Pages Folder Refactoring

## Overall Results

- **Total Pages Audited**: XX
- **Pages Meeting Performance Target (90+)**: XX/XX
- **Pages Meeting Accessibility Target (95+)**: XX/XX
- **Average Performance Score**: XX
- **Average Accessibility Score**: XX

## Key Findings

### Performance
- Average FCP: XX ms
- Average LCP: XX ms
- Average TBT: XX ms
- Average CLS: XX

### Accessibility
- Pages with WCAG AA compliance: XX/XX
- Pages with keyboard navigation issues: XX
- Pages with color contrast issues: XX

## Recommendations

1. [List any recommendations for further improvements]
2. [...]

## Conclusion

[Summary of whether the refactoring met the performance and accessibility targets]
```

## Tools Required

- **Lighthouse CLI**: `npm install -g lighthouse`
- **Chrome Browser**: For DevTools Lighthouse
- **Puppeteer** (optional): For automated audits with authentication
- **Chrome Launcher** (optional): For programmatic Lighthouse runs

## Notes

- Run audits in incognito mode to avoid browser extensions affecting results
- Run multiple audits and average the results for consistency
- Ensure the server is running in production mode (`npm run preview`)
- Clear browser cache between audits
- Use the same network conditions for baseline and refactored audits
- Document any environmental factors that might affect results (CPU throttling, network throttling, etc.)

## Validation Checklist

- [ ] All public pages audited
- [ ] All login pages audited
- [ ] All register pages audited
- [ ] All protected pages audited
- [ ] Performance scores documented
- [ ] Accessibility scores documented
- [ ] Baseline vs refactored comparison completed
- [ ] Issues identified and documented
- [ ] Recommendations provided
- [ ] Summary report created

## Requirements Validated

- **Requirement 11.8**: Lighthouse performance score 90+, accessibility score 95+
