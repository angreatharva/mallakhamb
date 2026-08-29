/**
 * OpenAPI 3.0 description of the whole HTTP surface.
 *
 * Written as a module rather than a static YAML file so that the enums that
 * matter — age groups, apparatus, competition types, judge seats — are imported
 * from the code that enforces them (config/cop-rules.js) instead of retyped.
 * A COP revision then moves the spec with it; a hand-written YAML would go
 * stale silently, and a wrong enum in an API document is worse than no document
 * because it is believed.
 *
 * Coverage is not taken on trust either: `scripts/generateOpenApi.js` diffs the
 * paths declared here against the routes read off the live Express stack
 * (scripts/perf/extract-routes.js) and fails if either side has something the
 * other does not.
 *
 * Every path is documented in its UNVERSIONED form (`/api/...`). The versioned
 * alias `/api/v1/...` serves the identical router (routes/index.js) and is
 * declared as a second server entry rather than as 185 duplicate paths.
 *
 * @module docs/openapi
 */

const { APPARATUS, COMPETITION_TYPES, AGE_GROUPS, GENDERS } = require('./api-enums');

const JUDGE_TYPES = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer'];

// ---------------------------------------------------------------------------
// Reusable pieces
// ---------------------------------------------------------------------------

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

/** A 2xx body in this API is always `{ success: true, data: <payload> }`. */
const ok = (description, dataSchema) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: dataSchema || {},
          message: { type: 'string' },
        },
      },
    },
  },
});

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: ref('Error') } },
});

/** The error responses every authenticated route can produce. */
const AUTH_ERRORS = {
  401: errorResponse('Missing, invalid, expired or logged-out token'),
  403: errorResponse('Authenticated, but the principal lacks the required role'),
};

const VALIDATION_ERROR = {
  400: errorResponse('Request failed validation — `error.details` names the field'),
};

const NOT_FOUND = { 404: errorResponse('Resource not found') };

const queryParam = (name, schema, description, required = false) => ({
  name, in: 'query', required, schema, description,
});

const pathParam = (name, description) => ({
  name, in: 'path', required: true, schema: { type: 'string' }, description,
});

/** gender + ageGroup + competitionType + apparatus, as query filters. */
const CATEGORY_QUERY = [
  queryParam('gender', { type: 'string', enum: GENDERS }, 'Category gender'),
  queryParam('ageGroup', { type: 'string', enum: AGE_GROUPS }, 'Category age group'),
  queryParam('competitionType', { type: 'string', enum: COMPETITION_TYPES }, 'Competition I / II / III (slug or display form)'),
  queryParam('apparatus', { type: 'string', enum: APPARATUS }, 'Apparatus filter'),
];

const PAGINATION_QUERY = [
  queryParam('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number (1-based)'),
  queryParam('limit', { type: 'integer', minimum: 1, maximum: 100, default: 10 }, 'Rows per page'),
];

/**
 * Build one operation.
 *
 * `competitionContext` marks the routes behind `validateCompetitionContext`,
 * which resolves the competition from the token, then `X-Competition-Id`, then
 * the body, then the query — and 400s when none of them carry it. That header
 * is the single most common cause of a 400 on this API, so it is declared
 * explicitly on every route that needs it rather than described once in prose.
 */
const op = ({
  tag, summary, description, operationId,
  auth = true, roles, competitionContext = false,
  parameters = [], requestBody, responses = {}, deprecated,
}) => {
  const params = [...parameters];
  if (competitionContext) {
    params.unshift({
      name: 'X-Competition-Id',
      in: 'header',
      required: false,
      schema: { type: 'string', format: 'objectid' },
      description:
        'Competition context. Required unless the access token already carries one '
        + '(set via POST /api/auth/set-competition) or the body/query supplies `competitionId`.',
    });
  }

  const operation = {
    tags: [tag],
    summary,
    operationId,
    parameters: params.length ? params : undefined,
    requestBody,
    responses: {
      ...responses,
      ...(auth ? AUTH_ERRORS : {}),
      500: errorResponse('Unhandled server error'),
    },
  };

  const notes = [description];
  if (roles) notes.push(`**Roles:** ${roles}`);
  if (!auth) notes.push('**Public** — no authentication required.');
  if (competitionContext) {
    notes.push('**Competition context required** — see the `X-Competition-Id` parameter.');
  }
  operation.description = notes.filter(Boolean).join('\n\n');

  if (deprecated) operation.deprecated = true;
  if (auth) operation.security = [{ bearerAuth: [] }, { cookieAuth: [] }];
  else operation.security = [];

  return operation;
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const schemas = {
  Error: {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: false },
      error: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Competition context is required.' },
          code: {
            type: 'string',
            example: 'VALIDATION_ERROR',
            description: 'Stable machine-readable code — see src/errors/error-codes.js',
          },
          details: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Field name → message, for validation failures',
          },
        },
      },
    },
  },

  LoginResponse: {
    type: 'object',
    description:
      'The access token is ALSO set as an httpOnly `access_token` cookie and a '
      + '`refresh_token` cookie. Browser clients should rely on the cookies; the '
      + 'body copy exists for non-browser clients.',
    properties: {
      token: { type: 'string' },
      user: ref('UserSummary'),
      userType: { type: 'string', enum: ['player', 'coach', 'admin', 'superadmin', 'judge'] },
    },
  },

  UserSummary: {
    type: 'object',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      isActive: { type: 'boolean' },
    },
  },

  Competition: {
    type: 'object',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      name: { type: 'string', example: 'National Mallakhamb Championship' },
      year: { type: 'integer', example: 2026 },
      place: { type: 'string', example: 'Mumbai' },
      level: { type: 'string', enum: ['District', 'State', 'National', 'International'] },
      status: { type: 'string', enum: ['upcoming', 'open', 'ongoing', 'completed', 'cancelled'] },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      competitionTypes: { type: 'array', items: { type: 'string', enum: COMPETITION_TYPES } },
      ageGroups: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            gender: { type: 'string', enum: GENDERS },
            ageGroup: { type: 'string', enum: AGE_GROUPS },
            status: { type: 'string' },
          },
        },
      },
      registeredTeams: {
        type: 'array',
        description:
          'Embedded entries. This array carries the whole squad of every entered '
          + 'team, which is why endpoints that populate it are the expensive ones.',
        items: ref('RegisteredTeam'),
      },
    },
  },

  RegisteredTeam: {
    type: 'object',
    properties: {
      team: { type: 'string', format: 'objectid' },
      coach: { type: 'string', format: 'objectid' },
      isSubmitted: { type: 'boolean' },
      submittedAt: { type: 'string', format: 'date-time' },
      paymentStatus: { type: 'string', enum: ['pending', 'paid', 'failed', 'refunded'] },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            player: { type: 'string', format: 'objectid' },
            ageGroup: { type: 'string', enum: AGE_GROUPS },
            gender: { type: 'string', enum: GENDERS },
            apparatus: {
              type: 'object',
              description: 'competitionType slug → apparatus[] the athlete is entered on',
              additionalProperties: { type: 'array', items: { type: 'string', enum: APPARATUS } },
            },
          },
        },
      },
    },
  },

  Team: {
    type: 'object',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      name: { type: 'string', example: 'SGAM-A' },
      description: { type: 'string' },
      coach: ref('UserSummary'),
      isActive: { type: 'boolean' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  SubmittedTeam: {
    type: 'object',
    description: 'A team the coach has final-submitted AND paid for.',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      name: { type: 'string' },
      coach: ref('UserSummary'),
      isSubmitted: { type: 'boolean' },
      paymentStatus: { type: 'string' },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            player: ref('UserSummary'),
            ageGroup: { type: 'string', enum: AGE_GROUPS },
            gender: { type: 'string', enum: GENDERS },
            apparatus: { type: 'object', additionalProperties: true },
            isFinalized: { type: 'boolean', description: 'Senior Judge has Final Submitted this athlete' },
            finalScore: { type: 'number', nullable: true },
            hasScore: { type: 'boolean' },
          },
        },
      },
    },
  },

  Player: {
    type: 'object',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      firstName: { type: 'string' },
      lastName: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string' },
      dateOfBirth: { type: 'string', format: 'date' },
      gender: { type: 'string', enum: GENDERS },
      ageGroup: { type: 'string', enum: AGE_GROUPS, nullable: true },
      team: { type: 'string', format: 'objectid', nullable: true },
      stateUnit: { type: 'string', nullable: true },
      registrationNumber: { type: 'string', nullable: true },
    },
  },

  Judge: {
    type: 'object',
    description:
      'A panel SEAT, not a login. The person filling it is `judgeAccount`; the '
      + 'same account routinely holds different seats in different categories.',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      competition: { type: 'string', format: 'objectid' },
      gender: { type: 'string', enum: GENDERS },
      ageGroup: { type: 'string', enum: AGE_GROUPS },
      judgeNo: { type: 'integer', minimum: 1, maximum: 6 },
      judgeType: { type: 'string', enum: JUDGE_TYPES },
      competitionTypes: { type: 'array', items: { type: 'string', enum: COMPETITION_TYPES } },
      apparatus: { type: 'string', enum: APPARATUS, nullable: true },
      judgeAccount: { type: 'string', format: 'objectid', nullable: true, description: 'null = empty slot' },
      isActive: { type: 'boolean' },
    },
  },

  JudgeSlipBreakdown: {
    type: 'object',
    description:
      'COP §3.3 section marks. Each section is capped and the total may not exceed 10.00.\n\n'
      + '`difficulty` and `combination` are OBJECTS carrying a `total` plus the '
      + 'selections behind it — the element list and the checklist — so re-opening '
      + 'a slip restores the exact selections rather than only the section total. '
      + '`execution` and `bonus` are plain numbers.\n\n'
      + 'Sending a bare number for `difficulty` or `combination` is not rejected: '
      + 'the server reads `.total` off it, gets `undefined`, and treats the section '
      + 'as 0. Send the object form.',
    properties: {
      difficulty: {
        type: 'object',
        properties: {
          total: { type: 'number', minimum: 0, maximum: 3.8 },
          elements: {
            type: 'array',
            description: 'The A/B/C elements performed, valued 0.20 / 0.40 / 0.60.',
            items: { type: 'object', additionalProperties: true },
          },
        },
      },
      combination: {
        type: 'object',
        properties: {
          total: { type: 'number', minimum: 0, maximum: 1.6 },
          checklist: {
            type: 'object',
            description: 'The per-apparatus checklist; a failed item deducts its penalty.',
            additionalProperties: true,
          },
        },
      },
      execution: { type: 'number', minimum: 0, maximum: 4.4 },
      bonus: { type: 'number', enum: [0, 0.2], description: 'All-or-nothing. Also accepted as `originality`.' },
    },
  },

  PlayerScore: {
    type: 'object',
    properties: {
      playerId: { type: 'string', format: 'objectid' },
      playerName: { type: 'string' },
      playerGender: { type: 'string', enum: GENDERS },
      playerAgeGroup: { type: 'string', enum: AGE_GROUPS },
      apparatus: { type: 'string', enum: APPARATUS },
      judgeScores: {
        type: 'object',
        description: 'seat → mark, e.g. { seniorJudge: 8.6, judge1: 8.4, judge2: 8.5 }',
        additionalProperties: { type: 'number' },
      },
      judgeSlips: { type: 'array', items: { type: 'object', additionalProperties: true } },
      averageMarks: { type: 'number' },
      executionAverage: { type: 'number' },
      baseScore: { type: 'number' },
      toleranceUsed: { type: 'number' },
      deduction: { type: 'number', description: 'Time deduction recorded by the Scorer' },
      otherDeduction: { type: 'number' },
      finalScore: { type: 'number' },
      isFinalized: { type: 'boolean' },
      finalizedAt: { type: 'string', format: 'date-time' },
    },
  },

  Score: {
    type: 'object',
    description:
      'One document per (team, gender, ageGroup, competition, competitionType) — '
      + 'the unique index `score_identity_unique`.',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      competition: { type: 'string', format: 'objectid' },
      teamId: { type: 'string', format: 'objectid' },
      gender: { type: 'string', enum: GENDERS },
      ageGroup: { type: 'string', enum: AGE_GROUPS },
      competitionType: { type: 'string', enum: ['Competition I', 'Competition II', 'Competition III'] },
      playerScores: { type: 'array', items: ref('PlayerScore') },
      timeKeeper: { type: 'string' },
      scorer: { type: 'string' },
      remarks: { type: 'string' },
      isLocked: { type: 'boolean' },
    },
  },

  SaveScoreRequest: {
    type: 'object',
    description:
      'Two shapes share this endpoint.\n\n'
      + '**Single judge slip** — `playerId` + `score` (+ optional `breakdown`). The '
      + 'panel seat written is resolved from the caller\'s own assignment for THIS '
      + 'category; a `judgeType` in the body is ignored unless the caller is a '
      + 'Senior Judge overriding, or an admin recording on the panel\'s behalf.\n\n'
      + '**Bulk sheet** — `playerScores[]`, used by the Scorer and admin screens.',
    properties: {
      competition: { type: 'string', format: 'objectid' },
      teamId: { type: 'string', format: 'objectid' },
      gender: { type: 'string', enum: GENDERS },
      ageGroup: { type: 'string', enum: AGE_GROUPS },
      competitionType: { type: 'string', enum: COMPETITION_TYPES },
      apparatus: { type: 'string', enum: APPARATUS },
      playerId: { type: 'string', format: 'objectid', description: 'Single-slip form' },
      playerName: { type: 'string' },
      score: { type: 'number', minimum: 0, maximum: 10, description: 'Single-slip form' },
      breakdown: ref('JudgeSlipBreakdown'),
      judgeType: {
        type: 'string',
        enum: JUDGE_TYPES,
        description: 'Honoured only for admins, or a Senior Judge with `overrideBySenior`',
      },
      overrideBySenior: { type: 'boolean' },
      isFinalSubmit: {
        type: 'boolean',
        description: 'Senior Judge only — finalizes and locks this athlete\'s result',
      },
      panelSize: { type: 'integer', enum: [3, 4, 5] },
      playerScores: { type: 'array', items: ref('PlayerScore'), description: 'Bulk form' },
      timeKeeper: { type: 'string' },
      scorer: { type: 'string' },
      remarks: { type: 'string' },
      isLocked: { type: 'boolean' },
    },
  },

  RunningOrder: {
    type: 'object',
    properties: {
      competition: { type: 'string', format: 'objectid' },
      gender: { type: 'string', enum: GENDERS },
      ageGroup: { type: 'string', enum: AGE_GROUPS },
      competitionType: { type: 'string' },
      lotsDrawnAt: { type: 'string', format: 'date-time', nullable: true },
      hasOrder: { type: 'boolean' },
      teams: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            _id: { type: 'string', format: 'objectid' },
            name: { type: 'string' },
            coachName: { type: 'string' },
            lotNo: { type: 'integer', nullable: true },
            position: { type: 'integer', nullable: true },
            playerCount: { type: 'integer' },
            players: { type: 'array', items: { type: 'object', additionalProperties: true } },
          },
        },
      },
    },
  },

  Transaction: {
    type: 'object',
    properties: {
      _id: { type: 'string', format: 'objectid' },
      competition: { type: 'string', format: 'objectid' },
      team: { type: 'string', format: 'objectid' },
      coach: { type: 'string', format: 'objectid' },
      amount: { type: 'number' },
      paymentStatus: { type: 'string', enum: ['pending', 'paid', 'failed', 'refunded'] },
      razorpayOrderId: { type: 'string' },
      razorpayPaymentId: { type: 'string' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },

  Paginated: {
    type: 'object',
    properties: {
      total: { type: 'integer' },
      page: { type: 'integer' },
      pages: { type: 'integer' },
    },
  },

  DashboardStats: {
    type: 'object',
    properties: {
      totalTeams: { type: 'integer' },
      totalParticipants: { type: 'integer' },
      boysTeams: { type: 'integer' },
      girlsTeams: { type: 'integer' },
      totalBoys: { type: 'integer' },
      totalGirls: { type: 'integer' },
      submittedTeams: { type: 'integer' },
      totalJudges: { type: 'integer' },
      competition: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          status: { type: 'string' },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Request body helpers
// ---------------------------------------------------------------------------

const jsonBody = (schema, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});

const inline = (properties, requiredFields = []) => ({
  type: 'object',
  properties,
  required: requiredFields.length ? requiredFields : undefined,
});

const S = {
  id: { type: 'string', format: 'objectid' },
  str: { type: 'string' },
  email: { type: 'string', format: 'email' },
  bool: { type: 'boolean' },
  num: { type: 'number' },
  int: { type: 'integer' },
  gender: { type: 'string', enum: GENDERS },
  ageGroup: { type: 'string', enum: AGE_GROUPS },
  competitionType: { type: 'string', enum: COMPETITION_TYPES },
  apparatus: { type: 'string', enum: APPARATUS },
  judgeType: { type: 'string', enum: JUDGE_TYPES },
};

const loginBody = jsonBody(inline({ email: S.email, password: S.str }, ['email', 'password']));

/** The category quadruple, as a request body fragment. */
const categoryBody = {
  gender: S.gender,
  ageGroup: S.ageGroup,
  competitionType: S.competitionType,
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/* eslint-disable max-lines-per-function */
function buildPaths() {
  const paths = {};

  const add = (path, method, operation) => {
    paths[path] = paths[path] || {};
    paths[path][method] = operation;
  };

  // ===================== Health & meta =====================

  add('/api/health', 'get', op({
    tag: 'Health', auth: false, operationId: 'health',
    summary: 'Detailed health check',
    description: 'Component-by-component status. Touches the database, so it is not the probe to poll at high frequency — use `/api/health/live`.',
    responses: { 200: ok('Health report') },
  }));

  add('/api/health/live', 'get', op({
    tag: 'Health', auth: false, operationId: 'healthLive',
    summary: 'Liveness probe',
    description: 'Process is up. No I/O — safe to poll aggressively.',
    responses: { 200: ok('Alive') },
  }));

  add('/api/health/ready', 'get', op({
    tag: 'Health', auth: false, operationId: 'healthReady',
    summary: 'Readiness probe',
    description: 'Ready to take traffic: checks the database connection.',
    responses: { 200: ok('Ready'), 503: errorResponse('Not ready') },
  }));

  add('/api/health/metrics', 'get', op({
    tag: 'Health', auth: false, operationId: 'healthMetrics',
    summary: 'Performance metrics',
    description: 'Per-route request counts and latency percentiles collected by the metrics middleware.',
    parameters: [queryParam('format', { type: 'string', enum: ['json', 'prometheus'], default: 'json' }, 'Output format')],
    responses: { 200: ok('Metrics') },
  }));

  add('/api/health-legacy', 'get', op({
    tag: 'Health', auth: false, operationId: 'healthLegacy',
    summary: 'Legacy liveness string',
    description: 'Kept for an old caller. Prefer `/api/health/live`.',
    deprecated: true,
    responses: { 200: ok('Alive') },
  }));

  add('/api/csrf-token', 'get', op({
    tag: 'Auth', auth: false, operationId: 'csrfToken',
    summary: 'Issue a CSRF token',
    description:
      'Sets the `csrf-token` cookie AND returns the token in the body. The SPA reads '
      + 'the BODY copy, because the client origin and the API are different sites and '
      + 'JS cannot read another origin\'s cookie. Send it back in `X-CSRF-Token` on '
      + 'every POST/PUT/PATCH/DELETE. Requests carrying `Authorization: Bearer` are exempt.',
    responses: { 200: ok('Token issued', inline({ csrfToken: S.str })) },
  }));

  // ===================== Auth =====================

  add('/api/auth/me', 'get', op({
    tag: 'Auth', operationId: 'authMe',
    summary: 'The authenticated principal',
    description: 'Session rehydration on page load. Works with either the cookie or a Bearer token.',
    responses: { 200: ok('Current principal', ref('UserSummary')) },
  }));

  add('/api/auth/logout', 'post', op({
    tag: 'Auth', operationId: 'authLogout',
    summary: 'Log out',
    description: 'Clears both cookies and records the logout instant, which invalidates every access token issued before it.',
    responses: { 200: ok('Logged out') },
  }));

  add('/api/auth/refresh', 'post', op({
    tag: 'Auth', auth: false, operationId: 'authRefresh',
    summary: 'Exchange the refresh cookie for a new access token',
    description: 'Uses the httpOnly `refresh_token` cookie; nothing is read from the body.',
    responses: { 200: ok('New access token issued', ref('LoginResponse')), 401: errorResponse('Refresh token missing, expired or revoked') },
  }));

  add('/api/auth/forgot-password', 'post', op({
    tag: 'Auth', auth: false, operationId: 'forgotPassword',
    summary: 'Send a password-reset OTP',
    description: 'Always answers 200 whether or not the address is registered, so the endpoint cannot be used to enumerate accounts.',
    requestBody: jsonBody(inline({ email: S.email, userType: S.str }, ['email'])),
    responses: { 200: ok('OTP sent if the account exists'), ...VALIDATION_ERROR },
  }));

  add('/api/auth/verify-otp', 'post', op({
    tag: 'Auth', auth: false, operationId: 'verifyOtp',
    summary: 'Verify a reset OTP',
    requestBody: jsonBody(inline({ email: S.email, otp: S.str, userType: S.str }, ['email', 'otp'])),
    responses: { 200: ok('OTP accepted'), ...VALIDATION_ERROR },
  }));

  add('/api/auth/reset-password-otp', 'post', op({
    tag: 'Auth', auth: false, operationId: 'resetPasswordOtp',
    summary: 'Reset a password with an OTP',
    requestBody: jsonBody(inline({ email: S.email, otp: S.str, newPassword: S.str, userType: S.str }, ['email', 'otp', 'newPassword'])),
    responses: { 200: ok('Password changed'), ...VALIDATION_ERROR },
  }));

  add('/api/auth/reset-password/{token}', 'post', op({
    tag: 'Auth', auth: false, operationId: 'resetPasswordToken',
    summary: 'Reset a password with a URL token (legacy)',
    description: 'Superseded by the OTP flow. Retained for links already in the wild.',
    deprecated: true,
    parameters: [pathParam('token', 'Reset token from the e-mail link')],
    requestBody: jsonBody(inline({ password: S.str }, ['password'])),
    responses: { 200: ok('Password changed'), ...VALIDATION_ERROR },
  }));

  add('/api/auth/set-competition', 'post', op({
    tag: 'Auth', operationId: 'setCompetition',
    summary: 'Bind the session to a competition',
    description:
      'Re-issues the access token with `competitionId` baked in, which is what lets '
      + 'the competition-scoped routes work without an `X-Competition-Id` header.',
    requestBody: jsonBody(inline({ competitionId: S.id }, ['competitionId'])),
    responses: { 200: ok('Context set', ref('LoginResponse')), ...VALIDATION_ERROR },
  }));

  add('/api/auth/competitions/assigned', 'get', op({
    tag: 'Auth', operationId: 'assignedCompetitions',
    summary: 'Competitions this principal may act in',
    responses: { 200: ok('Assigned competitions', { type: 'array', items: ref('Competition') }) },
  }));

  // ===================== Players =====================

  add('/api/players/register', 'post', op({
    tag: 'Players', auth: false, operationId: 'registerPlayer',
    summary: 'Register an athlete',
    description: 'Rate limited per IP.',
    requestBody: jsonBody(inline({
      firstName: S.str, lastName: S.str, email: S.email, phone: S.str,
      password: { type: 'string', minLength: 8 },
      dateOfBirth: { type: 'string', format: 'date' },
      gender: S.gender, stateUnit: S.str, registrationNumber: S.str,
    }, ['firstName', 'lastName', 'email', 'phone', 'password', 'dateOfBirth', 'gender'])),
    responses: { 201: ok('Registered', ref('LoginResponse')), ...VALIDATION_ERROR, 409: errorResponse('E-mail already registered') },
  }));

  add('/api/players/login', 'post', op({
    tag: 'Players', auth: false, operationId: 'loginPlayer',
    summary: 'Athlete login',
    description: 'Rate limited per IP. Locks the account temporarily after repeated failures.',
    requestBody: loginBody,
    responses: { 200: ok('Logged in', ref('LoginResponse')), 401: errorResponse('Bad credentials'), 423: errorResponse('Account locked') },
  }));

  add('/api/players/profile', 'get', op({
    tag: 'Players', roles: 'player', operationId: 'playerProfile',
    summary: 'Own profile',
    responses: { 200: ok('Profile', ref('Player')) },
  }));

  add('/api/players/teams', 'get', op({
    tag: 'Players', roles: 'player', operationId: 'playerAvailableTeams',
    summary: 'Teams an athlete may join',
    description: 'Teams belonging to competitions that are open for registration.',
    responses: { 200: ok('Teams', { type: 'array', items: ref('Team') }) },
  }));

  add('/api/players/competitions/open', 'get', op({
    tag: 'Players', roles: 'player', operationId: 'playerOpenCompetitions',
    summary: 'Competitions open for registration',
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  }));

  add('/api/players/team', 'get', op({
    tag: 'Players', roles: 'player', competitionContext: true, operationId: 'playerTeam',
    summary: 'The athlete\'s team in the current competition',
    responses: { 200: ok('Team', ref('Team')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/players/team/join', 'post', op({
    tag: 'Players', roles: 'player', operationId: 'playerJoinTeam',
    summary: 'Join a team',
    requestBody: jsonBody(inline({ teamId: S.id, competitionId: S.id }, ['teamId'])),
    responses: { 200: ok('Joined'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  // ===================== Coaches =====================

  add('/api/coaches/register', 'post', op({
    tag: 'Coaches', auth: false, operationId: 'registerCoach',
    summary: 'Register a coach',
    requestBody: jsonBody(inline({
      firstName: S.str, lastName: S.str, email: S.email, phone: S.str,
      password: { type: 'string', minLength: 8 },
    }, ['firstName', 'lastName', 'email', 'phone', 'password'])),
    responses: { 201: ok('Registered', ref('LoginResponse')), ...VALIDATION_ERROR, 409: errorResponse('E-mail already registered') },
  }));

  add('/api/coaches/login', 'post', op({
    tag: 'Coaches', auth: false, operationId: 'loginCoach',
    summary: 'Coach login',
    requestBody: loginBody,
    responses: { 200: ok('Logged in', ref('LoginResponse')), 401: errorResponse('Bad credentials') },
  }));

  add('/api/coaches/profile', 'get', op({
    tag: 'Coaches', roles: 'coach', operationId: 'coachProfile',
    summary: 'Own profile',
    responses: { 200: ok('Profile', ref('UserSummary')) },
  }));

  add('/api/coaches/status', 'get', op({
    tag: 'Coaches', roles: 'coach', operationId: 'coachStatus',
    summary: 'Onboarding status',
    description: 'Whether the coach has a team yet — the client uses this to decide whether to park them on the create-team screen.',
    responses: { 200: ok('Status') },
  }));

  add('/api/coaches/team', 'post', op({
    tag: 'Coaches', roles: 'coach', operationId: 'coachCreateTeam',
    summary: 'Create a team',
    description: 'Team names are unique per coach, not globally.',
    requestBody: jsonBody(inline({ name: S.str, description: S.str }, ['name'])),
    responses: { 201: ok('Created', ref('Team')), ...VALIDATION_ERROR, 409: errorResponse('This coach already owns a team with that name') },
  }));

  add('/api/coaches/teams', 'get', op({
    tag: 'Coaches', roles: 'coach', operationId: 'coachTeams',
    summary: 'Own teams',
    responses: { 200: ok('Teams', { type: 'array', items: ref('Team') }) },
  }));

  add('/api/coaches/competitions/open', 'get', op({
    tag: 'Coaches', roles: 'coach', operationId: 'coachOpenCompetitions',
    summary: 'Competitions open for entry',
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  }));

  add('/api/coaches/select-competition', 'post', op({
    tag: 'Coaches', roles: 'coach', operationId: 'coachSelectCompetition',
    summary: 'Choose the competition to work in',
    requestBody: jsonBody(inline({ competitionId: S.id }, ['competitionId'])),
    responses: { 200: ok('Selected'), ...VALIDATION_ERROR },
  }));

  add('/api/coaches/team/{teamId}/register-competition', 'post', op({
    tag: 'Coaches', roles: 'coach', operationId: 'coachRegisterTeam',
    summary: 'Enter a team in a competition',
    parameters: [pathParam('teamId', 'Team to enter')],
    requestBody: jsonBody(inline({ competitionId: S.id }, ['competitionId'])),
    responses: { 200: ok('Entered'), ...VALIDATION_ERROR, ...NOT_FOUND, 409: errorResponse('Already entered') },
  }));

  add('/api/coaches/competition/team-status', 'get', op({
    tag: 'Coaches', roles: 'coach', competitionContext: true, operationId: 'coachTeamStatus',
    summary: 'Entry status of the coach\'s team',
    responses: { 200: ok('Status'), ...VALIDATION_ERROR },
  }));

  add('/api/coaches/dashboard', 'get', op({
    tag: 'Coaches', roles: 'coach', competitionContext: true, operationId: 'coachDashboard',
    summary: 'Squad dashboard',
    description: 'The coach\'s whole entry: roster by age group and gender, payment state, submission state.',
    responses: { 200: ok('Dashboard'), ...VALIDATION_ERROR },
  }));

  add('/api/coaches/search-players', 'get', op({
    tag: 'Coaches', roles: 'coach', competitionContext: true, operationId: 'coachSearchPlayers',
    summary: 'Find registered athletes to add to a squad',
    parameters: [queryParam('q', S.str, 'Name or e-mail fragment')],
    responses: { 200: ok('Matches', { type: 'array', items: ref('Player') }), ...VALIDATION_ERROR },
  }));

  add('/api/coaches/add-player', 'post', op({
    tag: 'Coaches', roles: 'coach', competitionContext: true, operationId: 'coachAddPlayer',
    summary: 'Add an athlete to a squad place',
    description:
      'The apparatus list decides which score sheet the judge is shown, so the names '
      + 'are checked rather than left free-form.',
    requestBody: jsonBody(inline({
      playerId: S.id, ageGroup: S.ageGroup, gender: S.gender,
      apparatus: { type: 'array', items: S.apparatus },
    }, ['playerId', 'ageGroup', 'gender'])),
    responses: { 200: ok('Added'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/coaches/remove-player/{playerId}', 'delete', op({
    tag: 'Coaches', roles: 'coach', competitionContext: true, operationId: 'coachRemovePlayer',
    summary: 'Remove an athlete from the squad',
    parameters: [pathParam('playerId', 'Athlete to remove')],
    responses: { 200: ok('Removed'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/coaches/payments/create-order', 'post', op({
    tag: 'Coaches', roles: 'coach', competitionContext: true, operationId: 'coachCreateOrder',
    summary: 'Create the Razorpay order for a squad entry',
    requestBody: jsonBody(inline({ teamId: S.id }, []), false),
    responses: { 200: ok('Order created'), ...VALIDATION_ERROR },
  }));

  add('/api/coaches/payments/verify-and-submit', 'post', op({
    tag: 'Coaches', roles: 'coach', competitionContext: true, operationId: 'coachVerifyAndSubmit',
    summary: 'Verify payment and final-submit the squad',
    description:
      'The signature is verified server-side. Submission is what puts the team in '
      + 'front of a judge — an entered-but-unsubmitted team appears nowhere in scoring.',
    requestBody: jsonBody(inline({
      razorpay_order_id: S.str, razorpay_payment_id: S.str, razorpay_signature: S.str, teamId: S.id,
    })),
    responses: { 200: ok('Paid and submitted'), ...VALIDATION_ERROR, 402: errorResponse('Payment verification failed') },
  }));

  // ===================== Teams =====================

  add('/api/teams', 'get', op({
    tag: 'Teams', roles: 'coach', operationId: 'listTeams',
    summary: 'The calling coach\'s teams',
    responses: { 200: ok('Teams', { type: 'array', items: ref('Team') }) },
  }));

  add('/api/teams', 'post', op({
    tag: 'Teams', roles: 'coach', operationId: 'createTeam',
    summary: 'Create a team',
    requestBody: jsonBody(inline({ name: S.str, description: S.str }, ['name'])),
    responses: { 201: ok('Created', ref('Team')), ...VALIDATION_ERROR },
  }));

  add('/api/teams/{id}', 'get', op({
    tag: 'Teams', operationId: 'getTeam',
    summary: 'Team detail with roster',
    description: 'Authenticated deliberately: these rosters are largely minors.',
    parameters: [pathParam('id', 'Team id')],
    responses: { 200: ok('Team', ref('Team')), ...NOT_FOUND },
  }));

  add('/api/teams/{id}', 'put', op({
    tag: 'Teams', roles: 'coach', operationId: 'updateTeam',
    summary: 'Update a team',
    parameters: [pathParam('id', 'Team id')],
    requestBody: jsonBody(inline({ name: S.str, description: S.str })),
    responses: { 200: ok('Updated', ref('Team')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/teams/{id}', 'delete', op({
    tag: 'Teams', roles: 'coach', operationId: 'deleteTeam',
    summary: 'Delete a team',
    parameters: [pathParam('id', 'Team id')],
    responses: { 200: ok('Deleted'), ...NOT_FOUND },
  }));

  add('/api/teams/{id}/stats', 'get', op({
    tag: 'Teams', operationId: 'teamStats',
    summary: 'Team statistics',
    parameters: [pathParam('id', 'Team id')],
    responses: { 200: ok('Stats'), ...NOT_FOUND },
  }));

  add('/api/teams/{id}/players', 'post', op({
    tag: 'Teams', roles: 'coach', operationId: 'teamAddPlayer',
    summary: 'Add an athlete to a team',
    parameters: [pathParam('id', 'Team id')],
    requestBody: jsonBody(inline({ playerId: S.id }, ['playerId'])),
    responses: { 200: ok('Added'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/teams/{id}/players', 'delete', op({
    tag: 'Teams', roles: 'coach', operationId: 'teamRemovePlayer',
    summary: 'Remove an athlete from a team',
    parameters: [pathParam('id', 'Team id')],
    requestBody: jsonBody(inline({ playerId: S.id }, ['playerId'])),
    responses: { 200: ok('Removed'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  // ===================== Competitions =====================

  add('/api/competitions', 'get', op({
    tag: 'Competitions', operationId: 'listCompetitions',
    summary: 'All competitions',
    parameters: [...PAGINATION_QUERY, queryParam('status', S.str, 'Status filter')],
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  }));

  add('/api/competitions', 'post', op({
    tag: 'Competitions', roles: 'admin, superadmin', operationId: 'createCompetition',
    summary: 'Create a competition',
    requestBody: jsonBody(inline({
      name: S.str, year: S.int, place: S.str, level: S.str,
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
      competitionTypes: { type: 'array', items: S.competitionType },
      ageGroups: { type: 'array', items: { type: 'object', properties: { gender: S.gender, ageGroup: S.ageGroup } } },
    }, ['name', 'year', 'place', 'startDate', 'endDate'])),
    responses: { 201: ok('Created', ref('Competition')), ...VALIDATION_ERROR, 409: errorResponse('name + year + place already exists') },
  }));

  add('/api/competitions/upcoming', 'get', op({
    tag: 'Competitions', auth: false, operationId: 'upcomingCompetitions',
    summary: 'Upcoming competitions',
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  }));

  add('/api/competitions/status/{status}', 'get', op({
    tag: 'Competitions', operationId: 'competitionsByStatus',
    summary: 'Competitions in a given status',
    parameters: [pathParam('status', 'upcoming | open | ongoing | completed | cancelled')],
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  }));

  add('/api/competitions/{id}', 'get', op({
    tag: 'Competitions', operationId: 'getCompetition',
    summary: 'Competition by id',
    description:
      'The entry list is **excluded by default** — ask for it with '
      + '`?include=registeredTeams`. `registeredTeams` embeds every entered team and '
      + 'every athlete in every entry, which is 3.0 MB on a 1000-team meet against '
      + '2 KB for the competition itself.',
    parameters: [
      pathParam('id', 'Competition id'),
      queryParam('include', { type: 'string', enum: ['registeredTeams'] }, 'Comma-separated extras to embed'),
    ],
    responses: { 200: ok('Competition', ref('Competition')), ...NOT_FOUND },
  }));

  add('/api/competitions/{id}', 'put', op({
    tag: 'Competitions', roles: 'admin, superadmin', operationId: 'updateCompetition',
    summary: 'Update a competition',
    parameters: [pathParam('id', 'Competition id')],
    requestBody: jsonBody(ref('Competition')),
    responses: { 200: ok('Updated', ref('Competition')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/competitions/{id}', 'delete', op({
    tag: 'Competitions', roles: 'admin, superadmin', operationId: 'deleteCompetition',
    summary: 'Delete a competition (soft)',
    parameters: [pathParam('id', 'Competition id')],
    responses: { 200: ok('Deleted'), ...NOT_FOUND },
  }));

  add('/api/competitions/{id}/status', 'patch', op({
    tag: 'Competitions', roles: 'admin, superadmin', operationId: 'updateCompetitionStatus',
    summary: 'Change competition status',
    parameters: [pathParam('id', 'Competition id')],
    requestBody: jsonBody(inline({ status: S.str }, ['status'])),
    responses: { 200: ok('Updated'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/competitions/{competitionId}/register', 'post', op({
    tag: 'Competitions', roles: 'coach', operationId: 'competitionRegisterTeam',
    summary: 'Enter a team',
    parameters: [pathParam('competitionId', 'Competition id')],
    requestBody: jsonBody(inline({ teamId: S.id }, ['teamId'])),
    responses: { 200: ok('Entered'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/competitions/{competitionId}/register/{teamId}', 'delete', op({
    tag: 'Competitions', roles: 'coach', operationId: 'competitionUnregisterTeam',
    summary: 'Withdraw a team',
    parameters: [pathParam('competitionId', 'Competition id'), pathParam('teamId', 'Team id')],
    responses: { 200: ok('Withdrawn'), ...NOT_FOUND },
  }));

  add('/api/competitions/{competitionId}/teams/{teamId}', 'get', op({
    tag: 'Competitions', operationId: 'competitionTeamRegistration',
    summary: 'One team\'s entry detail',
    parameters: [pathParam('competitionId', 'Competition id'), pathParam('teamId', 'Team id')],
    responses: { 200: ok('Entry'), ...NOT_FOUND },
  }));

  add('/api/competitions/{competitionId}/teams/{teamId}/players', 'post', op({
    tag: 'Competitions', roles: 'coach', operationId: 'competitionAddPlayer',
    summary: 'Add an athlete to an entry',
    parameters: [pathParam('competitionId', 'Competition id'), pathParam('teamId', 'Team id')],
    requestBody: jsonBody(inline({ playerId: S.id, ageGroup: S.ageGroup, gender: S.gender }, ['playerId', 'ageGroup', 'gender'])),
    responses: { 200: ok('Added'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/competitions/{competitionId}/teams/{teamId}/players/{playerId}', 'delete', op({
    tag: 'Competitions', roles: 'coach', operationId: 'competitionRemovePlayer',
    summary: 'Remove an athlete from an entry',
    parameters: [pathParam('competitionId', 'Competition id'), pathParam('teamId', 'Team id'), pathParam('playerId', 'Athlete id')],
    responses: { 200: ok('Removed'), ...NOT_FOUND },
  }));

  add('/api/competitions/{competitionId}/registrations', 'get', op({
    tag: 'Competitions', roles: 'admin, superadmin', operationId: 'competitionRegistrations',
    summary: 'Every entry in a competition',
    parameters: [pathParam('competitionId', 'Competition id')],
    responses: { 200: ok('Entries', { type: 'array', items: ref('RegisteredTeam') }), ...NOT_FOUND },
  }));

  add('/api/competitions/{id}/admins', 'post', op({
    tag: 'Competitions', roles: 'admin, superadmin', operationId: 'competitionAssignAdmin',
    summary: 'Assign an admin to a competition',
    parameters: [pathParam('id', 'Competition id')],
    requestBody: jsonBody(inline({ adminId: S.id }, ['adminId'])),
    responses: { 200: ok('Assigned'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/competitions/{id}/admins/{adminId}', 'delete', op({
    tag: 'Competitions', roles: 'admin, superadmin', operationId: 'competitionRemoveAdmin',
    summary: 'Remove an admin from a competition',
    parameters: [pathParam('id', 'Competition id'), pathParam('adminId', 'Admin id')],
    responses: { 200: ok('Removed'), ...NOT_FOUND },
  }));

  // ===================== Admin =====================

  add('/api/admin/login', 'post', op({
    tag: 'Admin', auth: false, operationId: 'loginAdmin',
    summary: 'Admin login',
    requestBody: loginBody,
    responses: { 200: ok('Logged in', ref('LoginResponse')), 401: errorResponse('Bad credentials') },
  }));

  add('/api/admin/register', 'post', op({
    tag: 'Admin', roles: 'superadmin', operationId: 'registerAdmin',
    summary: 'Create an admin',
    description:
      'Despite the path, this is NOT public — only a superadmin may create an admin.\n\n'
      + 'Note the single `name` field: the Admin model was not split into '
      + '`firstName`/`lastName` the way Coach, Player and JudgeAccount were.',
    requestBody: jsonBody(inline({ name: S.str, email: S.email, password: S.str, role: { type: 'string', enum: ['admin', 'superadmin'] } }, ['name', 'email', 'password'])),
    responses: { 201: ok('Created', ref('LoginResponse')), ...VALIDATION_ERROR },
  }));

  add('/api/admin/dashboard', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminDashboard',
    summary: 'Dashboard statistics',
    description: 'Alias of `/api/admin/dashboard/stats`.',
    responses: { 200: ok('Stats', ref('DashboardStats')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/dashboard/stats', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminDashboardStats',
    summary: 'Dashboard statistics',
    description:
      'Counts are derived in memory from the competition\'s embedded `registeredTeams` '
      + 'array, so cost grows with the size of the entry list rather than with the '
      + 'number of counters.',
    responses: { 200: ok('Stats', ref('DashboardStats')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  // GET /api/admin/dashboard/competition/{competitionId} was RETIRED. Its
  // per-age-group counts filtered Team and Player by fields neither schema has,
  // so every count it returned was 0, at two unindexed collection scans per age
  // group. Nothing called it. Use /api/admin/dashboard/stats.

  add('/api/admin/system/health', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', operationId: 'adminSystemHealth',
    summary: 'System health as seen by an admin',
    responses: { 200: ok('Health') },
  }));

  add('/api/admin/teams', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminListTeams',
    summary: 'Entered teams, filtered and paginated',
    parameters: [
      ...PAGINATION_QUERY,
      queryParam('ageGroup', S.ageGroup, 'Only teams with an athlete in this age group'),
      queryParam('gender', S.gender, 'Only teams with an athlete of this gender'),
      queryParam('status', S.str, 'Team status'),
      queryParam('coachName', S.str, 'Coach name, case-insensitive substring'),
      queryParam('teamName', S.str, 'Team name, case-insensitive substring'),
    ],
    responses: { 200: ok('Teams', inline({ teams: { type: 'array', items: ref('Team') }, total: S.int, page: S.int, pages: S.int })), ...VALIDATION_ERROR },
  }));

  add('/api/admin/teams/submitted', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminSubmittedTeams',
    summary: 'Submitted teams with per-athlete scoring state',
    description:
      'The judge dashboard\'s team list. Returns every submitted team and, for each '
      + 'athlete, whether the Senior Judge has finalized them and what the resolved '
      + 'final is.\n\n'
      + 'When `gender` and `ageGroup` are supplied, `players` contains **only that '
      + 'category\'s athletes**. It previously returned each matching team\'s entire '
      + 'mixed roster, which the client then filtered — 10,000 rows where the category '
      + 'held 830. Omit the filters to get every athlete.',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Teams', { type: 'array', items: ref('SubmittedTeam') }), ...VALIDATION_ERROR },
  }));

  add('/api/admin/teams/{teamId}', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', operationId: 'adminTeamDetails',
    summary: 'Team detail',
    parameters: [
      pathParam('teamId', 'Team id'),
      queryParam('gender', S.gender, 'Restrict the roster to this gender'),
      queryParam('ageGroup', S.ageGroup, 'Restrict the roster to this age group'),
      queryParam('competition', S.id, 'Competition to read the entry from'),
    ],
    responses: { 200: ok('Team', ref('Team')), ...NOT_FOUND },
  }));

  add('/api/admin/teams/{teamId}/approve', 'put', op({
    tag: 'Admin', roles: 'admin, superadmin', operationId: 'adminApproveTeam',
    summary: 'Approve a team',
    parameters: [pathParam('teamId', 'Team id')],
    responses: { 200: ok('Approved', ref('Team')), ...NOT_FOUND, 409: errorResponse('Already approved') },
  }));

  add('/api/admin/teams/{teamId}/reject', 'put', op({
    tag: 'Admin', roles: 'admin, superadmin', operationId: 'adminRejectTeam',
    summary: 'Reject a team',
    parameters: [pathParam('teamId', 'Team id')],
    requestBody: jsonBody(inline({ reason: S.str }, ['reason'])),
    responses: { 200: ok('Rejected', ref('Team')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/players', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminListPlayers',
    summary: 'Athletes entered in the competition, filtered and paginated',
    description:
      'Reads the competition\'s entries (`registeredTeams`), so each row carries the '
      + 'athlete\'s category, apparatus and team, plus the entry\'s submission and '
      + 'payment state.\n\n'
      + 'Paginated in the database. `status` filters on the athlete\'s ACCOUNT state, '
      + 'which is the only status this data models — there is no per-entry status.',
    parameters: [
      ...PAGINATION_QUERY,
      queryParam('ageGroup', S.ageGroup, 'Age group, as entered'),
      queryParam('gender', S.gender, 'Gender, as entered'),
      queryParam('teamId', S.id, 'Only athletes entered by this team'),
      queryParam('status', { type: 'string', enum: ['active', 'inactive'] }, 'Athlete account state'),
    ],
    responses: { 200: ok('Athletes', inline({ players: { type: 'array', items: ref('Player') }, total: S.int, page: S.int, pages: S.int })), ...VALIDATION_ERROR },
  }));

  add('/api/admin/players/{playerId}', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', operationId: 'adminPlayerDetails',
    summary: 'Athlete detail with scores',
    parameters: [pathParam('playerId', 'Athlete id')],
    responses: { 200: ok('Athlete', ref('Player')), ...NOT_FOUND },
  }));

  add('/api/admin/players/{playerId}/status', 'put', op({
    tag: 'Admin', roles: 'admin, superadmin', operationId: 'adminUpdatePlayerStatus',
    summary: 'Activate or deactivate an athlete',
    parameters: [pathParam('playerId', 'Athlete id')],
    requestBody: jsonBody(inline({ status: S.str }, ['status'])),
    responses: { 200: ok('Updated', ref('Player')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/players/{playerId}/team', 'put', op({
    tag: 'Admin', roles: 'admin, superadmin', operationId: 'adminAssignPlayerTeam',
    summary: 'Move an athlete to a team',
    parameters: [pathParam('playerId', 'Athlete id')],
    requestBody: jsonBody(inline({ teamId: S.id }, ['teamId'])),
    responses: { 200: ok('Assigned', ref('Player')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/judges', 'get', op({
    tag: 'Judges', roles: 'admin, superadmin, scorer', competitionContext: true, operationId: 'adminGetJudges',
    summary: 'The panel seated for a category',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Seats', { type: 'array', items: ref('Judge') }) },
  }));

  add('/api/admin/judges', 'post', op({
    tag: 'Judges', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminCreateJudge',
    summary: 'Seat one judge',
    description: 'The account must already exist — judges register themselves. Search with `/api/admin/judge-accounts`.',
    requestBody: jsonBody(inline({
      judgeAccount: S.id, judgeType: S.judgeType, judgeNo: S.int,
      gender: S.gender, ageGroup: S.ageGroup,
      competitionTypes: { type: 'array', items: S.competitionType },
      apparatus: S.apparatus,
    }, ['judgeAccount', 'judgeType', 'gender', 'ageGroup'])),
    responses: { 201: ok('Seated', ref('Judge')), ...VALIDATION_ERROR, 409: errorResponse('Seat already filled, or this account already sits on this panel') },
  }));

  add('/api/admin/judges/bulk', 'post', op({
    tag: 'Judges', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminSaveJudgesBulk',
    summary: 'Seat a whole panel',
    description:
      'Refuses a panel missing any of Senior Judge, Judge 1, Judge 2 or Scorer. '
      + 'The panel size (3/4/5) decides the scoring method, so a partial panel would '
      + 'produce a believable score computed the wrong way.',
    requestBody: jsonBody(inline({
      ...categoryBody,
      competition: S.id,
      competitionTypes: { type: 'array', items: S.competitionType },
      apparatus: S.apparatus,
      judges: {
        type: 'array',
        items: inline({ judgeAccount: S.id, judgeType: S.judgeType, judgeNo: S.int }),
      },
    }, ['gender', 'ageGroup', 'judges'])),
    responses: { 200: ok('Panel written', inline({ created: { type: 'array', items: {} }, updated: { type: 'array', items: {} }, errors: { type: 'array', items: {} } })), ...VALIDATION_ERROR },
  }));

  add('/api/admin/judges/summary', 'get', op({
    tag: 'Judges', roles: 'admin, superadmin, scorer', competitionContext: true, operationId: 'adminJudgesSummary',
    summary: 'Panel coverage across every category',
    description: 'Which categories have a complete panel and which are already started.',
    responses: { 200: ok('Summary') },
  }));

  add('/api/admin/judges/{judgeId}', 'put', op({
    tag: 'Judges', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminUpdateJudge',
    summary: 'Change who sits in a seat',
    parameters: [pathParam('judgeId', 'Seat id')],
    requestBody: jsonBody(inline({ judgeAccount: S.id, judgeType: S.judgeType, isActive: S.bool })),
    responses: { 200: ok('Updated', ref('Judge')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/judges/{judgeId}', 'delete', op({
    tag: 'Judges', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminDeleteJudge',
    summary: 'Empty a seat',
    description: 'Removes the person, not the slot.',
    parameters: [pathParam('judgeId', 'Seat id')],
    responses: { 200: ok('Seat emptied'), ...NOT_FOUND },
  }));

  add('/api/admin/judge-accounts', 'get', op({
    tag: 'Judges', roles: 'admin, superadmin', operationId: 'adminSearchJudgeAccounts',
    summary: 'Search registered judges to seat',
    description:
      'An empty result normally means the person has not registered yet — admins cannot '
      + 'create judge logins.\n\n'
      + '**Known defect — matches e-mail only.** The search is written against a `name` '
      + 'field, and JudgeAccount stores `firstName`/`lastName`. Searching a judge\'s '
      + 'actual first name returns nothing; search by e-mail until this is fixed. '
      + 'Terms shorter than 2 characters return an empty list by design.',
    parameters: [queryParam('q', S.str, 'E-mail fragment (see the note on names). Minimum 2 characters.')],
    responses: { 200: ok('Accounts', { type: 'array', items: ref('UserSummary') }) },
  }));

  add('/api/admin/scores/save', 'post', op({
    tag: 'Scores', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminSaveScores',
    summary: 'Write a judge slip or a whole score sheet',
    description: 'Same handler as `/api/judge/scores/save`, `/api/superadmin/scores/save` and `/api/public/save-score`.',
    requestBody: jsonBody(ref('SaveScoreRequest')),
    responses: { 200: ok('Saved', ref('Score')), ...VALIDATION_ERROR },
  }));

  add('/api/admin/scores/team', 'get', op({
    tag: 'Scores', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminTeamScores',
    summary: 'Team-by-team scores for a category',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Teams with scores', { type: 'array', items: {} }) },
  }));

  add('/api/admin/scores/individual', 'get', op({
    tag: 'Scores', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminIndividualScores',
    summary: 'Athlete-by-athlete scores for a category',
    description:
      '**Send `competitionType` in the DISPLAY form here** (`Competition I`), not the '
      + 'slug (`competition_1`). Unlike `/api/admin/scores/team`, this endpoint does '
      + 'not normalize the value before querying, so the slug matches no stored '
      + 'document and the response is an empty list rather than an error.',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Athletes with scores', { type: 'array', items: {} }), ...VALIDATION_ERROR },
  }));

  add('/api/admin/scores/lock', 'put', op({
    tag: 'Scores', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminLockScores',
    summary: 'Lock every score sheet in an age group',
    description: 'A locked sheet is what makes results public.',
    requestBody: jsonBody(inline({ ageGroup: S.ageGroup }, ['ageGroup'])),
    responses: { 200: ok('Locked'), ...VALIDATION_ERROR },
  }));

  add('/api/admin/scores/{scoreId}/unlock', 'put', op({
    tag: 'Scores', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminUnlockScore',
    summary: 'Unlock one score sheet for correction',
    parameters: [pathParam('scoreId', 'Score document id')],
    responses: { 200: ok('Unlocked'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/scores/recalculate', 'post', op({
    tag: 'Scores', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminRecalculateScores',
    summary: 'Recompute every score in an age group',
    description: 'Re-runs the COP calculation over the stored slips. Rewrites each matching document.',
    requestBody: jsonBody(inline({ ageGroup: S.ageGroup }, ['ageGroup'])),
    responses: { 200: ok('Recalculated', inline({ recalculated: S.int })), ...VALIDATION_ERROR },
  }));

  add('/api/admin/rankings/team', 'get', op({
    tag: 'Rankings', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminTeamRankings',
    summary: 'Team rankings',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Rankings', { type: 'array', items: {} }), ...VALIDATION_ERROR },
  }));

  add('/api/admin/scores/team-rankings', 'get', op({
    tag: 'Rankings', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminTeamRankingsAlias',
    summary: 'Team rankings (alias)',
    description: 'Identical to `/api/admin/rankings/team`.',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Rankings', { type: 'array', items: {} }), ...VALIDATION_ERROR },
  }));

  add('/api/admin/rankings/individual', 'get', op({
    tag: 'Rankings', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminIndividualRankings',
    summary: 'Individual rankings',
    parameters: [queryParam('ageGroup', S.ageGroup, 'Age group')],
    responses: { 200: ok('Rankings', { type: 'array', items: {} }), ...VALIDATION_ERROR },
  }));

  add('/api/admin/lots', 'get', op({
    tag: 'Running order', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminGetLots',
    summary: 'The running order for a category',
    parameters: [
      queryParam('gender', S.gender, 'Category gender', true),
      queryParam('ageGroup', S.ageGroup, 'Category age group', true),
      queryParam('competitionType', S.competitionType, 'Competition type', true),
    ],
    responses: { 200: ok('Running order', ref('RunningOrder')), ...VALIDATION_ERROR },
  }));

  add('/api/admin/lots/draw', 'post', op({
    tag: 'Running order', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminDrawLots',
    summary: 'Draw lots',
    description: 'Shuffles the submitted teams and stamps lot numbers. Redrawing replaces the previous draw.',
    requestBody: jsonBody(inline({ ...categoryBody, includePlayers: S.bool }, ['gender', 'ageGroup', 'competitionType'])),
    responses: { 200: ok('Drawn', ref('RunningOrder')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/lots/teams', 'put', op({
    tag: 'Running order', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminSetTeamOrder',
    summary: 'Set the team running order',
    requestBody: jsonBody(inline({ ...categoryBody, teamIds: { type: 'array', items: S.id, minItems: 1, maxItems: 500 } }, ['gender', 'ageGroup', 'competitionType', 'teamIds'])),
    responses: { 200: ok('Order set', ref('RunningOrder')), ...VALIDATION_ERROR },
  }));

  add('/api/admin/lots/players', 'put', op({
    tag: 'Running order', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminSetPlayerOrder',
    summary: 'Set one team\'s athlete order',
    requestBody: jsonBody(inline({ ...categoryBody, teamId: S.id, playerIds: { type: 'array', items: S.id, minItems: 1, maxItems: 500 } }, ['gender', 'ageGroup', 'competitionType', 'teamId', 'playerIds'])),
    responses: { 200: ok('Order set', ref('RunningOrder')), ...VALIDATION_ERROR },
  }));

  add('/api/admin/age-groups/start', 'post', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminStartAgeGroup',
    summary: 'Open a category for scoring',
    description: 'Refuses unless the panel for that category is complete.',
    requestBody: jsonBody(inline(categoryBody, ['gender', 'ageGroup', 'competitionType'])),
    responses: { 200: ok('Started'), ...VALIDATION_ERROR, 409: errorResponse('Panel incomplete, or already started') },
  }));

  add('/api/admin/age-groups/{ageGroup}/end', 'post', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminEndAgeGroup',
    summary: 'Close a category and lock its scores',
    parameters: [pathParam('ageGroup', 'Age group')],
    responses: { 200: ok('Ended'), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/admin/age-groups/status', 'get', op({
    tag: 'Admin', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminAgeGroupStatus',
    summary: 'Which categories are open, started or ended',
    responses: { 200: ok('Status'), ...VALIDATION_ERROR },
  }));

  add('/api/admin/transactions', 'get', op({
    tag: 'Payments', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminTransactions',
    summary: 'Payments, filtered and paginated',
    description:
      'Each row carries `competition.registeredTeams` containing **only that '
      + 'transaction\'s own entry**, with its athletes named. The whole competition '
      + 'used to be embedded on every row — roughly 3 MB each, so a ten-row page ran to '
      + 'tens of megabytes.',
    parameters: [
      ...PAGINATION_QUERY,
      queryParam('status', S.str, 'Payment status'),
      queryParam('startDate', { type: 'string', format: 'date' }, 'Range start'),
      queryParam('endDate', { type: 'string', format: 'date' }, 'Range end'),
      queryParam('teamId', S.id, 'Team'),
      queryParam('coachId', S.id, 'Coach'),
    ],
    responses: { 200: ok('Transactions', inline({ transactions: { type: 'array', items: ref('Transaction') }, total: S.int, page: S.int, pages: S.int })), ...VALIDATION_ERROR },
  }));

  add('/api/admin/transactions/summary', 'get', op({
    tag: 'Payments', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminPaymentSummary',
    summary: 'Payment totals for a competition',
    responses: { 200: ok('Summary'), ...VALIDATION_ERROR },
  }));

  add('/api/admin/transactions/{transactionId}', 'get', op({
    tag: 'Payments', roles: 'admin, superadmin', competitionContext: true, operationId: 'adminTransactionDetails',
    summary: 'One payment',
    parameters: [pathParam('transactionId', 'Transaction id')],
    responses: { 200: ok('Transaction', ref('Transaction')), ...NOT_FOUND },
  }));

  // ===================== Judge =====================

  add('/api/judge/login', 'post', op({
    tag: 'Judge', auth: false, operationId: 'loginJudge',
    summary: 'Judge login',
    description:
      'Rate limited per USERNAME rather than per IP: a whole panel behind one venue '
      + 'NAT address must not throttle itself at sign-in.',
    requestBody: loginBody,
    responses: { 200: ok('Logged in', ref('LoginResponse')), 401: errorResponse('Bad credentials') },
  }));

  add('/api/judge/register', 'post', op({
    tag: 'Judge', auth: false, operationId: 'registerJudge',
    summary: 'Judge self-registration',
    description: 'A new account holds no assignments, and an account with no assignments can read nothing about any competition.',
    requestBody: jsonBody(inline({
      firstName: S.str, lastName: S.str, email: S.email, phone: S.str,
      password: { type: 'string', minLength: 8 },
    }, ['firstName', 'lastName', 'email', 'password'])),
    responses: { 201: ok('Registered', ref('LoginResponse')), ...VALIDATION_ERROR, 409: errorResponse('E-mail already registered') },
  }));

  add('/api/judge/profile', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeProfile',
    summary: 'Own profile',
    responses: { 200: ok('Profile', ref('UserSummary')) },
  }));

  add('/api/judge/profile', 'put', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeUpdateProfile',
    summary: 'Update own profile',
    requestBody: jsonBody(inline({ firstName: S.str, lastName: S.str, phone: S.str })),
    responses: { 200: ok('Updated', ref('UserSummary')), ...VALIDATION_ERROR },
  }));

  add('/api/judge/profile/password', 'put', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeChangePassword',
    summary: 'Change own password',
    requestBody: jsonBody(inline({ currentPassword: S.str, newPassword: { type: 'string', minLength: 8 } }, ['currentPassword', 'newPassword'])),
    responses: { 200: ok('Changed'), ...VALIDATION_ERROR },
  }));

  add('/api/judge/assignments', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeAssignments',
    summary: 'Every panel seat this account holds',
    description: 'Across competitions. The same person is routinely Senior Judge in one category and Judge 2 in another.',
    responses: { 200: ok('Assignments', { type: 'array', items: ref('Judge') }) },
  }));

  add('/api/judge/competitions', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeCompetitions',
    summary: 'Competitions this judge is seated in',
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  }));

  add('/api/judge/competition/{competitionId}', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeCompetitionDetails',
    summary: 'Competition detail for a judge',
    parameters: [pathParam('competitionId', 'Competition id')],
    responses: { 200: ok('Competition', ref('Competition')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/judge/competition/{competitionId}/set', 'put', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeSetCompetition',
    summary: 'Bind the judge session to a competition',
    parameters: [pathParam('competitionId', 'Competition id')],
    responses: { 200: ok('Context set', ref('LoginResponse')), ...VALIDATION_ERROR },
  }));

  // GET /api/judge/teams was RETIRED. It queried Team by competition,
  // ageGroup, gender and isSubmitted — none of them paths on Team — so it
  // returned an empty list to every caller. Use /api/public/submitted-teams,
  // which is what the judge client already calls.

  add('/api/judge/teams/{teamId}/players', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeTeamPlayers',
    summary: 'One team\'s athletes in a category',
    parameters: [pathParam('teamId', 'Team id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Athletes', { type: 'array', items: {} }), ...VALIDATION_ERROR },
  }));

  add('/api/judge/scores', 'post', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeSaveScore',
    summary: 'Submit one athlete\'s slip',
    requestBody: jsonBody(ref('SaveScoreRequest')),
    responses: { 200: ok('Saved', ref('Score')), ...VALIDATION_ERROR },
  }));

  add('/api/judge/scores/{scoreId}', 'put', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeUpdateScore',
    summary: 'Revise a slip',
    description: 'Refused once the Senior Judge has finalized that athlete.',
    parameters: [pathParam('scoreId', 'Score document id')],
    requestBody: jsonBody(ref('SaveScoreRequest')),
    responses: { 200: ok('Updated', ref('Score')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/judge/scores/my', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeMyScores',
    summary: 'Slips this judge has submitted',
    responses: { 200: ok('Slips', { type: 'array', items: {} }) },
  }));

  add('/api/judge/scores/save', 'post', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeSaveScores',
    summary: 'Write a slip or a score sheet (shared handler)',
    description:
      'The panel seat written is resolved from the caller\'s own assignment for THIS '
      + 'category — never from the body. `isFinalSubmit` is refused unless the caller '
      + 'is the Senior Judge.',
    requestBody: jsonBody(ref('SaveScoreRequest')),
    responses: { 200: ok('Saved', ref('Score')), ...VALIDATION_ERROR },
  }));

  add('/api/judge/scores/team', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgeTeamScores',
    summary: 'Team scores (Scorer interface)',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Teams with scores', { type: 'array', items: {} }) },
  }));

  add('/api/judge/judges', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgePanel',
    summary: 'The panel this judge sits on',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Seats', { type: 'array', items: ref('Judge') }) },
  }));

  add('/api/judge/judges/summary', 'get', op({
    tag: 'Judge', roles: 'judge', operationId: 'judgePanelSummary',
    summary: 'Panel coverage summary',
    responses: { 200: ok('Summary') },
  }));

  add('/api/judge/lots', 'get', op({
    tag: 'Running order', roles: 'judge (any seat)', operationId: 'judgeGetLots',
    summary: 'Read the running order',
    description: 'Every judge on the panel can read the order they are judging to; only the Senior Judge and Scorer can change it.',
    parameters: [
      queryParam('gender', S.gender, 'Category gender', true),
      queryParam('ageGroup', S.ageGroup, 'Category age group', true),
      queryParam('competitionType', S.competitionType, 'Competition type', true),
    ],
    responses: { 200: ok('Running order', ref('RunningOrder')), ...VALIDATION_ERROR },
  }));

  add('/api/judge/lots/teams', 'put', op({
    tag: 'Running order', roles: 'Senior Judge or Scorer of THIS panel', operationId: 'judgeSetTeamOrder',
    summary: 'Re-sequence the teams',
    description: 'Two checks: the role guard, then a service-side assertion that the caller is seated on the category being reordered.',
    requestBody: jsonBody(inline({ ...categoryBody, teamIds: { type: 'array', items: S.id } }, ['gender', 'ageGroup', 'competitionType', 'teamIds'])),
    responses: { 200: ok('Order set', ref('RunningOrder')), ...VALIDATION_ERROR },
  }));

  add('/api/judge/lots/players', 'put', op({
    tag: 'Running order', roles: 'Senior Judge or Scorer of THIS panel', operationId: 'judgeSetPlayerOrder',
    summary: 'Re-sequence one team\'s athletes',
    requestBody: jsonBody(inline({ ...categoryBody, teamId: S.id, playerIds: { type: 'array', items: S.id } }, ['gender', 'ageGroup', 'competitionType', 'teamId', 'playerIds'])),
    responses: { 200: ok('Order set', ref('RunningOrder')), ...VALIDATION_ERROR },
  }));

  // ===================== Scoring (generic CRUD) =====================

  add('/api/scoring', 'post', op({
    tag: 'Scores', roles: 'judge', operationId: 'submitScore',
    summary: 'Create a score document',
    requestBody: jsonBody(ref('Score')),
    responses: { 201: ok('Created', ref('Score')), ...VALIDATION_ERROR },
  }));

  add('/api/scoring/{scoreId}', 'get', op({
    tag: 'Scores', operationId: 'getScore',
    summary: 'Score document by id',
    parameters: [pathParam('scoreId', 'Score document id')],
    responses: { 200: ok('Score', ref('Score')), ...NOT_FOUND },
  }));

  add('/api/scoring/{scoreId}', 'put', op({
    tag: 'Scores', roles: 'judge', operationId: 'updateScoreDoc',
    summary: 'Update a score document',
    parameters: [pathParam('scoreId', 'Score document id')],
    requestBody: jsonBody(ref('Score')),
    responses: { 200: ok('Updated', ref('Score')), ...VALIDATION_ERROR, ...NOT_FOUND },
  }));

  add('/api/scoring/{scoreId}', 'delete', op({
    tag: 'Scores', roles: 'admin, superadmin', operationId: 'deleteScore',
    summary: 'Delete a score document',
    parameters: [pathParam('scoreId', 'Score document id')],
    responses: { 200: ok('Deleted'), ...NOT_FOUND },
  }));

  add('/api/scoring/{scoreId}/lock', 'patch', op({
    tag: 'Scores', roles: 'admin, superadmin', operationId: 'lockScoreDoc',
    summary: 'Lock a score document',
    parameters: [pathParam('scoreId', 'Score document id')],
    responses: { 200: ok('Locked', ref('Score')), ...NOT_FOUND },
  }));

  add('/api/scoring/{scoreId}/unlock', 'patch', op({
    tag: 'Scores', roles: 'admin, superadmin', operationId: 'unlockScoreDoc',
    summary: 'Unlock a score document',
    parameters: [pathParam('scoreId', 'Score document id')],
    responses: { 200: ok('Unlocked', ref('Score')), ...NOT_FOUND },
  }));

  add('/api/scoring/competition/{competitionId}', 'get', op({
    tag: 'Scores', operationId: 'scoresByCompetition',
    summary: 'Every score document in a competition',
    description: 'Unpaginated. Cost grows linearly with the number of score sheets written.',
    parameters: [pathParam('competitionId', 'Competition id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Scores', { type: 'array', items: ref('Score') }), ...VALIDATION_ERROR },
  }));

  // ===================== Public =====================

  add('/api/public/competitions', 'get', op({
    tag: 'Public', auth: false, operationId: 'publicCompetitions',
    summary: 'Competitions for the public site',
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  }));

  add('/api/public/cop-rules', 'get', op({
    tag: 'Public', auth: false, operationId: 'publicCopRules',
    summary: 'The COP scoring constants',
    description:
      'Ceilings, element values, difficulty mixes, tolerance tiers, the 90s '
      + 'time-deduction table and the per-apparatus combination checklists. Anonymous '
      + 'on purpose: it is reference data with no competition, team or athlete in it, '
      + 'and the judge client needs it before a session exists.',
    responses: { 200: ok('COP rules') },
  }));

  add('/api/public/teams', 'get', op({
    tag: 'Public', auth: false, operationId: 'publicTeams',
    summary: 'Submitted teams for the public score filters',
    description: 'The parameter is `competitionId`. Omitting it returns an empty list, not every team.',
    parameters: [queryParam('competitionId', S.id, 'Competition id')],
    responses: { 200: ok('Teams', { type: 'array', items: ref('SubmittedTeam') }), ...VALIDATION_ERROR },
  }));

  add('/api/public/scores', 'get', op({
    tag: 'Public', auth: false, operationId: 'publicScores',
    summary: 'Published results',
    description:
      'Two gates: the Scorer has LOCKED the sheet, and the Senior Judge has finalized '
      + 'that athlete. The second is applied per row — locking a sheet does not '
      + 'retroactively publish a performer nobody signed off.\n\n'
      + '`competitionId` is **required**. It used to be optional, and omitting it '
      + 'returned every published score in the database — 19.5 MB on one 1000-team '
      + 'meet, with no bound across competitions.\n\n'
      + 'Each `judgeSlips[]` entry carries its section totals but **not** its '
      + '`breakdown` (the A/B/C element counts and combination checklist). That exists '
      + 'so the judge who wrote a slip can re-open it for edit, and is 43% of a row.',
    parameters: [
      queryParam('competitionId', S.id, 'Competition id', true),
      queryParam('teamId', S.id, 'Restrict to one team\'s athletes'),
      ...CATEGORY_QUERY,
    ],
    responses: { 200: ok('Published scores', { type: 'array', items: ref('Score') }), ...VALIDATION_ERROR },
  }));

  add('/api/public/judges', 'get', op({
    tag: 'Public', roles: 'judge, admin, superadmin', operationId: 'publicJudges',
    summary: 'The panel for a category',
    description: 'Under `/api/public` for backward compatibility with the deployed judge client, but NOT public — 401 when anonymous.',
    parameters: CATEGORY_QUERY,
    responses: { 200: ok('Seats', { type: 'array', items: ref('Judge') }) },
  }));

  add('/api/public/submitted-teams', 'get', op({
    tag: 'Public', roles: 'judge, admin, superadmin', operationId: 'publicSubmittedTeams',
    summary: 'Submitted teams',
    description:
      'Under `/api/public` for backward compatibility, but NOT public — 401 when anonymous.\n\n'
      + 'Accepts either `competition` or `competitionId`, and falls back to the '
      + 'competition in the token.',
    parameters: [
      queryParam('competition', S.id, 'Competition id'),
      queryParam('competitionId', S.id, 'Competition id (alternative spelling)'),
      ...CATEGORY_QUERY,
    ],
    responses: { 200: ok('Teams', { type: 'array', items: ref('SubmittedTeam') }) },
  }));

  add('/api/public/save-score', 'post', op({
    tag: 'Public', roles: 'judge, admin, superadmin', operationId: 'publicSaveScore',
    summary: 'Write a judge slip',
    description: 'Under `/api/public` for backward compatibility, but NOT public — 401 when anonymous.',
    requestBody: jsonBody(ref('SaveScoreRequest')),
    responses: { 200: ok('Saved', ref('Score')), ...VALIDATION_ERROR },
  }));

  add('/api/public/payments/razorpay/webhook', 'post', op({
    tag: 'Payments', auth: false, operationId: 'razorpayWebhookPublic',
    summary: 'Razorpay webhook',
    description: 'Authenticated by HMAC signature over the raw body, not by a session.',
    parameters: [{ name: 'X-Razorpay-Signature', in: 'header', required: true, schema: S.str, description: 'HMAC-SHA256 of the raw body' }],
    requestBody: jsonBody({ type: 'object', additionalProperties: true }),
    responses: { 200: ok('Reconciled'), 400: errorResponse('Signature mismatch or malformed payload') },
  }));

  add('/api/webhooks/razorpay', 'post', op({
    tag: 'Payments', auth: false, operationId: 'razorpayWebhook',
    summary: 'Razorpay webhook (preferred path)',
    description: 'Same handler as `/api/public/payments/razorpay/webhook`.',
    parameters: [{ name: 'X-Razorpay-Signature', in: 'header', required: true, schema: S.str, description: 'HMAC-SHA256 of the raw body' }],
    requestBody: jsonBody({ type: 'object', additionalProperties: true }),
    responses: { 200: ok('Reconciled'), 400: errorResponse('Signature mismatch or malformed payload') },
  }));

  // ===================== Super admin =====================

  const sa = (path, method, config) => add(path, method, op({
    tag: 'Super admin', roles: 'superadmin', ...config,
  }));

  sa('/api/superadmin/login', 'post', {
    auth: false, operationId: 'loginSuperAdmin',
    summary: 'Super admin login',
    requestBody: loginBody,
    responses: { 200: ok('Logged in', ref('LoginResponse')), 401: errorResponse('Bad credentials') },
  });

  sa('/api/superadmin/dashboard', 'get', {
    operationId: 'superAdminDashboard', summary: 'Platform dashboard',
    responses: { 200: ok('Dashboard') },
  });

  sa('/api/superadmin/stats', 'get', {
    operationId: 'superAdminStats', summary: 'Platform-wide counts',
    responses: { 200: ok('Stats') },
  });

  sa('/api/superadmin/admins', 'get', {
    operationId: 'superAdminListAdmins', summary: 'All admins',
    responses: { 200: ok('Admins', { type: 'array', items: ref('UserSummary') }) },
  });

  sa('/api/superadmin/admins', 'post', {
    operationId: 'superAdminCreateAdmin', summary: 'Create an admin',
    description: 'The Admin model carries a single `name`, not the `firstName`/`lastName` pair the other person models use.',
    requestBody: jsonBody(inline({ name: S.str, email: S.email, password: S.str, role: { type: 'string', enum: ['admin', 'superadmin'] } }, ['name', 'email', 'password'])),
    responses: { 201: ok('Created', ref('UserSummary')), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/admins/{adminId}', 'put', {
    operationId: 'superAdminUpdateAdmin', summary: 'Update an admin',
    parameters: [pathParam('adminId', 'Admin id')],
    requestBody: jsonBody(inline({ name: S.str, email: S.email, isActive: S.bool })),
    responses: { 200: ok('Updated', ref('UserSummary')), ...VALIDATION_ERROR, ...NOT_FOUND },
  });

  sa('/api/superadmin/admins/{adminId}', 'delete', {
    operationId: 'superAdminDeleteAdmin', summary: 'Delete an admin',
    parameters: [pathParam('adminId', 'Admin id')],
    responses: { 200: ok('Deleted'), ...NOT_FOUND },
  });

  sa('/api/superadmin/coaches', 'get', {
    operationId: 'superAdminListCoaches', summary: 'All coaches',
    responses: { 200: ok('Coaches', { type: 'array', items: ref('UserSummary') }) },
  });

  sa('/api/superadmin/coaches/{coachId}/status', 'put', {
    operationId: 'superAdminCoachStatus', summary: 'Activate or deactivate a coach',
    parameters: [pathParam('coachId', 'Coach id')],
    requestBody: jsonBody(inline({ isActive: S.bool }, ['isActive'])),
    responses: { 200: ok('Updated'), ...VALIDATION_ERROR, ...NOT_FOUND },
  });

  sa('/api/superadmin/teams', 'get', {
    operationId: 'superAdminListTeams', summary: 'All teams',
    responses: { 200: ok('Teams', { type: 'array', items: ref('Team') }) },
  });

  sa('/api/superadmin/teams/submitted', 'get', {
    operationId: 'superAdminSubmittedTeams', summary: 'Submitted teams',
    parameters: [queryParam('competition', S.id, 'Competition id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Teams', { type: 'array', items: ref('SubmittedTeam') }) },
  });

  sa('/api/superadmin/submitted-teams', 'get', {
    operationId: 'superAdminSubmittedTeamsAlias', summary: 'Submitted teams (alias)',
    parameters: [queryParam('competition', S.id, 'Competition id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Teams', { type: 'array', items: ref('SubmittedTeam') }) },
  });

  sa('/api/superadmin/teams/{teamId}', 'get', {
    operationId: 'superAdminTeamDetails', summary: 'Team detail',
    parameters: [pathParam('teamId', 'Team id')],
    responses: { 200: ok('Team', ref('Team')), ...NOT_FOUND },
  });

  sa('/api/superadmin/teams/{teamId}', 'delete', {
    operationId: 'superAdminDeleteTeam', summary: 'Delete a team',
    parameters: [pathParam('teamId', 'Team id')],
    responses: { 200: ok('Deleted'), ...NOT_FOUND },
  });

  sa('/api/superadmin/competitions', 'get', {
    operationId: 'superAdminListCompetitions', summary: 'All competitions',
    responses: { 200: ok('Competitions', { type: 'array', items: ref('Competition') }) },
  });

  sa('/api/superadmin/competitions', 'post', {
    operationId: 'superAdminCreateCompetition', summary: 'Create a competition',
    requestBody: jsonBody(ref('Competition')),
    responses: { 201: ok('Created', ref('Competition')), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/competitions/{id}', 'get', {
    operationId: 'superAdminGetCompetition', summary: 'Competition by id',
    parameters: [pathParam('id', 'Competition id')],
    responses: { 200: ok('Competition', ref('Competition')), ...NOT_FOUND },
  });

  sa('/api/superadmin/competitions/{id}', 'put', {
    operationId: 'superAdminUpdateCompetition', summary: 'Update a competition',
    parameters: [pathParam('id', 'Competition id')],
    requestBody: jsonBody(ref('Competition')),
    responses: { 200: ok('Updated', ref('Competition')), ...VALIDATION_ERROR, ...NOT_FOUND },
  });

  sa('/api/superadmin/competitions/{id}', 'delete', {
    operationId: 'superAdminDeleteCompetition', summary: 'Delete a competition',
    parameters: [pathParam('id', 'Competition id')],
    responses: { 200: ok('Deleted'), ...NOT_FOUND },
  });

  sa('/api/superadmin/competitions/{id}/admins', 'post', {
    operationId: 'superAdminAssignAdmin', summary: 'Assign an admin to a competition',
    parameters: [pathParam('id', 'Competition id')],
    requestBody: jsonBody(inline({ adminId: S.id }, ['adminId'])),
    responses: { 200: ok('Assigned'), ...VALIDATION_ERROR, ...NOT_FOUND },
  });

  sa('/api/superadmin/competitions/{id}/admins/{adminId}', 'delete', {
    operationId: 'superAdminRemoveAdmin', summary: 'Remove an admin from a competition',
    parameters: [pathParam('id', 'Competition id'), pathParam('adminId', 'Admin id')],
    responses: { 200: ok('Removed'), ...NOT_FOUND },
  });

  sa('/api/superadmin/players/add', 'post', {
    operationId: 'superAdminAddPlayer', summary: 'Add an athlete to an entry directly',
    requestBody: jsonBody(inline({ competitionId: S.id, teamId: S.id, playerId: S.id, ageGroup: S.ageGroup, gender: S.gender })),
    responses: { 200: ok('Added'), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/players/payment/create', 'post', {
    operationId: 'superAdminCreatePlayerPayment', summary: 'Create a per-athlete payment order',
    requestBody: jsonBody(inline({ competitionId: S.id, teamId: S.id, playerId: S.id })),
    responses: { 200: ok('Order created'), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/players/payment/verify', 'post', {
    operationId: 'superAdminVerifyPlayerPayment', summary: 'Verify a per-athlete payment and add the athlete',
    requestBody: jsonBody(inline({ razorpay_order_id: S.str, razorpay_payment_id: S.str, razorpay_signature: S.str })),
    responses: { 200: ok('Verified'), ...VALIDATION_ERROR, 402: errorResponse('Payment verification failed') },
  });

  sa('/api/superadmin/transactions', 'get', {
    operationId: 'superAdminTransactions', summary: 'All payments',
    parameters: PAGINATION_QUERY,
    responses: { 200: ok('Transactions', { type: 'array', items: ref('Transaction') }) },
  });

  sa('/api/superadmin/judges', 'get', {
    operationId: 'superAdminGetJudges', summary: 'The panel for a category',
    parameters: [queryParam('competition', S.id, 'Competition id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Seats', { type: 'array', items: ref('Judge') }) },
  });

  sa('/api/superadmin/judges', 'post', {
    operationId: 'superAdminCreateJudge', summary: 'Seat one judge',
    requestBody: jsonBody(inline({ competition: S.id, judgeAccount: S.id, judgeType: S.judgeType, gender: S.gender, ageGroup: S.ageGroup })),
    responses: { 201: ok('Seated', ref('Judge')), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/judges/bulk', 'post', {
    operationId: 'superAdminSaveJudgesBulk', summary: 'Seat a whole panel',
    requestBody: jsonBody(inline({ competition: S.id, ...categoryBody, judges: { type: 'array', items: {} } })),
    responses: { 200: ok('Panel written'), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/judges/{judgeId}', 'put', {
    operationId: 'superAdminUpdateJudge', summary: 'Change who sits in a seat',
    parameters: [pathParam('judgeId', 'Seat id')],
    requestBody: jsonBody(inline({ judgeAccount: S.id, judgeType: S.judgeType })),
    responses: { 200: ok('Updated', ref('Judge')), ...VALIDATION_ERROR, ...NOT_FOUND },
  });

  sa('/api/superadmin/judges/{judgeId}', 'delete', {
    operationId: 'superAdminDeleteJudge', summary: 'Empty a seat',
    parameters: [pathParam('judgeId', 'Seat id')],
    responses: { 200: ok('Seat emptied'), ...NOT_FOUND },
  });

  sa('/api/superadmin/judge-accounts', 'get', {
    operationId: 'superAdminSearchJudgeAccounts', summary: 'Search registered judges',
    parameters: [queryParam('q', S.str, 'Name or e-mail fragment')],
    responses: { 200: ok('Accounts', { type: 'array', items: ref('UserSummary') }) },
  });

  sa('/api/superadmin/judges/summary', 'get', {
    operationId: 'superAdminJudgesSummary', summary: 'Panel coverage',
    parameters: [queryParam('competition', S.id, 'Competition id')],
    responses: { 200: ok('Summary') },
  });

  sa('/api/superadmin/scores/team', 'get', {
    operationId: 'superAdminTeamScores', summary: 'Team scores',
    parameters: [queryParam('competition', S.id, 'Competition id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Teams with scores', { type: 'array', items: {} }) },
  });

  sa('/api/superadmin/scores/individual', 'get', {
    operationId: 'superAdminIndividualScores', summary: 'Individual scores',
    parameters: [queryParam('competition', S.id, 'Competition id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Athletes with scores', { type: 'array', items: {} }) },
  });

  sa('/api/superadmin/scores/team-rankings', 'get', {
    operationId: 'superAdminTeamRankings', summary: 'Team rankings',
    parameters: [queryParam('competition', S.id, 'Competition id'), ...CATEGORY_QUERY],
    responses: { 200: ok('Rankings', { type: 'array', items: {} }) },
  });

  sa('/api/superadmin/scores/save', 'post', {
    operationId: 'superAdminSaveScores', summary: 'Write a slip or a score sheet',
    requestBody: jsonBody(ref('SaveScoreRequest')),
    responses: { 200: ok('Saved', ref('Score')), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/scores/recalculate', 'post', {
    operationId: 'superAdminRecalculateScores', summary: 'Recompute an age group',
    requestBody: jsonBody(inline({ competitionId: S.id, ageGroup: S.ageGroup })),
    responses: { 200: ok('Recalculated'), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/scores/{scoreId}/lock', 'put', {
    operationId: 'superAdminLockScore', summary: 'Lock a score sheet',
    parameters: [pathParam('scoreId', 'Score document id')],
    responses: { 200: ok('Locked'), ...NOT_FOUND },
  });

  sa('/api/superadmin/scores/{scoreId}/unlock', 'put', {
    operationId: 'superAdminUnlockScore', summary: 'Unlock a score sheet',
    parameters: [pathParam('scoreId', 'Score document id')],
    responses: { 200: ok('Unlocked'), ...NOT_FOUND },
  });

  sa('/api/superadmin/age-groups/start', 'post', {
    operationId: 'superAdminStartAgeGroup', summary: 'Open a category for scoring',
    requestBody: jsonBody(inline({ competitionId: S.id, ...categoryBody })),
    responses: { 200: ok('Started'), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/competition/age-group/start', 'post', {
    operationId: 'superAdminStartAgeGroupAlias', summary: 'Open a category for scoring (alias)',
    requestBody: jsonBody(inline({ competitionId: S.id, ...categoryBody })),
    responses: { 200: ok('Started'), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/lots', 'get', {
    tag: 'Running order', operationId: 'superAdminGetLots', summary: 'Running order',
    parameters: [
      queryParam('competitionId', S.id, 'Competition id', true),
      queryParam('gender', S.gender, 'Category gender', true),
      queryParam('ageGroup', S.ageGroup, 'Category age group', true),
      queryParam('competitionType', S.competitionType, 'Competition type', true),
    ],
    responses: { 200: ok('Running order', ref('RunningOrder')), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/lots/draw', 'post', {
    tag: 'Running order', operationId: 'superAdminDrawLots', summary: 'Draw lots',
    requestBody: jsonBody(inline({ competitionId: S.id, ...categoryBody, includePlayers: S.bool })),
    responses: { 200: ok('Drawn', ref('RunningOrder')), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/lots/teams', 'put', {
    tag: 'Running order', operationId: 'superAdminSetTeamOrder', summary: 'Set the team order',
    requestBody: jsonBody(inline({ competitionId: S.id, ...categoryBody, teamIds: { type: 'array', items: S.id } })),
    responses: { 200: ok('Order set', ref('RunningOrder')), ...VALIDATION_ERROR },
  });

  sa('/api/superadmin/lots/players', 'put', {
    tag: 'Running order', operationId: 'superAdminSetPlayerOrder', summary: 'Set one team\'s athlete order',
    requestBody: jsonBody(inline({ competitionId: S.id, ...categoryBody, teamId: S.id, playerIds: { type: 'array', items: S.id } })),
    responses: { 200: ok('Order set', ref('RunningOrder')), ...VALIDATION_ERROR },
  });

  return paths;
}
/* eslint-enable max-lines-per-function */

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * @param {Object} [options]
 * @param {string} [options.serverUrl] - the deployment to point "Try it out" at
 * @returns {Object} an OpenAPI 3.0.3 document
 */
function buildOpenApiDocument({ serverUrl = 'http://localhost:5000' } = {}) {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Mallakhamb Competition API',
      version: '1.0.0',
      description: [
        'Competition management for Mallakhamb India: registration, squad entry,',
        'payment, panel seating, live judging and results.',
        '',
        '### Versioning',
        'Every path is served at BOTH `/api/v1/...` and `/api/...`. The unversioned',
        'form is an alias kept for the deployed client and should be retired one',
        'release after clients move over. Only the unversioned form is listed here;',
        'prefix it with `/v1` for the versioned equivalent.',
        '',
        '### Authentication',
        'Login sets httpOnly `access_token` and `refresh_token` cookies AND returns',
        'the access token in the body. Browser clients should rely on the cookies.',
        'Non-browser clients send `Authorization: Bearer <token>`.',
        '',
        '### CSRF',
        'Cookie-authenticated state-changing requests must carry `X-CSRF-Token`,',
        'fetched from `GET /api/csrf-token`. Requests carrying an `Authorization:',
        'Bearer` header are exempt, because a cross-site attacker cannot set headers.',
        '',
        '### Competition context',
        'Most admin, coach and judge routes act inside ONE competition. The id is',
        'resolved from the access token first (set it with `POST',
        '/api/auth/set-competition`), then the `X-Competition-Id` header, then',
        '`competitionId` in the body or query. Routes that require it are marked, and',
        'return `COMPETITION_CONTEXT_REQUIRED` when none is found.',
        '',
        '### Errors',
        'Failures are `{ success: false, error: { message, code, details? } }`.',
        '`details` maps a field name to its message on a validation failure.',
      ].join('\n'),
      contact: { name: 'Mallakhamb India' },
    },
    servers: [
      { url: serverUrl, description: 'Unversioned alias — /api/...' },
      { url: `${serverUrl}/v1`, description: 'Versioned — /api/v1/... (prepend to the paths below)' },
    ],
    tags: [
      { name: 'Health', description: 'Probes and metrics' },
      { name: 'Auth', description: 'Sessions, CSRF, password reset, competition context' },
      { name: 'Players', description: 'Athlete registration and self-service' },
      { name: 'Coaches', description: 'Squad building, entry and payment' },
      { name: 'Teams', description: 'Team CRUD' },
      { name: 'Competitions', description: 'Competition CRUD and entries' },
      { name: 'Admin', description: 'Competition administration' },
      { name: 'Judges', description: 'Panel seating' },
      { name: 'Judge', description: 'The judge-facing scoring client' },
      { name: 'Scores', description: 'Score sheets and judge slips' },
      { name: 'Rankings', description: 'Computed standings' },
      { name: 'Running order', description: 'Lot draw and sequencing' },
      { name: 'Payments', description: 'Razorpay orders, reconciliation and reporting' },
      { name: 'Public', description: 'Anonymous endpoints for the public site' },
      { name: 'Super admin', description: 'Platform-wide administration' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
          description: 'Also exempts the request from CSRF checking.',
        },
        cookieAuth: {
          type: 'apiKey', in: 'cookie', name: 'access_token',
          description: 'Set by any login endpoint. Requires `X-CSRF-Token` on writes.',
        },
      },
      schemas,
    },
    paths: buildPaths(),
  };
}

module.exports = { buildOpenApiDocument, buildPaths };
