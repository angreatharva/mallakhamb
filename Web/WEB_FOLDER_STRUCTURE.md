# Web Frontend - Folder Structure & Overview

## Project Summary

**Mallakhamb India Web Application** is a comprehensive React + Vite-based frontend for managing:
- Player competitions and scoring
- Coach team management
- Judge scoring administration
- Admin/SuperAdmin analytics dashboards

**Status**: ✅ All 665 unit/integration tests passing | ✅ 13/13 a11y tests | ✅ 7/7 E2E tests | ✅ 9/9 visual tests

---

## Root Directory Structure

```
Web/
├── public/                    # Static assets served as-is
│   ├── icons/               # PWA app icons (192x192, 512x512)
│   ├── manifest.json        # PWA manifest configuration
│   ├── _headers            # Security headers for Render deployment
│   └── _redirects          # URL redirect rules
│
├── src/                      # Application source code
│   ├── main.jsx            # App entry point (environment validation, SW registration, Web Vitals)
│   ├── App.jsx             # Root component with routing setup
│   ├── index.css           # Global styles + CSS custom properties
│   ├── App.css             # App-specific styles
│   │
│   ├── components/         # React components (organized by feature/type)
│   ├── config/             # Configuration files (env validation, PWA, schemas)
│   ├── constants/          # Application constants and enums
│   ├── contexts/           # React Context providers
│   ├── hooks/              # Custom React hooks (queries, mutations, utilities)
│   ├── pages/              # Page components and route layouts
│   ├── services/           # API services and interceptors
│   ├── styles/             # Global styles and design tokens
│   ├── test/               # Shared test utilities and test data
│   └── utils/              # Utility functions (PWA, metrics, validation, etc.)
│
├── tests/                   # Test suites
│   ├── e2e/                # End-to-end Playwright tests
│   └── visual/             # Visual regression Playwright tests
│
├── .storybook/             # Storybook configuration for component docs
│
├── eslint-rules/           # Custom ESLint rules
│   ├── no-hardcoded-colors.js
│   └── no-hardcoded-spacing.js
│
├── .husky/                 # Git hooks (pre-commit linting)
├── .prettierrc             # Code formatter configuration
├── .prettierignore         # Prettier ignore patterns
├── eslint.config.js        # ESLint configuration
├── vite.config.js          # Vite build configuration (PWA plugin, bundle analyzer)
├── tailwind.config.js      # Tailwind CSS configuration
├── postcss.config.js       # PostCSS configuration (autoprefixer)
├── playwright.config.js    # Playwright E2E testing configuration
│
├── package.json            # Dependencies and npm scripts
├── package-lock.json       # Dependency lock file
│
├── index.html              # HTML entry point (PWA manifest link, app mount)
│
├── .env.example            # Example environment variables
├── .env                    # Local environment variables (gitignored)
│
├── WEB_DOCUMENTATION.md    # Comprehensive feature documentation
└── WEB_FOLDER_STRUCTURE.md # This file
```

---

## Source Code Organization (src/)

### `/src/components` - React Components

**Design System** (`design-system/`)
- Reusable UI building blocks with consistent theming
- Cards, buttons, forms, backgrounds, animations, ornaments
- Accessibility compliance (WCAG 2.1 AA level)
- Responsive design patterns
- Theme provider with light/dark mode support

**Page Components** (`pages/`)
- Full-page layouts for login, registration, dashboard, scoring, team management
- Route-specific logic and data fetching
- Role-based views (Player/Coach/Judge/Admin/SuperAdmin)

**Feature Components** (Other directories)
- Specialized components for specific features
- E.g., CompetitionDisplay, ScoreCard, TeamManager

### `/src/config` - Configuration

| File | Purpose |
|------|---------|
| `envSchema.js` | Zod-based environment variable validation |
| `envSchema.test.js` | Environment validation tests |
| `pwa.js` | PWA plugin configuration helpers |
| `pwa.test.js` | PWA configuration tests |

**Key Features:**
- Validates required variables (`VITE_API_URL`)
- Optional feature flags: PWA, i18n, Analytics, Sentry
- Type-safe configuration with descriptive error messages

### `/src/constants` - Application Constants

- User roles and permission levels
- API endpoints
- Theme colors and spacing values
- Form validation rules
- Competition and scoring rules

### `/src/contexts` - React Context Providers

- Theme context (light/dark mode)
- Auth context (user session, permissions)
- Competition context (selected competition state)
- Any other global state providers

### `/src/hooks` - Custom React Hooks

**Query Hooks** (`queries/`)
- `useTeamsQuery()` - Fetch teams with React Query caching
- `usePlayersQuery()` - Fetch players
- `useScoresQuery()` - Fetch scores
- `useProfileQuery()` - Fetch user profile

**Mutation Hooks** (`mutations/`)
- `useCreateTeamMutation()` - Create team with optimistic update
- `useUpdateScoreMutation()` - Update score with optimistic update
- `useLoginMutation()` - Authenticate user

**Utility Hooks**
- `useTheme()` - Access theme context
- `useReducedMotion()` - Detect prefers-reduced-motion
- Custom form and validation hooks

### `/src/pages` - Page Components

**Unified Pages** (`unified/`)
- `UnifiedCompetitionSelection.jsx` - Role-based competition selection
- `UnifiedDashboard.jsx` - Multi-role dashboard (Admin/SuperAdmin/Coach/Judge)
- `UnifiedRegister.jsx` - Shared registration component

**Role-Specific Pages**
- `/player/*` - Player registration, team selection, scoring
- `/coach/*` - Coach registration, team creation, player management
- `/judge/*` - Judge scoring interface
- `/admin/*` - Admin dashboard and management

### `/src/services` - API & External Services

| Service | Purpose |
|---------|---------|
| `api.js` | Axios instance with base config |
| `apiInterceptor.js` | Request/response interceptors with retry logic |
| `retryLogic.js` | Exponential backoff retry strategy |
| Auth API | Player/Coach login/register endpoints |
| Team API | Team CRUD operations |
| Scoring API | Judge score submission endpoints |
| Admin API | Admin dashboard data endpoints |

**Features:**
- Automatic retry with exponential backoff (5xx errors)
- Request timing metadata collection
- Error logging with structured format
- Request cancellation support

### `/src/styles` - Global Styles

| File | Purpose |
|------|---------|
| `index.css` | Global CSS + custom properties |
| `tokens.js` | Design tokens (colors, spacing, typography) |
| `backward-compatibility.js` | Deprecated token exports for migration |
| `deprecation.test.js` | Deprecated token usage warnings |
| `tokens.test.js` | Design token validation tests |

**Design Tokens Structure:**
- Brand colors (primary, secondary, accent)
- Role-based colors (admin, coach, judge, player)
- Semantic colors (success, error, warning, info)
- Spacing scale (4px base unit)
- Typography (font sizes, weights, line heights)
- Border radius, shadows, transitions

### `/src/utils` - Utility Functions

| Utility | Purpose |
|---------|---------|
| `webVitals.js` | Web performance metrics collection (LCP, FID, CLS) |
| `registerSW.js` | Service worker lifecycle management |
| `retryLogic.js` | Exponential backoff calculation |
| `tokenUtils.js` | JWT token parsing and validation |
| `sanitization.js` | HTML/XSS sanitization |
| `validation.js` | Form and data validation helpers |
| `logger.js` | Structured logging utility |
| `pagination.js` | Pagination helpers |
| `queryClient.js` | TanStack Query configuration |

### `/src/test` - Shared Test Utilities

| File | Purpose |
|------|---------|
| `setup.js` | Test environment configuration |
| `mocks.js` | Shared mock data and MSW handlers |
| `a11y-utils.js` | Accessibility testing utilities |
| `testHelpers.js` | Common test helper functions |
| `aria-contrast-validation.test.jsx` | ARIA and color contrast validation |

---

## Testing Infrastructure

### Unit & Integration Tests (Vitest)

**Test Files**: 42 test files with **665 passing tests**

**Coverage Areas:**
- Design system components (colors, spacing, responsive, accessibility)
- Utilities (Web Vitals, retry logic, service worker)
- Hooks (React Query, theme, pagination)
- Pages (auth, dashboard, competition selection)
- Configuration (environment validation, PWA)
- Quality (ESLint rules, style consistency)

**Run Tests:**
```bash
npm run test                    # Watch mode
npm run test:run              # Single run (CI mode)
npx vitest run --coverage     # With coverage report
```

### Accessibility Tests (Vitest + axe-core)

**Test Files:** 4 test files with **13 tests**
- Design system components a11y compliance
- Keyboard navigation (Tab, Shift+Tab, Escape, Enter)
- Screen reader announcements
- ARIA attribute validation
- Color contrast ratios
- Page-level axe checks

**Run Tests:**
```bash
npm run test:a11y
```

### E2E Tests (Playwright)

**Test Files:** 3 test files with **7 core tests** × 3 browsers (Chromium, Firefox, WebKit)
- **auth.spec.js**: Player/Coach/Judge login & registration (5 tests)
- **scoring.spec.js**: Judge score submission (1 test)
- **teams.spec.js**: Coach team creation (1 test)

**Run Tests:**
```bash
npm run test:e2e                           # All browsers, headless
npm run test:e2e -- --project=chromium    # Chromium only
npm run test:e2e -- --ui                  # Interactive UI mode
npm run test:e2e -- --debug               # With debug logging
```

### Visual Regression Tests (Playwright)

**Test Files:** 3 test files with **9 tests** across 3 viewports (mobile/tablet/desktop)
- **login.spec.js**: Login page (3 viewports)
- **dashboard.spec.js**: Dashboard page (3 viewports)
- **scoring.spec.js**: Scoring page (3 viewports)

**Baselines Location:** `tests/visual/__screenshots__/`

**Run Tests & Update Baselines:**
```bash
npx playwright test tests/visual
npx playwright test tests/visual --update-snapshots
npx playwright test tests/visual --project=visual-desktop
```

---

## Configuration Files

### `vite.config.js`
- React Fast Refresh plugin
- PWA plugin with Workbox (service worker generation)
- Bundle analyzer (rollup-plugin-visualizer)
- Development server config with security headers
- Build optimization settings

### `tailwind.config.js`
- Extends with design tokens colors
- Custom spacing scale
- Typography presets
- Dark mode configuration

### `tailwind.config.js`
- Extends with design tokens colors
- Custom spacing scale
- Typography presets
- Dark mode configuration

### `playwright.config.js`
- Chromium, Firefox, WebKit browsers
- Base URL for test environment
- Screenshot on failure
- HTML reports generation
- Visual test projects for mobile/tablet/desktop (375px, 768px, 1920px)

### `eslint.config.js`
- React hooks rules
- React refresh rules
- Custom ESLint rules (no-hardcoded-colors, no-hardcoded-spacing)

### `package.json` - NPM Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Production build (generates PWA artifacts) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run test` | Run tests in watch mode |
| `npm run test:run` | Run tests once (CI mode) |
| `npm run test:a11y` | Run accessibility tests |
| `npm run test:e2e` | Run E2E tests |
| `npm run storybook` | Start Storybook dev server |
| `npm run build-storybook` | Build static Storybook |

---

## Key Technologies & Libraries

### Core Framework
- **React 19.1.1** - UI library with hooks
- **React Router 6.20.1** - Client-side routing
- **Vite 7.1.7** - Fast build tool

### State & Data Management
- **TanStack React Query 5.97.0** - Server state management with caching
- **React Context API** - Global client state

### Styling & Theming
- **Tailwind CSS 3.3.6** - Utility-first CSS
- **Framer Motion 12.23.25** - Animation library
- **Design Tokens System** - Centralized theme values

### Forms & Validation
- **React Hook Form 7.48.2** - Efficient form handling
- **Zod 4.3.6** - Schema validation

### HTTP & Network
- **Axios 1.15.0** - HTTP client
- **Socket.io Client 4.8.3** - WebSocket support

### PWA & Offline
- **Workbox 7.4.0** - Service worker framework
- **vite-plugin-pwa 1.2.0** - PWA integration

### Performance Monitoring
- **web-vitals 5.2.0** - Core Web Vitals metrics

### Testing
- **Vitest 4.0.16** - Unit/integration testing
- **@testing-library/react 16.3.1** - React component testing
- **Playwright 1.59.1** - E2E & visual testing
- **vitest-axe 0.1.0** - Accessibility testing
- **@testing-library/user-event 14.6.1** - User interaction simulation

### Developer Tools
- **Storybook 10.3.5** - Component documentation
- **ESLint 9.36.0** - Code linting
- **Prettier 3.8.2** - Code formatting
- **Husky 9.1.7** - Git hooks
- **rollup-plugin-visualizer 7.0.1** - Bundle analysis

---

## Security Features

### Content Security Policy (CSP)
- Configured in `public/_headers` for Render deployment
- Scripts restricted to self with nonce support
- Inline styles allowed with nonces
- Frame-ancestors set to none

### Input Sanitization
- DOMPurify integration for XSS prevention
- Form input validation with Zod
- API response validation

### JWT Token Management
- Secure token storage
- Automatic token refresh via interceptors
- Token invalidation on logout
- Account lockout after failed attempts

### Environment Variable Validation
- Required variables: `VITE_API_URL`
- Optional feature flags with secure defaults
- Type-safe validation with Zod schemas

---

## Performance Optimizations

### Build Optimization
- Code splitting by route and feature
- Tree-shaking of unused code
- CSS minification with Tailwind
- Image optimization (PWA icons)
- Bundle analysis available at `dist/stats.html`

### Runtime Optimization
- React Query caching strategies
- Service worker caching (cache-first for assets, network-first for API)
- Lazy loading of components
- Memoization of expensive components
- Web Vitals monitoring for LCP, FID, CLS

### Network Optimization
- Automatic retry with exponential backoff
- Request batching in React Query
- API response caching

---

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Start development server (port 5173)
npm run dev

# Run tests in watch mode
npm run test

# Start Storybook for component development
npm run storybook
```

### Pre-commit Workflow
```bash
# Husky pre-commit hook runs:
# 1. ESLint auto-fix on staged JS files
# 2. Prettier formatting on all staged files

# Skip hooks (emergency commits):
git commit -m "msg" --no-verify
```

### Production Build
```bash
# Build for production
npm run build

# Creates:
# - dist/           # Minified app
# - dist/sw.js      # Service worker
# - dist/manifest.json # PWA manifest
# - dist/stats.html # Bundle analysis

# Preview production build
npm run preview

# Deploy to Render (automatic from git push)
```

---

## Environment Variables

### Required
- `VITE_API_URL` - Backend API base URL (validated on startup)

### Optional with Defaults
- `VITE_ENABLE_PWA` (default: true) - Enable PWA functionality
- `VITE_ENABLE_I18N` (default: false) - Enable internationalization
- `VITE_ANALYTICS_ID` - Google Analytics tracking ID
- `VITE_SENTRY_DSN` - Sentry error tracking DSN

---

## Documentation Files

| File | Purpose |
|------|---------|
| `WEB_DOCUMENTATION.md` | Comprehensive feature documentation |
| `WEB_FOLDER_STRUCTURE.md` | This file - project structure overview |
| `.storybook/` | Component documentation via Storybook |
| `.kiro/specs/web-app-enhancements/tasks.md` | Implementation details and test commands |

---

## Quick Links

- **Frontend Repo**: `d:\Mallakhamb-Repo\Mallakhamb-frontend-enhancements\Web`
- **Tests**: `tests/` (E2E & visual), `src/**/*.test.*` (unit/integration)
- **Design System**: `src/components/design-system/`
- **Design Tokens**: `src/styles/tokens.js`
- **API Services**: `src/services/`
- **Configuration**: `src/config/`

---

## Next Steps & Recommendations

1. **Review Design System**: Start with Storybook (`npm run storybook`) to see all components
2. **Run Tests**: Execute full test suite (`npm run test:run && npm run test:a11y && npm run test:e2e`)
3. **Check Coverage**: Review bundle analysis at `dist/stats.html` after build
4. **Developer Setup**: Follow pre-commit workflow with Husky hooks
5. **Feature Development**: Use React Query hooks and design system components as building blocks

---

*Last Updated: April 2026*
*Test Status: ✅ All 665 tests passing*
