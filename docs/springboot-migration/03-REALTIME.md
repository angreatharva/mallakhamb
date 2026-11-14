# 03 — Real-time: Socket.IO vs STOMP, chosen design, event matrix

## 1. What the frontend actually uses

Found in `Web/src` (9 files: `AdminScoring`, `JudgeDashboard`, `JudgeSequence`,
`JudgeTeamPlayers`, `ScorerScoring`, `TimeKeeperScoring`, `useJudgePanelData`,
`useRunningOrder`, plus `JudgePanelReview`/`JudgeScoring` emitting through a
socket they're handed):

| Feature | Used? |
|---|---|
| `socket.io-client` 4.7, Engine.IO v4 protocol | yes |
| Transports | defaults: HTTP long-polling first, then upgrade to WebSocket |
| `withCredentials: true` (cookies on the polling requests) | yes |
| Handshake `auth: { token }` (+ `userType` on some screens) | yes |
| Default namespace `/` only | yes |
| Custom `path` | no (`/socket.io/`) |
| Acknowledgement callbacks | **no** |
| Binary payloads | **no** |
| Volatile / compressed / timeouts on emit | no |
| Rooms | server-side only; the client asks with `join_scoring_room` / `join_competition_room` |
| Reconnection | client defaults (exponential backoff); screens re-emit `join_scoring_room` on every `connect` |

The server side uses one `Server` on the same `http.Server`, `pingTimeout
5000`, `pingInterval 25000`, a CORS allow-list with credentials, an
`allowRequest` Origin check (it covers WebSocket upgrades, which the `cors`
option does not), handshake JWT from `auth.token` or the role cookie, no
adapter, one instance.

## 2. The options

| | **A. Socket.IO protocol in Java (netty-socketio)** | **B. Spring WebSocket + STOMP** | C. Keep a Node Socket.IO process next to Java |
|---|---|---|---|
| 1. React compatibility | **No client change.** Same protocol, events, rooms, handshake | Rewrite of 9 screens to `@stomp/stompjs` (connect, subscribe per room, reconnect, auth headers). Every live-scoring screen re-tested on tablets | No client change |
| 2. Migration complexity | Medium: port 2 handlers + manager (~1,500 lines) onto a different API; handle the gaps in §3 | High: server port **plus** client rewrite, during a backend migration (two moving parts at once) | Medium: Java has to publish to Node (HTTP or Redis), and auth/seat logic is duplicated in two languages |
| 3. Performance | Netty; far beyond needs (a meet is tens of sockets, low messages/s) | Same order | Extra hop per broadcast |
| 4. Scalability | Single instance today; Redis/Hazelcast store available if ever needed | Broker relay (RabbitMQ / ActiveMQ) for multi-instance | Node adapter |
| 5. Security | Handshake `AuthorizationListener` (headers, cookies, query, auth payload); per-event checks in handlers | Mature: `ChannelInterceptor`, message-level authorization | Two runtimes to secure |
| 6. Maintenance / ecosystem | Smaller community. `socketio4j/netty-socketio` is the maintained fork: Netty 4.2, Socket.IO 1.x–4.x claimed, Spring Boot starter, active releases. `mrniko/netty-socketio` last released 2.0.13 in March 2025 with 400+ open issues | First-party Spring; very well maintained | Node stays in production forever |
| 7. Horizontal scaling | Store-backed rooms if needed; needs sticky sessions for polling | Broker relay; no stickiness with WebSocket-only | Socket.IO Redis adapter |
| 8. Operational complexity | One more listening port (Netty runs its own server), proxied by Caddy | None extra | Two services, two deploys, two runtimes on 4 GB VMs |
| 9. Extensibility | Fine for current needs | Best long-term on the Java side | Poor |
| 10. Total cost | **Lowest** | Highest now; lower later only if the client was being rewritten anyway | Low now, highest over time |

### Decision: **A, using `socketio4j/netty-socketio`** (ADR-003)

Your initial preference holds up: the client uses a **narrow** feature set
(no acks, no binary, no namespaces), so the protocol risk is small and is
covered by a spike. STOMP would turn a backend migration into a backend **plus
frontend** migration on the screens judges use on meet day, which is exactly
the wrong place to add risk. Option C keeps Node running permanently, which
defeats the purpose.

**Exit ramp:** the business modules depend only on `RealtimePublisher` (§4).
If the Stage-2 spike shows a blocking gap, the fallback is B. The swap is
contained to the `realtime.socketio` package plus the 9 Web files, and is
approved as a separate frontend change.

## 3. Known gaps to close in the Stage-2 spike (pass/fail list)

The spike is a throwaway Boot 4.1.2 app (generated with the same Initializr setup) with netty-socketio and the **real
`socket.io-client` 4.7 from `Web/node_modules`**, run from Node test scripts.
Each line must pass or have a stated workaround before Stage 5 starts.

| # | Check | Expected handling |
|---|---|---|
| S0 | Artifact coordinates, latest release, licence, Spring Boot 4.1.2 / Netty 4.2 / Java 25 compatibility of the socketio4j fork and its starter | Recorded in `DEPENDENCIES.md`; if the starter doesn't fit Boot 4, a small `SmartLifecycle` bean starts the server |
| S1 | Polling → WebSocket upgrade with client 4.7 (EIO=4), behind Caddy, over TLS | Works natively; Caddy proxies `/socket.io/*` to the Netty port with WebSocket upgrade |
| S2 | `withCredentials` polling from the SPA origin: `Access-Control-Allow-Origin` must echo **the request's origin from an allow-list** with `Allow-Credentials: true` | netty-socketio's `setOrigin` takes one origin. If the fork has no allow-list hook, **Caddy answers CORS for `/socket.io/*`** from the same allow-list (one place, already templated per host), and the Netty side is not exposed except through Caddy |
| S3 | Origin check on WebSocket upgrade (the `allowRequest` equivalent) | `AuthorizationListener` reads the `Origin` header; refuse if not allowed |
| S4 | Handshake token from `auth.token` (EIO4 CONNECT packet payload), else from the `access_token` cookie chosen by `auth.userType` | The v4 CONNECT `auth` payload is available in handshake data in the fork (verify); cookie from handshake headers |
| S5 | Refuse: bad signature, expired, logged out (iat < revocation), inactive account | All in `HandshakeAuthenticator`, reusing `identity` services |
| S6 | `socket.to(room).emit` excluding the sender | `BroadcastOperations.sendEvent(name, excludedClient, data)` |
| S7 | Emit to several rooms **once per socket** (`emitToRooms`) | Collect clients into a `Set` across the rooms, then send once each (don't rely on the library to dedupe) |
| S8 | Emit to a user across tabs and devices (`emitToUser`) | Our own `Map<userId, Set<sessionId>>`, as Node does |
| S9 | Payload JSON: dates as ISO with millis, numbers JS-style, ObjectIds as strings | Plug the shared Jackson `ObjectMapper` (with the §7 serializers from 02) into the library's `JsonSupport` |
| S10 | `pingInterval 25000 / pingTimeout 5000` and the disconnect reasons the client sees | Library config; check the client fires `disconnect` and reconnects |
| S11 | Handlers never block the Netty event loop | Every handler hands off to a bounded executor (virtual threads with a semaphore) before touching Mongo |
| S12 | Graceful shutdown: stop accepting, close sockets so clients reconnect to the new active within the failover window | `server.stop()` in a `SmartLifecycle` stopped before the web server |
| S13 | Message size limit | `maxFramePayloadLength` and `maxHttpContentLength` set to 1 MB (Node's default `maxHttpBufferSize` is 1 MB) |
| S14 | Many reconnects at once after a failover (every tablet at once) | Load test: 200 clients reconnecting within 10 s |

## 4. Design

```text
realtime/
├── api/
│   ├── RealtimeEvent.java       enum: every wire event name + direction (generated, 08 §7)
│   ├── RealtimeMessage.java     sealed interface; one record per outbound event (ScoreUpdated, TimeRecorded, …),
│   │                            each returning its RealtimeEvent, so a payload can't go out under the wrong name
│   ├── RealtimePublisher.java   toRoom(RoomId, RealtimeMessage)
│   │                            toRooms(List<RoomId>, RealtimeMessage)        // once per socket
│   │                            toRoomExcept(RoomId, SessionId, RealtimeMessage)
│   │                            toUser(UserRef, RealtimeMessage)
│   │                            toAll(RealtimeMessage)
│   ├── RoomId.java              value object; only Rooms can create one
│   └── Rooms.java               scoring(Category) → [raw, display] (raw first)
│                                alternate(RoomId) (display values matched longest-first, from CompetitionType)
│                                competition(CompetitionId) → competition_<id>
├── auth/
│   ├── HandshakeAuthenticator   origin check, token from auth payload or cookie, verify, revocation, isActive
│   └── RoomAuthorizer           judge: seat-derived room set cached at connect; admin/superadmin: any;
│                                others: only their own competition_<id>
├── handlers/                    ScoringEventHandler (join/leave scoring room, score_update relay, scores_saved),
│                                TimeRecordHandler (Time Keeper only), CompetitionRoomHandler (join/leave competition)
└── socketio/                    SocketIoConfig, SocketIoLifecycle (SmartLifecycle), NettySocketIoPublisher,
                                 SessionRegistry (userId → sessions; per-socket cached seats), RealtimeMetrics
```

- Business modules call `RealtimePublisher` **after the database write
  succeeds**, and a publish failure is logged and never fails the request (as
  in Node). The one difference from Node: publishing happens after the
  transaction or retry loop settles, so a broadcast never announces a write
  that was retried away.
- `Rooms` is the **only** place that builds a room id, and `RoomId` can't be
  constructed anywhere else (fixes T6 and the `competition:` vs
  `competition_` class of bug). Inbound room ids from clients are parsed by
  `Rooms.parse`, which rejects anything it couldn't have produced. `RoomAuthorizer` and the
  auto-join at connect use the same `Rooms` call, so they can't drift.
- Seats are loaded **once at connect** and cached on the session (Node's
  HIGH-5 fix). A seat change takes effect when the judge's socket reconnects,
  same as today.
- **Single instance, no store.** One active VM, so the in-memory store is the
  truth, as in Node today (ADR-006). The publisher interface leaves room for a
  store-backed version later without touching the modules.
- Rate limit per socket on `score_update` and `time_record` (token bucket
  per session, generous: a judge types fast). Validate every inbound payload
  as a record with constraints; reject unknown room ids; `seconds` a whole
  number 0–3600.

## 5. Event compatibility matrix

Payload keys below are from the Node source. **Stage 1 records real frames**
from the Node server (a Node script with `socket.io-client` joins every room
type while the e2e chain runs). Those recordings become the fixtures for the
Java contract tests in 04 §5, so payloads are compared byte for byte (after
normalising timestamps and ids), not from this table.

### Client → server

| Event | Payload | Node handler | Java handler | Frontend change |
|---|---|---|---|---|
| `join_scoring_room` | `{ roomId }` | `ScoringHandler.handleJoinRoom`: admin/superadmin any; judge via seat rooms | `ScoringEventHandler.onJoin` + `RoomAuthorizer` | None |
| `leave_scoring_room` | `{ roomId }` | `handleLeaveRoom` | `ScoringEventHandler.onLeave` | None |
| `score_update` | `{ roomId, playerId, teamId, score, breakdown, apparatus, judgeType? }` | relay only, **never persists**; re-checks the competition lock; Senior Judge override of another judge's slip refused | `ScoringEventHandler.onScoreUpdate` | None |
| `scores_saved` | `{ roomId, teamId, playerId?, scores?, isLocked? }` | permission check, then `scores_saved_notification` to both room forms | `ScoringEventHandler.onScoresSaved` | None |
| `time_record` | `{ roomId, playerId, teamId, apparatus, seconds }` | Time Keeper seat in that room only; lock re-check; relay only | `TimeRecordHandler.onTimeRecord` | None |
| `join_competition_room` | `{ competitionId }` | admin/superadmin any; others only their own token's competition | `CompetitionRoomHandler.onJoin` | None |
| `leave_competition_room` | `{ competitionId }` | | `CompetitionRoomHandler.onLeave` | None |

### Server → client

| Event | Payload (keys) | Emitted by (Node) | Target | Java emitter |
|---|---|---|---|---|
| `room_joined` | `{ roomId, …, assignment{gender,ageGroup,competitionType,apparatus,judgeType} }` on auto-join | `socket.manager` auto-join, handlers | the socket | `ScoringEventHandler`, `SessionRegistry.autoJoin` |
| `room_left` | `{ roomId }` | handlers | the socket | same |
| `score_updated` | `{ playerId, judgeType, score, breakdown, teamId, judgeId, apparatus, timestamp }` | `scoring.handler` relay (except sender), `scoring.service` after a save | room + alt room | `ScoringEventHandler`, `ScoreSheetService` |
| `score_saved` | ack to the submitting judge | `scoring.handler` | the socket | `ScoringEventHandler` |
| `scores_saved_notification` | `{ playerId, scores, savedBy, savedByType, timestamp }` (+ unlock / correction variants) | handler; `scoring.service` (unlock, restore); `score-correction.service` | room + alt room | `ScoringEventHandler`, scoring use cases |
| `edits_restored` | `{ … }` | `scoring.service` | room(s) | scoring use case |
| `time_recorded` | `{ roomId, playerId, teamId, apparatus, seconds, timeKeeperName, recordedBy, timestamp }`; `ack: true` copy to the sender | `scoring.handler` | room + alt room except sender; sender | `TimeRecordHandler` |
| `performance_order_updated` | `{ kind: lots_drawn \| team_order \| player_order, …, actor, teamId? }` | `performance-order.service` via `emitToRooms` (**once per socket**) | both scoring room forms | `RunningOrderService` via `toRooms` |
| `scores_saved_error` | `{ message }` | (listened for by 2 screens) | the socket | Stage 1 confirms whether Node still emits it; if not, the Java side doesn't either |
| `error` | `{ message, … }` | manager catch-all, join failure | the socket | `SocketIoLifecycle` exception listener |
| `team_created`, `team_updated`, `team_player_added`, `team_player_removed` | team summary | `team.service` → `emitToUser(coach)` | user | `team` module |
| `player_status_updated` | | `admin.service` → `emitToUser(coach)` | user | `registration` module |
| `team_approved`, `team_rejected`, `age_group_started` | | `admin.service` | `competition_<id>` | `registration` / `competition` |
| `age_group_ended`, `scores_locked`, `scores_unlocked` | | `scoring.service` | `competition_<id>` | `scoring` |
| `competition_created` | | `competition.service` | everyone | `competition` |
| `competition_updated`, `competition_status_updated` | | `competition.service` | `competition_<id>` | `competition` |

**Not ported (dead in Node, no listener and/or no room members):**
`NotificationHandler`'s `notification`, `competition_update`, `team_update`,
`player_update` helpers (no callers), `team_*` rooms (never joined), and the
`SCORE_SUBMITTED` emit at `scoring.service.js:173`, which still targets the
**colon-spelled** `competition:<id>` room that nothing joins. Each is listed so
the omission is a decision, not an accident. If a Stage-1 recording shows any
of them reaching a client, it gets ported.

**Behaviour kept on purpose, even though it looks odd:** `score_updated` and
`scores_saved_notification` are sent to the raw room and then to the alternate
room in two calls, so a socket in both forms gets them **twice**. The clients
cope with that today. Changing it to once-per-socket is a separate approved
change after cutover (it already happened for `performance_order_updated`).
