---
doc: modules/socket
covers:
  - src/socket/**
read_when: "adding or debugging a socket event"
depends_on: [08-REALTIME-SOCKETS]
verified_against_commit: 06891b5
last_verified: 2026-10-18
---

Full detail (auth handshake, room-naming, the complete event catalogue,
which events are live vs. dead) lives in
[08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md) — this is a pointer
entry so `src/socket/` has its own module doc per the directory-per-module
convention.

## Files

| File | Role |
|---|---|
| `src/socket/socket.manager.js` | Connection/auth, room join/leave, `emitToRoom`/`emitToUser`/`broadcast`; caches each judge's seats per room (`judgeTypeByRoom`, and `judgeTypesByRoom` = every seat); reports Prometheus socket metrics |
| `src/socket/handlers/scoring.handler.js` | Scoring-room events: join/leave, `score_update` / `scores_saved` (broadcast only), and the Time Keeper's `time_record` → `time_recorded` relay — see [08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md) |
| `src/socket/handlers/notification.handler.js` | Inbound `join_competition_room` / `leave_competition_room` listeners are live (since 2026-09-23); its 5 outbound helper methods still have no callers |
| `src/socket/events/event-types.js` | Every event name constant (incl. `TIME_RECORD` / `TIME_RECORDED`) |
| `src/socket/README.md` | Existing doc — room-id format and handler framing are stale (metrics section is current), see [08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md) |

## One fact worth repeating here

Rooms that a client actually joins: the two scoring-room id forms (slug and
display, both always emitted to via `scoringRoomIds`) and, since 2026-09-23,
`competition_{id}`. Nothing joins `team_{id}`, so an `emitToRoom` there reaches
nobody. Use `emitToUser` for anything that must reach someone outside those
rooms — see [08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md).
