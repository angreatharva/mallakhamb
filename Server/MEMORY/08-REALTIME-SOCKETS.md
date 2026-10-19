---
doc: 08-REALTIME-SOCKETS
covers:
  - src/socket/**
  - src/utils/data/scoring-room.util.js
read_when: "adding/changing a socket event, debugging a broadcast that doesn't arrive, or touching room membership/authorization"
depends_on: [06-AUTH-AND-SECURITY, 07-SCORING-ENGINE]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

> **Updated 2026-09-23 (follow-up pass, same commit lineage).** The
> "no socket ever joins a `competition_*` room" finding below has been
> fixed: every socket now auto-joins its own `competition_{id}` room at
> connect, and `NotificationHandler` now registers real
> `join_competition_room`/`leave_competition_room` listeners. This doc has
> been updated in place — see the Room-naming and Event catalogue sections.
> `GOTCHAS.md`'s "Fixed since this MEMORY build" section has the short
> version.

## Socket authentication (handshake) — `src/socket/socket.manager.js`

`createAuthMiddleware()`: token source, in priority order — (a)
`socket.handshake.auth.token` (explicit payload), else (b) manually parsed
from the raw `Cookie` header matching `COOKIE_NAMES.ACCESS_TOKEN` (the same
httpOnly cookie REST auth uses). `tokenService.verifyToken`, then the
**same** logout-invalidation check as REST
(`isTokenLoggedOut(userId, iat)` — see
[06-AUTH-AND-SECURITY.md](06-AUTH-AND-SECURITY.md)): a token issued before
the user's last logout is refused even if cryptographically valid. On
success, attaches `socket.userId`, `socket.userType`, **`socket.competitionId`
straight off the decoded JWT claim** — this is exactly what
`scoring.handler.js`'s `assertCompetitionUnlocked` reads to find "the"
competition for a lock check, since sockets have no Express middleware to
inherit one from. Any failure refuses the connection (no anonymous sockets
possible).

`handleConnection`: tracks `connectedUsers: Map<userId, Set<socketId>>`
(multiple tabs/devices per user supported); judges are auto-joined to their
scoring rooms (`autoJoinJudgeRoom`); `cacheJudgeAssignments(socket)` resolves
`judgeDetails` **once at connect** and caches `socket.judgeRoomIds`
(Set)/`socket.judgeTypeByRoom` (Map — role can differ per room) so
`isJudgeAuthorizedForRoom` never needs a DB read per score event (a HIGH-5
fix — room membership used to be gated on role alone, letting a judge
broadcast forged `score_updated` into a panel they weren't assigned to).
It also caches **`socket.judgeTypesByRoom`** (Map roomId → Set of every seat
held there). One room is a whole category carrying all its apparatus panels,
so one person can be Time Keeper on Pole and Judge 1 on Rope in the same room;
`judgeTypeByRoom` keeps only the last seat seen. `socket.judgeName` is the
server-side name used when a broadcast names its sender, never a
client-claimed one.

Metrics go to the Prometheus registry (constructor arg `metrics`, default
`noopMetrics`; the old `MetricsCollector` was retired 2026-10-03):
`socketio_connected_clients`, `socketio_rooms` (read at scrape time, skipping
each socket's own room), and per registered event
`socketio_events_received_total{event}` / `socketio_event_errors_total{event}`
/ `socketio_event_handler_seconds{event}`. `event` is safe as a label because
only server-registered handler names reach it. See
[11-OBSERVABILITY.md](11-OBSERVABILITY.md).

## Room-naming — the ONLY real room family is scoring rooms

Format: `scoring_{gender}_{ageGroup}_{competitionType}` — **no apparatus in
the room id**, despite panels being seated per-apparatus (apparatus travels
in the event payload instead; a historical bug dropped it and a Rope slip
landed on the Pole row). Every category room exists in **two simultaneous
forms** — slug (`competition_1`) and display (`Competition I`) — because the
judge client sends slugs while other layers carry display values.
`scoringRoomIds(gender, ageGroup, competitionType)`
(`src/utils/data/scoring-room.util.js`) returns both (or one, if they
coincide), raw form first — load-bearing, since `autoJoinJudgeRoom` reports
`roomIds[0]` back to the client as "the room it joined" and the client
addresses its own broadcasts to that value. `alternateRoomId(roomId)` finds
"the other form" of an existing room id — **display values are matched
longest-first** (`COMPETITION_TYPE_DISPLAYS` sorted by length descending in
`cop-rules.js`) specifically because `"Competition I"` is a string-prefix of
`"Competition II"`/`"Competition III"`: getting this backwards used to turn
`scoring_Male_Under14_Competition III` into
`scoring_Male_Under14_competition_1II` — a room with no members, silently
swallowing the broadcast. `getRoomIdsForAssignment`/`cacheJudgeAssignments`/
`isJudgeAuthorizedForRoom` all use this same helper as the single source of
truth, so auto-join and the authorization check can never drift apart.

## Competition rooms (`competition_{id}`) — fixed 2026-09-23

A room is joined three ways:
1. **Judge auto-join to scoring rooms** at connect (`socket.manager.js`).
2. **Every authenticated socket auto-joins its own `competition_{id}` room
   at connect** (`socket.manager.js:handleConnection`), from the trusted
   `competitionId` claim on the JWT used at handshake. A socket with no
   `competitionId` claim (a coach/admin who hasn't selected one yet) joins
   nothing here.
3. **Explicit `join_scoring_room` / `join_competition_room` events**
   (`scoring.handler.js` / `notification.handler.js`, both via the shared
   `socketManager.joinRoom(socket, roomId, validator)`). The competition
   variant exists for the case #2 doesn't cover: no competition selected at
   handshake, or a mid-session switch (`/auth/set-competition` mints a new
   token, but an existing socket connection keeps its old claim until it
   reconnects). Authorization: admin/superadmin may join any competition's
   room; coach/player/judge may only join the room matching their **own**
   `socket.competitionId` — this is what stops the event from being used to
   eavesdrop on a different meet.

This fixed a real defect: previously, no code anywhere joined a socket to a
`competition_*`/`competition:*`/`team_*` room, so several real emitters
(`TEAM_APPROVED`, `TEAM_REJECTED`, `AGE_GROUP_STARTED`, `AGE_GROUP_ENDED`,
`SCORES_LOCKED`, `SCORES_UNLOCKED`, `COMPETITION_UPDATED`,
`COMPETITION_STATUS_UPDATED`) broadcast into an empty room and reached
nobody. `competition.service.js`'s `competition:${id}` (colon) spelling was
also fixed to `competition_${id}` (underscore), matching every other
emitter — a second, independent bug that would have made its two events
miss even a socket correctly joined to the underscore-spelled room.

**`team_*` rooms remain unjoined** — nothing currently emits into one
outside the still-dead `NotificationHandler.broadcastTeamUpdate` (see
below), so fixing that join wasn't needed to restore any live broadcast.
`team.service.js`'s real team events use `emitToUser` instead, which never
needed a room.

## Event catalogue

### Scoring (persist-adjacent — full detail in [07-SCORING-ENGINE.md](07-SCORING-ENGINE.md))

| Event | Direction | File | Notes |
|---|---|---|---|
| `join_scoring_room` | client→server | `scoring.handler.js` | Admin/superadmin: blanket allow. Judge: `isJudgeAuthorizedForRoom`. |
| `leave_scoring_room` | client→server | `scoring.handler.js` | |
| `room_joined` | server→client | `scoring.handler.js`, `socket.manager.js` (auto-join) | Auto-join payload includes the resolved `assignment{gender,ageGroup,competitionType,apparatus,judgeType}` |
| `room_left` | server→client | `scoring.handler.js` | |
| `score_update` | client→server | `scoring.handler.js` | Live Panel Review only — **never persists**. Re-checks the competition lock via a direct DB read (`assertCompetitionUnlocked`), fails open if the repo isn't wired (the load-bearing lock is the HTTP write, not this) |
| `score_updated` | server→client | `scoring.handler.js` | Broadcast to `roomId` + `altRoomId`, excluding sender |
| `score_saved` | server→client | `scoring.handler.js` | Ack to the submitting judge only |
| `scores_saved` | client→server | `scoring.handler.js` | |
| `scores_saved_notification` | server→client | `scoring.handler.js` | Both room forms |
| `performance_order_updated` | server→client | `performance-order.service.js` | Both room forms via `scoringRoomIds`; failures logged, never thrown |
| `time_record` | client→server | `scoring.handler.js` (`handleTimeRecord`) | **Time Keeper only**: `userType === 'judge'`, room authorized, and `judgeTypesByRoom.get(roomId)` has `'Time Keeper'`. Re-checks the competition lock. Payload `{roomId, playerId, teamId, apparatus, seconds}`; `seconds` must be a whole number 0–3600. **Relay only, never persists** — the time lands in that athlete's Time field on the Scorer's sheet and is saved with the sheet like a typed one |
| `time_recorded` | server→client | `scoring.handler.js` | To both room forms excluding the sender, with `timeKeeperName` (from `socket.judgeName`), `recordedBy`, `timestamp`; plus an `{…, ack: true}` copy back to the Time Keeper |
| `error` | server→client | `socket.manager.js` | Generic handler-error catch, or join failure |

Retired, documented in-file, not present: `score_update_request` /
`SCORE_UPDATE_SUCCESS` / `SCORE_ERROR` (called a service method that wrote a
flat shape the Score schema never had).

### Notification/general events

| Event constant | Wire name | Emitter | Status |
|---|---|---|---|
| `JOIN_COMPETITION_ROOM` | `join_competition_room` | client→server, `notification.handler.js` | **Live** (new 2026-09-23) — see above |
| `LEAVE_COMPETITION_ROOM` | `leave_competition_room` | client→server, `notification.handler.js` | **Live** (new 2026-09-23) |
| `NOTIFICATION` | `notification` | `notification.handler.js`'s `sendToUser`/`sendToCompetition` | Still dead — those two methods have no callers (they'd work if called; the room they'd target is now joined) |
| `COMPETITION_UPDATE` | `competition_update` | `notification.handler.js`'s `broadcastCompetitionUpdate` | Still dead — no caller |
| `TEAM_UPDATE` | `team_update` | `notification.handler.js`'s `broadcastTeamUpdate` | Still dead — no caller, and `team_*` rooms are still never joined |
| `PLAYER_UPDATE` | `player_update` | `notification.handler.js`'s `broadcastPlayerUpdate` | Still dead — no caller (uses `emitToUser`, which doesn't need a room anyway) |
| `TEAM_CREATED` | `team_created` | `team.service.js` via `emitToUser(coachId,…)` | **Live** — delivered by userId, no room needed |
| `TEAM_UPDATED` | `team_updated` | `team.service.js` via `emitToUser` | **Live** |
| `TEAM_PLAYER_ADDED`/`TEAM_PLAYER_REMOVED` | — | `team.service.js` via `emitToUser` | **Live** |
| `TEAM_APPROVED`/`TEAM_REJECTED` | — | `admin.service.js` via `emitToRoom('competition_${id}')` | **Live** (fixed 2026-09-23) — reaches every socket connected to/joined into that competition |
| `PLAYER_STATUS_UPDATED` | `player_status_updated` | `admin.service.js` via `emitToUser(player.coach,…)` | **Live** |
| `AGE_GROUP_STARTED` | — | `admin.service.js` via `emitToRoom('competition_${id}')` | **Live** (fixed 2026-09-23) |
| `AGE_GROUP_ENDED`/`SCORES_UNLOCKED`/`SCORES_LOCKED` | — | `scoring.service.js` via `emitToRoom('competition_${id}')` | **Live** (fixed 2026-09-23) |
| `COMPETITION_CREATED` | `competition_created` | `competition.service.js` via `.broadcast(...)` | **Live** — global broadcast, no room needed |
| `COMPETITION_UPDATED`/`COMPETITION_STATUS_UPDATED` | — | `competition.service.js` via `emitToRoom('competition_${id}')` | **Live** (fixed 2026-09-23 — was colon-spelled and unjoined, now underscore-spelled to match, and the room has members) |

`NotificationHandler`'s five original outbound helper methods
(`sendToUser`, `sendToCompetition`, `broadcastCompetitionUpdate`,
`broadcastTeamUpdate`, `broadcastPlayerUpdate`) remain unused API surface —
fixing the room-join problem didn't give them a caller, it just means they
*would* work now if something called them. See GOTCHAS.md.

## `NotificationHandler` — now has real listeners (fixed 2026-09-23)

`register()` (`src/socket/handlers/notification.handler.js`) now registers
`handleJoinCompetitionRoom`/`handleLeaveCompetitionRoom` against
`JOIN_COMPETITION_ROOM`/`LEAVE_COMPETITION_ROOM` — see the Competition rooms
section above for the auth rule. Before this fix it only logged a line and
listened for zero inbound events. Its five **outbound** methods (`sendToUser`,
`sendToCompetition`, `broadcastCompetitionUpdate`, `broadcastTeamUpdate`,
`broadcastPlayerUpdate`) still have no callers — the fix gave the class a
real job, not a caller for those specific helpers. All the real
general-purpose realtime notifications still happen by services calling
`socketManager.emitToRoom`/`emitToUser`/`broadcast` **directly** — this
handler's job is room membership, not being a required relay.

## `SocketManager` public API (used by other files)

`initialize()`, `registerEventHandler(eventName, handler)`, `joinRoom(socket,
roomId, validator)`, `leaveRoom(socket, roomId)`, `emitToRoom(roomId,
eventName, data)`, `emitToUser(userId, eventName, data)`, `broadcast(eventName,
data)`, `getIO()`, `getConnectedUsersCount()`, `isUserConnected(userId)`,
`getConnectedUserIds()`, `disconnectUser(userId)`, `close()`. Also
`isJudgeAuthorizedForRoom(socket, roomId)` and `cacheJudgeAssignments(socket)`,
called directly by `scoring.handler.js` for authorization.

## Stale docs — `src/socket/README.md`

(Its metrics section was rewritten for the Prometheus registry on 2026-10-03;
the points below still stand.)

- Documents the scoring-room id format as `{competitionId}_{gender}_
  {ageGroup}_{competitionType}` (with an example
  `comp-123_male_u12_individual`) — the real format has **no competitionId**
  and exists in two simultaneous forms (slug/display); see above. Not fixed
  in this pass.
- Documents `competition_{competitionId}`/`team_{teamId}` rooms and
  `notification`/`competition_update`/`team_update` as things a client can
  join and receive real data from — **`competition_{id}` is now actually
  true** (fixed 2026-09-23), but `team_{id}` is still unjoined, and the doc
  doesn't mention the new `join_competition_room`/`leave_competition_room`
  events at all. Not rewritten in this pass.
- Lists `NotificationHandler`'s five *outbound* methods as if they're in
  active use; none has a caller (its *inbound* join/leave listeners, added
  2026-09-23, are the part that's actually live now — the README predates
  this and doesn't mention it).
- Does not distinguish that `NotificationHandler.register()` used to be a
  no-op while `ScoringHandler.register()` did real work — now both register
  real handlers, but the README's framing is stale either way.

## Change guidance

- A new event is counted automatically once it goes through
  `registerEventHandler` (the metrics wrap lives in the dispatcher); don't
  emit metrics by hand in a handler.

- A new scoring broadcast: emit to **both** room-id forms via
  `scoringRoomIds`/`getAltRoomId`, never a hand-rolled string.
- A new "notify this user" feature: use `emitToUser` directly (it works,
  it's what `team.service.js`/`admin.service.js`'s live paths already do).
- A new "notify everyone watching this competition" feature: `emitToRoom
  ('competition_${id}', ...)` now works — every socket scoped to that
  competition (by JWT claim or explicit join) is a member. Always use the
  underscore spelling (`competition_${id}`), never `competition:${id}`.
- A new "notify everyone watching this team" feature: **no join mechanism
  exists for `team_*` rooms yet** — either add one (mirroring the
  competition-room pattern in `notification.handler.js`) or use `emitToUser`
  per-recipient instead, the way `team.service.js` already does.

## Open questions
- ⚠️ UNVERIFIED: whether `Web/` has any client-side code to call
  `join_competition_room`/`leave_competition_room` — this fix is
  Server-only; the auto-join at connect means most cases work without any
  client change, but a mid-session competition switch on an existing socket
  still needs the client to emit the explicit join event, which `Web/` was
  not touched to add (out of scope for a Server-only pass).
- ⚠️ UNVERIFIED: whether `Web/` ever emits a generic `join_room`/
  `join_competition` event under a different name than the one implemented
  here — worth checking before assuming the new event name is what a
  future client integration should use.
