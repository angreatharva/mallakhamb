# Architecture Documentation

## Mallakhamb Competition Management System — Frontend

---

## Overview

The Web package is a React 19 SPA (Vite 7) that mirrors the Server's layered architecture. It serves the same five user roles: **SuperAdmin**, **Admin**, **Judge**, **Coach**, and **Player**. Real-time scoring uses Socket.IO client on admin/judge scoring pages.

### Technology Stack

| Concern | Technology |
|---|---|
| Framework | React 19 + React Router 6 |
| Build | Vite 7 |
| Styling | Tailwind CSS 3 |
| HTTP | Axios |
| Real-time | Socket.IO Client |
| Forms | React Hook Form + Zod |

---

## Layered Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Presentation Layer                     │
│         pages · components · routes · middleware         │
└──────────────────────┬──────────────────────────────────┘
                       │ calls
┌──────────────────────▼──────────────────────────────────┐
│                 Service Layer (API)                      │
│   auth · user (player/coach/admin/judge/super-admin)    │
│   team · public                                            │
└──────────────────────┬──────────────────────────────────┘
                       │ uses
┌──────────────────────▼──────────────────────────────────┐
│              Cross-cutting (validators, errors, utils)    │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│                 Infrastructure Layer                     │
│   config · logger · api-client (axios + interceptors)    │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

```
Page / Component
  → hook or direct call
    → services/{domain}/*.api.js
      → api-client.js (axios + auth interceptors)
        → Server REST API
```

---

## Directory Structure

```
Web/
├── index.html
├── docs/
├── tests/
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── config/
    ├── routes/
    ├── pages/              # Role-based views (presentation)
    ├── components/
    │   ├── layout/
    │   ├── competition/
    │   ├── auth/
    │   ├── design-system/
    │   └── responsive/
    ├── contexts/
    ├── hooks/
    ├── middleware/
    ├── services/
    │   ├── api-client.js
    │   ├── auth/
    │   ├── user/
    │   ├── team/
    │   └── public/
    ├── validators/
    ├── errors/
    ├── utils/
    │   ├── auth/
    │   ├── security/
    │   ├── data/
    │   ├── scoring/
    │   └── ui/
    ├── infrastructure/
    ├── constants/
    └── styles/
```

---

## Layer Mapping (Server → Web)

| Server | Web |
|--------|-----|
| `server.js` | `index.html` + `main.jsx` |
| `src/routes/` | `src/routes/` |
| `src/controllers/` | `src/pages/` |
| `src/middleware/` | `src/middleware/` |
| `src/services/{domain}/` | `src/services/{domain}/` |
| `src/validators/` | `src/validators/` |
| `src/errors/` | `src/errors/` |
| `src/utils/{domain}/` | `src/utils/{domain}/` |
| `src/config/` | `src/config/` |
| `src/infrastructure/` | `src/infrastructure/` |

---

## Import Conventions

Use the `@/` alias (maps to `src/`) for imports:

```js
import { playerAPI } from '@/services';
import { logger } from '@/infrastructure/logger';
import apiConfig from '@/config/api.config';
```
