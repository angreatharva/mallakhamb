# Recipes (draft; final version lives at backend/RECIPES.md)

Each recipe is the one approved way to do a recurring thing. The context pack
tags each unit with the recipes it needs. **Every snippet uses the single
sources from 08**: typed ids, kernel enums and value objects, `*Fields`,
`ErrorCode`, `MessageKey`, `Rooms`, `RealtimeMessage`, `Capability`. A recipe
that needs a raw string is a broken recipe. Snippets are finalised against
the exemplar module in Stage 2.

---

## P0: Controller method (generated, never hand-written)
```java
@PostMapping(ApiRoutes.Coach.CREATE_TEAM)
@Requires(Capability.MANAGE_OWN_TEAMS)
ResponseEntity<ApiEnvelope<TeamResponse>> coachCreateTeam(@Valid @RequestBody CreateTeamRequest body, AuthPrincipal principal) {
  return ApiEnvelope.created(teamService.createTeam(principal, body), MessageKey.TEAM_CREATED);
}
```
The builder only fills the service method it calls.

## P1: Read with a projection
```java
public CoachProfileResponse getProfile(AuthPrincipal principal) {
  CoachId coachId = principal.coachId();                                 // typed id from the principal
  Query q = Query.query(Criteria.where(CoachFields.ID).is(coachId.value()));
  q.fields().include(CoachFields.PROFILE);                               // generated allow-list
  CoachDocument coach = mongo.findOne(q, CoachDocument.class);
  if (coach == null) throw new NotFoundException(ErrorCode.NOT_FOUND, MessageKey.COACH_NOT_FOUND);
  return CoachProfileResponse.from(coach);
}
```
Never read a user collection without a generated field allow-list.

## P2: Simple write
```java
TeamDocument team = TeamDocument.create(body.name(), principal.coachId(), body.gender(), clock); // enums and ids typed; sets createdAt/updatedAt/__v
teams.insert(team);
```
Updates: `MongooseCompat.touch(new Update(), clock).set(TeamFields.NAME, body.name())`.

## P3: Filtered or paginated aggregation
Port the pipeline **stage by stage in the same order**, one Java statement per
Node stage, with the Node `file:line` above it. Filters come from value
objects, not loose fields:
```java
// Node: competition.repository.js:412-468
Aggregation agg = Aggregation.newAggregation(
    Aggregation.match(Criteria.where(CompetitionFields.ID).is(competitionId.value())),
    Aggregation.unwind(CompetitionFields.REGISTERED_TEAMS),
    Aggregation.match(EntryCriteria.submittedIn(category)),             // Category value object owns the filter
    /* … same stages … */
    Aggregation.skip(page.offset()), Aggregation.limit(page.limit()));  // PageQuery owns defaults and caps
return PagedResponse.of(mongo.aggregate(agg, CompetitionDocument.COLLECTION, EntryRow.class).getMappedResults(), page);
```

## P4: Team-addressed write to `registeredTeams[]` (only in `CompetitionEntriesStore`)
```java
public void markSubmitted(CompetitionId competitionId, TeamId teamId, Instant now) {
  Query q = Query.query(Criteria.where(CompetitionFields.ID).is(competitionId.value())
      .and(CompetitionFields.REGISTERED_TEAMS).elemMatch(Criteria.where(EntryFields.TEAM).is(teamId.value())));
  Update u = MongooseCompat.touch(new Update(), now)
      .set(CompetitionFields.entrySet(EntryFields.IS_SUBMITTED), true)       // → "registeredTeams.$[e].isSubmitted"
      .set(CompetitionFields.entrySet(EntryFields.SUBMITTED_AT), now)
      .filterArray(CompetitionFields.entryFilter(teamId));                 // → {"e.team": teamId}
  if (mongo.updateFirst(q, u, CompetitionDocument.class).getMatchedCount() == 0) {
    throw new NotFoundException(ErrorCode.NOT_FOUND, MessageKey.ENTRY_NOT_FOUND);
  }
}
```
Check `getMatchedCount()`, **never** `getModifiedCount()`. Never read-modify-save the array.

## P5: `__v`-guarded merge with retry (only in the scoring use case + `ScoreSheetStore`)
```java
public ScoreSheet saveSlips(ScoreIdentity identity, SlipBatch incoming) {
  for (int attempt = 1; attempt <= SaveRetry.MAX_ATTEMPTS; attempt++) {
    Optional<ScoreSheet> current = sheets.find(identity);
    ScoreSheet merged = ScoreMerge.apply(current.orElseGet(() -> ScoreSheet.empty(identity)), incoming); // pure domain
    boolean saved = current.isPresent()
        ? sheets.replaceIfVersion(merged, current.get().version())   // filter {_id, __v}; $inc __v
        : sheets.insertIfAbsent(merged);                              // duplicate key → false
    if (saved) return merged;
    SaveRetry.backoff(attempt, random);                               // Node's jitter
  }
  throw new ConflictException(ErrorCode.CONFLICT, MessageKey.SCORE_SAVE_CONFLICT);
}
```
Publish only after this returns (P6).

## P6: Publish after the write
```java
var message = new ScoresSavedNotification(playerId, scores, principal.userId(), principal.role(), clock.instant());
for (RoomId room : Rooms.scoring(category)) {        // both forms, two sends: Node behaviour (03 §5)
  publisher.toRoom(room, message);                     // the record carries its RealtimeEvent; no event-name string
}
```
Running order: `publisher.toRooms(Rooms.scoring(category), message)` (once
per socket). Users: `publisher.toUser(coachId, message)`. Every publish goes
through `SideEffects.run(...)`, so a failure is logged and never fails the
request.

## P7: External call with timeout (only behind the module's port)
`RestClient` bean configured from `AppProperties` timeouts; map
`RestClientException` → `ExternalServiceException(ErrorCode.EXTERNAL_SERVICE_ERROR, MessageKey.…)`.
Retry only where Node retries, with the count from config. Amounts go through
`Money.toPaise()`.

## P8: Superadmin correction
The controller (generated, `@Requires(Capability.CORRECT_…)`) calls the
**owning module's api**, then `audit.record(AuditAction.…, …)`. No rule lives
in the superadmin layer.

## P9: Scheduled job
```java
@Scheduled(cron = "${mallakhamb.scheduling.competition-status-cron}", zone = "UTC")
void sweepCompletedCompetitions() { statusSweep.run(clock.instant()); }   // cron in AppProperties; logic idempotent
```

## P10: Engine call
Build the engine's input record from kernel types, call the pure engine, map
the output. Never re-implement a rule in a service; a missing engine rule is a
lead task.

## P11: State transition
```java
if (!entry.paymentStatus().canMoveTo(PaymentStatus.COMPLETED)) {
  throw new BusinessRuleException(ErrorCode.INVALID_STATE, MessageKey.PAYMENT_ALREADY_SETTLED);
}
```
Transitions are only ever decided by the enum's `canMoveTo` (08 §9).

## P12: Branching on an enum
```java
return switch (seat) {                       // exhaustive: no default; adding a seat breaks the build here
  case SENIOR_JUDGE, JUDGE_1, JUDGE_2, JUDGE_3, JUDGE_4 -> evaluate(seat, slip);
  case SCORER, TIME_KEEPER -> throw new AuthorizationException(ErrorCode.ACCESS_DENIED, MessageKey.SEAT_CANNOT_SCORE);
};
```
Prefer a property on the enum (`seat.isEvaluator()`) when the answer is
intrinsic; use a `switch` when the decision belongs to this use case.
