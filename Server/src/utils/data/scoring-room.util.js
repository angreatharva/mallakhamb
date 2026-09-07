/**
 * Socket.IO scoring-room addressing.
 *
 * A panel's live-scoring room is `scoring_{gender}_{ageGroup}_{competitionType}`
 * — and the same room is addressed in TWO forms, because the judge client sends
 * the slug (`competition_1`) while other parts of the system carry the display
 * value (`Competition I`). Both forms are real rooms with real members, so a
 * broadcast that reaches only one form reaches only some of the panel.
 *
 * WHY THIS MODULE EXISTS
 *
 * Building those ids was written out FOUR times: `SocketManager.
 * getRoomIdsForAssignment`, `SocketManager.autoJoinJudgeRoom`,
 * `ScoringHandler.getAltRoomId` and `PerformanceOrderService.broadcast`. Two of
 * them carried their own slug↔display table that went up to "Competition V" —
 * a value neither the Competition nor the Score enum permits — and one of them
 * was outright wrong (see `alternateRoomId` below).
 *
 * The room ids and the authorization predicate that grants access to them must
 * agree exactly: `SocketManager.getRoomIdsForAssignment` is what auto-join uses
 * AND what `isJudgeAuthorizedForRoom` checks against. A judge auto-joined to a
 * room they would then be refused permission to act in is the failure this
 * single definition prevents.
 *
 * @module utils/data/scoring-room.util
 */

const {
  COMPETITION_TYPE_SLUGS,
  COMPETITION_TYPE_DISPLAYS,
  toCompetitionTypeDisplay,
  toCompetitionTypeSlug,
} = require('../../config/cop-rules');

/** Every scoring room id starts with this. */
const SCORING_ROOM_PREFIX = 'scoring_';

/**
 * The category a panel seat covers when it names none.
 *
 * A Scorer is routinely created without `competitionTypes` — the judge client
 * defaults them — so an empty list has always meant Competition I rather than
 * "no rooms at all".
 */
const DEFAULT_COMPETITION_TYPES = Object.freeze(['competition_1']);

/**
 * The competition types an assignment covers, with the empty-list default
 * applied.
 *
 * @param {string[]|null|undefined} competitionTypes
 * @returns {string[]}
 */
function assignmentCompetitionTypes(competitionTypes) {
  return Array.isArray(competitionTypes) && competitionTypes.length > 0
    ? competitionTypes
    : [...DEFAULT_COMPETITION_TYPES];
}

/**
 * Both room ids for one category, raw form first.
 *
 * Raw first is load-bearing: `autoJoinJudgeRoom` reports `roomIds[0]` back to
 * the client as the room it joined, and the client addresses its own
 * broadcasts to that value.
 *
 * Returns ONE id when the two forms coincide (i.e. the caller already passed a
 * display value), and an empty array when the category is incomplete — a room
 * id with an `undefined` in it is a room nobody can be in.
 *
 * @param {string} gender
 * @param {string} ageGroup
 * @param {string} competitionType - slug or display form
 * @returns {string[]}
 */
function scoringRoomIds(gender, ageGroup, competitionType) {
  if (!gender || !ageGroup) return [];

  const base = `${SCORING_ROOM_PREFIX}${gender}_${ageGroup}`;
  const raw = `${base}_${competitionType}`;
  const display = `${base}_${normalizeCompetitionType(competitionType)}`;

  return display === raw ? [raw] : [raw, display];
}

/**
 * A competition type in display form, defaulting to Competition I.
 *
 * Kept as its own function because the default on falsy input is behaviour the
 * socket layer relies on and `toCompetitionTypeDisplay` deliberately does not
 * have — it passes unknown input straight through so a caller can tell that a
 * value was not recognised.
 *
 * @param {string} competitionType
 * @returns {string}
 */
function normalizeCompetitionType(competitionType) {
  if (!competitionType) return 'Competition I';
  return toCompetitionTypeDisplay(competitionType);
}

/**
 * The OTHER form of a scoring room id, or null when there is no other form.
 *
 * Order matters, and getting it wrong was a live bug. The display values are
 * tested longest-first because `Competition I` is a prefix of `Competition II`
 * and `Competition III`: the previous implementation ran
 * `.replace('Competition I', 'competition_1')` first, so
 * `scoring_Male_Under14_Competition III` came back as
 * `scoring_Male_Under14_competition_1II` — a room with no members, so the
 * broadcast simply went nowhere and nothing reported it.
 * `COMPETITION_TYPE_DISPLAYS` is sorted longest-first for exactly this reason.
 *
 * @param {string} roomId
 * @returns {string|null}
 */
function alternateRoomId(roomId) {
  if (typeof roomId !== 'string' || !roomId.startsWith(SCORING_ROOM_PREFIX)) {
    return null;
  }

  for (const slug of COMPETITION_TYPE_SLUGS) {
    if (roomId.includes(slug)) {
      return roomId.replace(slug, toCompetitionTypeDisplay(slug));
    }
  }

  for (const display of COMPETITION_TYPE_DISPLAYS) {
    if (roomId.includes(display)) {
      return roomId.replace(display, toCompetitionTypeSlug(display));
    }
  }

  return null;
}

module.exports = {
  SCORING_ROOM_PREFIX,
  DEFAULT_COMPETITION_TYPES,
  assignmentCompetitionTypes,
  scoringRoomIds,
  normalizeCompetitionType,
  alternateRoomId,
};
