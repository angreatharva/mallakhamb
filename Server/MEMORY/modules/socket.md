---
doc: modules/socket
covers:
  - src/socket/**
read_when: "adding or debugging a socket event"
depends_on: [08-REALTIME-SOCKETS]
verified_against_commit: f0bdc1d
last_verified: 2026-09-23
---

Full detail (auth handshake, room-naming, the complete event catalogue,
which events are live vs. dead) lives in
[08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md) — this is a pointer
entry so `src/socket/` has its own module doc per the directory-per-module
convention.

## Files

| File | Role |
|---|---|
| `src/socket/socket.manager.js` | Connection/auth, room join/leave, `emitToRoom`/`emitToUser`/`broadcast` |
| `src/socket/handlers/scoring.handler.js` | The only handler with real inbound event listeners — see [07-SCORING-ENGINE.md](../07-SCORING-ENGINE.md) |
| `src/socket/handlers/notification.handler.js` | **Entirely dead code** — registers zero listeners, its 5 outbound methods have no callers |
| `src/socket/events/event-types.js` | Every event name constant |
| `src/socket/README.md` | Existing doc — **describes rooms/events that don't work as documented**, see GOTCHAS.md |

## One fact worth repeating here

The only room-join mechanisms anywhere in the socket layer are the two
scoring-room paths. No socket ever joins a `competition_*`/`competition:*`/
`team_*` room, so several real `emitToRoom` calls from `admin.service.js`/
`scoring.service.js`/`competition.service.js` broadcast into empty rooms.
Use `emitToUser` for anything that needs to actually reach someone outside
a scoring room — see [08-REALTIME-SOCKETS.md](../08-REALTIME-SOCKETS.md).
