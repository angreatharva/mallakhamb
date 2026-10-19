---
doc: 09-REALTIME
covers:
  - src/pages/judge/JudgeDashboard.jsx
  - src/pages/judge/JudgeSequence.jsx
  - src/pages/judge/JudgeTeamPlayers.jsx
  - src/pages/judge/ScorerScoring.jsx
  - src/pages/judge/useJudgePanelData.js
  - src/pages/admin/AdminScoring.jsx
read_when: "adding or debugging any socket.io-client usage — live scoring, running-order pushes, panel sync"
depends_on: [08-API-INTEGRATION, 11-SCORING-CLIENT]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

## No shared socket context — seven independent connections, one copy-pasted pattern

There is **no `SocketContext`/`useSocket` hook anywhere in `Web/src`**
(confirmed by exhaustive grep — zero matches). Seven files each
independently open their own `socket.io-client` connection in a
`useEffect`, with `socket.disconnect()` in the cleanup, duplicating the
same connect/auth/room-join boilerplate:

- `src/pages/judge/JudgeDashboard.jsx`
- `src/pages/judge/JudgeSequence.jsx`
- `src/pages/judge/JudgeTeamPlayers.jsx`
- `src/pages/judge/ScorerScoring.jsx`
- `src/pages/judge/useJudgePanelData.js` (a hook, backing the live panel-review view)
- `src/pages/admin/AdminScoring.jsx` (also serves `/superadmin/scoring` via `routePrefix`)
- `src/pages/judge/TimeKeeperScoring.jsx` (the Time Keeper's stopwatch, 2026-09-26)

If you're adding an eighth live-scoring surface, there is no shared
primitive to reach for — you'll copy one of these seven. That's a real gap
worth knowing about before assuming a `useSocket()` hook exists.

## Connection setup — identical across all seven

```js
const socketUrl = apiConfig.getSocketUrl();   // src/config/api.config.js
const token = secureStorage.getItem('judge_token' /* or role-derived key */);
const socket = io(socketUrl, { auth: { token }, withCredentials: true });
```

`getSocketUrl()` is the base URL minus its **trailing** `/api`
(`baseUrl.replace(/\/api\/?$/, '')`). **Fixed 2026-10-15** (`3c628e1`, deploy
F1 / C1.1): every surface used to build it with `.replace('/api', '')`, which
removes the FIRST `/api` — an `api.` host (`https://api.<domain>/api`) became
`https:/.<domain>/api` and every live-scoring socket broke. All seven files use it
now. `grep -rn "replace('/api'"
src` should only find the explanatory comment in `api.config.js`; never
reintroduce a hand-built socket URL.

Auth rides the `auth: { token }` handshake payload (a JWT), matching the
server's JWT socket auth. **`AdminScoring.jsx` derives its storage key
via `getRoleFromPath(routePrefix)`** specifically to avoid the shipped
bug documented in
[10-AUTH-AND-SECURITY.md](10-AUTH-AND-SECURITY.md#rolefrompathjs--the-one-source-for-pathrole-mapping) —
`/superadmin/scoring` used to read the empty `admin_token` key instead
of `superadmin_token`, so a superadmin's live-scoring handshake went out
unauthenticated. Any new socket-using screen should derive its storage
key the same way, never by hand-rolling a role comparison.

## Emitted events (client → server)

- **`join_scoring_room`** with `{ roomId }` — all seven files, on
  `connect`. The room id is always built client-side as
  `` `scoring_${gender}_${ageGroup}_${competitionType}` `` — **category-scoped**,
  not competition-id scoped. This is a *separate* room from the
  per-competition room (`competition_${id}`) the server auto-joins a
  socket into at handshake time based on the JWT (see
  [Server/MEMORY/08-REALTIME-SOCKETS.md](../../Server/MEMORY/08-REALTIME-SOCKETS.md) —
  a socket can be a member of both simultaneously).
- **`time_record`** with `{ roomId, playerId, teamId, apparatus, seconds }` —
  `TimeKeeperScoring.jsx` only, on Stop (or "Not received — send again").
  The server relays it only from a socket seated as Time Keeper in that room,
  and **never persists it** — see
  [06-SCREENS/time-keeper-scoring.md](06-SCREENS/time-keeper-scoring.md).
- **`scores_saved`** with `{ teamId, roomId, isLocked }` —
  `ScorerScoring.jsx` and `AdminScoring.jsx`, fired after a successful
  score save to notify the rest of the panel immediately (rather than
  waiting for them to poll or refetch).

## Listened events (server → client)

Beyond the socket.io built-ins `connect`/`disconnect`/`connect_error`/`error`:

- **`performance_order_updated`** — `JudgeDashboard.jsx`,
  `JudgeSequence.jsx`, `JudgeTeamPlayers.jsx`. Applies the full
  running-order payload directly, no refetch — filtered through
  `eventMatchesCategory` (see
  [11-SCORING-CLIENT.md](11-SCORING-CLIENT.md#performanceorderjs-positional-sort-with-a-name-order-fallback-not-a-plain-lookup))
  so a page only reacts to updates for the category it's showing.
  `AdminLots.jsx` holds no socket of its own — its saves (via
  `adminLotsAPI.setTeamOrder`/`setPlayerOrder`) trigger the **server**
  to emit this event as a side effect, which the judge pages above pick
  up over their own independent connections.
- **`score_updated`** — `ScorerScoring.jsx`, `useJudgePanelData.js`,
  `AdminScoring.jsx`. Live-fills one judge's mark into the sheet/panel
  view. `useJudgePanelData.js` additionally matches on `apparatusKey`
  (see [SHARED-CONTRACTS.md](SHARED-CONTRACTS.md)) before applying an
  update — a documented fix for cross-apparatus bleed into the wrong
  panel.
- **`scores_saved_notification`** — same three files. Marks a slip
  finalized/locked on other panel members' screens.
- **`time_recorded`** — `ScorerScoring.jsx` (fills that row's Time as if
  typed; queued while the sheet loads) and `TimeKeeperScoring.jsx` (the
  `{ ack: true }` copy confirms the send).

`useJudgePanelData.js` also **re-reads the panel on every re-connect**
(anything broadcast while the socket was down is lost) and, for Panel Review,
every 10 s and when the tab becomes visible — the live feed is no longer the
only source of truth there.
- **`scores_saved_error`** — listened in `useJudgePanelData.js` and
  `AdminScoring.jsx`. **See "A client-only event" below — this appears
  to be dead.**

## A client-only event: `scores_saved_error` has no server emitter — confirmed, and there's a sibling that already got cleaned up

Grepped all of `Server/src`, including `event-types.js`, for both the
literal string `scores_saved_error` and a `SCORES_SAVED_ERROR` constant
name: **zero matches, either form, anywhere server-side.** Two listeners
exist client-side — `useJudgePanelData.js:501` and `AdminScoring.jsx:171`
— for an event the server never emits; any error during a panel save is
silently swallowed as far as either handler is concerned, since neither
can ever fire.

**This is the second occurrence of the same defect class, not the
first** — `useJudgePanelData.js`'s own comment (`:452-457`) documents a
sibling event, `score_update_error`, that used to have a listener in
this same file and was deliberately removed once it was recognized as
dead: *"the server has never emitted `score_update_error`, so a...
[listener for it does nothing]"* — corroborated by
`Server/tests/integration/socket/scoring-socket.test.js:219`'s own
comment, which independently confirms *"two client files also listen
for `score_update_error`, which the [server never emits]"*. So the team
already found and removed one dead error-listener in this exact file,
but **`scores_saved_error` — grepped and confirmed equally dead — was
never caught by that same cleanup**, and now exists in two files instead
of one. If you're removing dead socket listeners, treat `AdminScoring.jsx`
and `useJudgePanelData.js` as a matched pair to fix together, not two
independent occurrences.

## Server-defined events with no client listener

`Server/src/socket/events/event-types.js` defines a much larger set of
event-name constants than the client ever listens for. Grepped
exhaustively across `Web/src` for each literal string — zero matches for
any of: `room_joined`, `room_left`, `score_update` (vs. the client's
`score_updated`), `score_saved` (and its duplicate-value alias
`SCORE_SAVED_REST`), `score_submitted`, `score_deleted`, `notification`,
`competition_update`, `team_update`, `player_update`, `team_created`,
`team_updated`, `team_player_added`, `team_player_removed`,
`competition_created`, `competition_updated`,
`competition_status_updated`, `team_approved`, `team_rejected`,
`player_status_updated`, `scores_unlocked`, `scores_locked`,
`age_group_started`, `age_group_ended`, `join_competition_room`,
`leave_competition_room`, `leave_scoring_room`.

Most plausibly: (a) generic notification/CRUD events built for a
notification-center feature the client never implemented — no
`NotificationBell` or toast-on-socket component exists anywhere in
`Web/src` — and (b) `join_competition_room`/`leave_competition_room`/
`leave_scoring_room` reserved for a mid-session competition-switch case
that isn't wired up client-side yet (a judge switching meets today gets
a fresh page load and a new token rather than a live room hop). ⚠️
UNVERIFIED whether the server's application code actually *emits* all of
these (only confirmed they're declared as constants) — treat this list
as "not consumed by the SPA today," not necessarily "unused server-side."

## Change guidance

- Adding a new live-scoring surface: there's no shared hook to extend —
  copy the connect/auth/room-join pattern from one of the seven files
  above, and derive the auth storage key via `getRoleFromPath`, not a
  hand-rolled role check.
- Adding a new socket event: add the constant to
  `Server/src/socket/events/event-types.js` first, then wire the emitter
  server-side and the listener client-side in the same change — the
  `scores_saved_error` and the large server-only list above are both
  examples of what happens when one side is added without the other.
- If you're investigating "why didn't my running-order/score update show
  up live," check `eventMatchesCategory`/`apparatusKey` filtering before
  assuming the socket itself is broken — both `performance_order_updated`
  and `score_updated` are filtered client-side after being received.
