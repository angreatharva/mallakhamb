/**
 * Talking to the admin API from a script, the way a browser would.
 *
 * `seatPanel.js` and `seatPanels.js` both need the same four things — a cookie
 * jar, a CSRF token, an admin session and a competition looked up by place —
 * and both used to carry their own copy. Two copies of a cookie parser is two
 * places to fix the next time the auth shape moves, so it lives here once.
 *
 * Everything goes through the real HTTP API rather than Mongoose on purpose:
 * the rules about panels (the four required seats, one person one seat, the
 * competition scoping) live in the service layer, and a script that wrote
 * documents itself would be free to create a panel the app would have refused.
 */

// 127.0.0.1 rather than localhost: on Windows, Node's fetch resolves localhost
// to ::1 while the API listens on IPv4, and the only symptom is "fetch failed".
const API = process.env.SEED_API_URL || 'http://127.0.0.1:5000/api';

/** judgeNo per seat, matching the admin screen's fixed slot order. */
const SLOT_NO = {
  'Senior Judge': 1,
  'Judge 1': 2,
  'Judge 2': 3,
  'Judge 3': 4,
  'Judge 4': 5,
  Scorer: 6,
};

/** The four seats POST /admin/judges/bulk refuses a panel without. */
const REQUIRED_SEATS = ['Senior Judge', 'Judge 1', 'Judge 2', 'Scorer'];

/** Cookies survive between calls the way a browser's jar would. */
const jar = new Map();

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

const remember = (response) => {
  for (const raw of response.headers.getSetCookie?.() || []) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
};

/**
 * One API call, with the cookie jar and the error detail a bare fetch loses.
 *
 * @param {string} path - e.g. '/admin/judges/bulk'
 * @param {{method?: string, body?: Object, csrfToken?: string, competitionId?: string}} [options]
 * @returns {Promise<any>} the parsed response body
 */
async function call(path, { method = 'GET', body, csrfToken, competitionId } = {}) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader() ? { Cookie: cookieHeader() } : {}),
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...(competitionId ? { 'X-Competition-Id': competitionId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // A bare "fetch failed" says nothing about which call died.
    throw new Error(`${method} ${path} → ${error.cause?.code || error.message}`);
  }
  remember(response);

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || text.slice(0, 300);
    throw new Error(`${method} ${path} → ${response.status}: ${detail}`);
  }
  return payload;
}

/**
 * The admin password, refused rather than defaulted.
 *
 * `createAdmin.js` publishes the local pair, so this is not a secret so much as
 * a safety catch: these scripts seat and unseat panels, and SEED_API_URL can
 * point anywhere. Requiring the password to be passed per run means nobody
 * reseats a live meet by forgetting which environment they were aimed at.
 */
function requireAdminPassword(script) {
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) {
    console.error('❌ SEED_ADMIN_PASSWORD is not set.');
    console.error('   Pass it for one run — these scripts write panels to whatever');
    console.error(`   SEED_API_URL points at (${API}):`);
    console.error(`     SEED_ADMIN_PASSWORD=... node scripts/${script}`);
    process.exit(1);
  }
  return password;
}

/**
 * Fetch a CSRF token and sign in as the admin.
 *
 * Each role has its own login route; there is no shared /auth/login.
 *
 * @param {string} script - this script's filename, for the error message
 * @returns {Promise<string>} the CSRF token every later write must echo
 */
async function signInAsAdmin(script) {
  const password = requireAdminPassword(script);
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@gmail.com';

  // The double-submit cookie: fetch the token, then echo it on every write.
  const { csrfToken } = await call('/csrf-token');
  await call('/admin/login', { method: 'POST', csrfToken, body: { email, password } });
  console.log(`✅ Signed in as ${email}`);
  return csrfToken;
}

/**
 * The meet, looked up by place.
 *
 * The seeded meets share a name and a year and differ only by place, so the
 * place is the only thing that identifies one.
 *
 * @param {string} [place] - omit to take the first competition
 */
async function findCompetition(place) {
  const competitions = await call('/competitions');
  const list = competitions.data?.competitions || competitions.data || [];
  const found = place ? list.find((c) => c.place === place) : list[0];
  if (!found) {
    throw new Error(
      `No competition${place ? ` in ${place}` : ''}. Known: ${list.map((c) => c.place).join(', ')}`
    );
  }
  return found;
}

/**
 * Resolve judge accounts by email, one address at a time.
 *
 * The panel payload references accounts by id, and an id is the one thing a
 * human cannot supply from a roster. Searched singly the way the admin screen's
 * box does: the endpoint is a search, not a listing, and returns nothing for a
 * blank term.
 *
 * @param {Object<string, string>} seats - seat name → email
 * @returns {Promise<Object<string, string>>} seat name → account id
 */
async function resolveSeatAccounts(seats) {
  const accountId = {};
  for (const [seat, address] of Object.entries(seats)) {
    const email = String(address).toLowerCase();
    const found = await call(`/admin/judge-accounts?q=${encodeURIComponent(email)}`);
    const matches = found.data?.accounts || found.data || [];
    const account = matches.find((a) => String(a.email).toLowerCase() === email);
    if (!account) {
      throw new Error(
        `No registered judge ${email} — they have to hold an account before they can be seated`
      );
    }
    accountId[seat] = account._id;
  }
  return accountId;
}

module.exports = {
  API,
  SLOT_NO,
  REQUIRED_SEATS,
  call,
  signInAsAdmin,
  findCompetition,
  resolveSeatAccounts,
};
