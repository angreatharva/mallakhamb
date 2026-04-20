# Deployment Guide

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Deployment Steps](#deployment-steps)
4. [Database Migrations](#database-migrations)
5. [Health Check Endpoints](#health-check-endpoints)
6. [Monitoring Setup](#monitoring-setup)
7. [Rollback Procedure](#rollback-procedure)
8. [Platform-Specific Notes](#platform-specific-notes)

---

## Prerequisites

- Node.js 18+
- MongoDB 6+ (Atlas or self-hosted)
- A process manager (PM2, systemd, or a container runtime)
- Access to environment variable configuration (`.env` file or platform secrets)

---

## Environment Configuration

Copy `.env_example` to `.env` and fill in all values. The server will refuse to start if any required variable is missing.

### Required Variables

| Variable | Description | Example |
|---|---|---|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/mallakhamb` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `openssl rand -base64 32` |
| `NODE_ENV` | Runtime environment | `production` |
| `PORT` | HTTP port | `5000` |

### Email Configuration

Choose one provider:

**Gmail (Nodemailer):**

| Variable | Description |
|---|---|
| `EMAIL_USER` | Gmail address |
| `EMAIL_PASS` | Gmail App Password (not your account password) |

To generate a Gmail App Password:
1. Enable 2-factor authentication on your Google account
2. Go to Google Account → Security → 2-Step Verification → App passwords
3. Generate a password for "Mail"

**Resend (recommended for production):**

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | API key from resend.com dashboard |
| `RESEND_FROM_EMAIL` | Verified sender address |

### Database Pool Settings (optional, defaults shown)

| Variable | Default | Description |
|---|---|---|
| `DB_POOL_MIN` | `10` | Minimum connections |
| `DB_POOL_MAX` | `100` | Maximum connections |
| `DB_CONNECT_TIMEOUT` | `10000` | Connection timeout (ms) |
| `DB_SOCKET_TIMEOUT` | `45000` | Socket timeout (ms) |

### Application URLs

| Variable | Description |
|---|---|
| `CLIENT_URL` | Frontend URL (used for CORS) |
| `FRONTEND_URL` | Frontend URL (used in email links) |
| `PRODUCTION_URL` | Public API URL |

### Feature Flags (optional)

| Variable | Default | Description |
|---|---|---|
| `ENABLE_CACHING` | `true` | Enable in-memory cache |
| `ENABLE_METRICS` | `true` | Enable metrics collection |
| `ENABLE_NGROK` | `false` | Enable ngrok tunnel (development only) |

### Payment (Razorpay)

| Variable | Description |
|---|---|
| `RAZORPAY_KEY_ID` | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |

### Full Production `.env` Example

```env
NODE_ENV=production
PORT=5000

MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/mallakhamb?retryWrites=true&w=majority

JWT_SECRET=<generate with: openssl rand -base64 32>

CLIENT_URL=https://your-frontend.com
FRONTEND_URL=https://your-frontend.com
PRODUCTION_URL=https://your-api.com

RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=noreply@yourdomain.com

RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxxx
RAZORPAY_KEY_SECRET=your_live_secret

DB_POOL_MIN=10
DB_POOL_MAX=100

ENABLE_CACHING=true
ENABLE_METRICS=true
ENABLE_NGROK=false
```

---

## Deployment Steps

### 1. Pre-Deployment Checklist

```bash
# Run all tests
cd Server
npm test

# Check test coverage
npm run test:coverage

# Verify no pending security vulnerabilities
npm audit

# Confirm all required env vars are set
node -e "require('./src/config/config-manager')" 2>&1
# Should print nothing if config is valid; prints error if a required var is missing
```

### 2. Install Dependencies

```bash
cd Server
npm install --omit=dev
```

### 3. Run Database Migrations

Always run migrations before starting the new version:

```bash
npm run migrate:status   # check what's pending
npm run migrate:up       # apply all pending migrations
```

### 4. Start the Server

**Direct (for testing):**
```bash
node server.js
```

**With PM2 (recommended for production):**
```bash
pm2 start server.js --name mallakhamb-api
pm2 save
pm2 startup  # configure auto-restart on reboot
```

**With Docker:**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

```bash
docker build -t mallakhamb-api .
docker run -d --env-file .env -p 5000:5000 mallakhamb-api
```

### 5. Post-Deployment Verification

```bash
# Liveness check — server is running
curl https://your-api.com/api/health/live
# Expected: {"status":"alive","timestamp":"..."}

# Readiness check — server is ready for traffic
curl https://your-api.com/api/health/ready
# Expected: {"status":"ready","checks":{"database":{"status":"healthy",...}}}

# Full health status
curl https://your-api.com/api/health
# Expected: {"status":"healthy","uptime":...,"checks":{...}}
```

---

## Database Migrations

Migrations are versioned scripts in `src/migrations/`. They are tracked in a `migrations` collection in MongoDB.

### Commands

```bash
# Show migration status (applied vs pending)
npm run migrate:status

# Apply all pending migrations
npm run migrate:up

# Roll back the last applied migration
npm run migrate:down
```

### Creating a New Migration

Copy the template and implement `up` and `down`:

```javascript
// src/migrations/002_add_competition_indexes.js
module.exports = {
  version: '002',
  description: 'Add indexes for competition queries',

  async up(db) {
    await db.collection('competitions').createIndex({ status: 1 });
    await db.collection('competitions').createIndex({ startDate: -1 });
  },

  async down(db) {
    await db.collection('competitions').dropIndex({ status: 1 });
    await db.collection('competitions').dropIndex({ startDate: -1 });
  }
};
```

### Migration Safety Rules

- Always implement `down` so migrations can be rolled back
- Test migrations on a staging database before production
- Never modify an already-applied migration — create a new one instead
- Back up the database before running migrations in production

---

## Health Check Endpoints

The server exposes four health endpoints under `/api/health`.

### `GET /api/health/live`

Liveness probe. Returns 200 if the process is running.

```json
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

Use this for container/orchestrator liveness checks. If this fails, restart the container.

### `GET /api/health/ready`

Readiness probe. Returns 200 if the server is ready to accept traffic (database connected).

```json
{
  "status": "ready",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 3,
      "message": "Database connection is healthy"
    }
  }
}
```

Returns 503 if the database is not connected. Use this to gate traffic routing.

### `GET /api/health`

Detailed health status including all component checks.

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "checks": {
    "database": { "status": "healthy", "responseTime": 3 },
    "memory": {
      "status": "healthy",
      "heapUsed": "128MB",
      "heapTotal": "256MB",
      "heapUsagePercent": "50%"
    },
    "email": { "status": "healthy", "message": "Email service is configured" }
  }
}
```

### `GET /api/health/metrics`

Performance metrics in JSON format.

```json
{
  "requests": {
    "total": 1250,
    "byEndpoint": { "GET /api/competitions": 450, "POST /api/auth/login": 200 }
  },
  "responseTimes": { "p50": 45, "p95": 180, "p99": 420 },
  "errors": { "total": 12, "rate": "0.96%" },
  "cache": { "hits": 890, "misses": 360, "hitRate": "71.2%" },
  "socketConnections": 24
}
```

---

## Monitoring Setup

### Logs

Logs are written to `Server/logs/`:

| File | Contents |
|---|---|
| `combined.log` | All log levels |
| `error.log` | Error level only |
| `combined-YYYY-MM-DD.log` | Daily rotated combined logs |
| `error-YYYY-MM-DD.log` | Daily rotated error logs |
| `access.log` | HTTP access log |
| `security.log` | Security events (auth failures, rate limit hits) |

In production, logs are JSON-formatted for easy ingestion into log aggregators (Datadog, Papertrail, CloudWatch, etc.).

### Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold |
|---|---|---|
| Error rate | > 2% | > 5% |
| p95 response time | > 300ms | > 500ms |
| Memory heap usage | > 70% | > 90% |
| Database response time | > 100ms | > 500ms |
| Cache hit rate | < 60% | < 40% |

### Prometheus Integration

The `/api/health/metrics` endpoint returns metrics that can be scraped by Prometheus. Add a scrape config:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'mallakhamb-api'
    static_configs:
      - targets: ['your-api.com:5000']
    metrics_path: '/api/health/metrics'
    scrape_interval: 30s
```

### Alerts to Configure

- Health check `/api/health/ready` returns non-200
- Error rate exceeds 5% over 5 minutes
- p95 response time exceeds 500ms over 5 minutes
- Memory heap usage exceeds 90%
- No successful database ping in 60 seconds

---

## Rollback Procedure

### Application Rollback

1. Deploy the previous version of the application
2. Verify health checks pass
3. Monitor error rates for 5 minutes

### Database Rollback

If the new version applied migrations that need to be reversed:

```bash
# Roll back the last migration
npm run migrate:down

# Verify status
npm run migrate:status
```

### Emergency Rollback with Feature Flags

If a specific feature is causing issues, disable it via feature flag without redeploying:

1. Update the feature flag configuration (environment variable or database)
2. The change takes effect on the next request (no restart needed for env-based flags)

---

## Platform-Specific Notes

### Render

The project includes a `render.yaml` at the repository root. Render will:
- Automatically detect the Node.js runtime
- Run `npm install` on each deploy
- Start the server with `node server.js`

Set environment variables in the Render dashboard under **Environment**.

### PM2 Cluster Mode

For multi-core servers, run in cluster mode:

```bash
pm2 start server.js --name mallakhamb-api -i max
```

Note: The in-memory cache is per-process in cluster mode. If cache consistency across processes is required, migrate to Redis.

### Docker Compose

```yaml
version: '3.8'
services:
  api:
    build: ./Server
    ports:
      - "5000:5000"
    env_file:
      - ./Server/.env
    depends_on:
      - mongodb
    restart: unless-stopped

  mongodb:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    restart: unless-stopped

volumes:
  mongo_data:
```
