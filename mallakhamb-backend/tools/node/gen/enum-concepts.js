'use strict';

/**
 * The enum catalogue: which Mongoose enum fields are the same concept.
 *
 * This is the one hand-written input of `gen-enums`. Everything else (values,
 * order, subsets, behaviour) is read from the running Node code. A field that
 * matches no concept makes the generator fail, so a new Mongoose enum can't
 * slip past the catalogue.
 *
 * `fields`   regexes over `Model.path` (as printed in the report).
 * `source`   (server) => canonical value list from a Node config module, when
 *            Node has one. Without it, the canonical list is the union of the
 *            fields' values in first-seen order.
 * `behaviour` (server, values) => per-value facts read from Node, emitted as
 *            enum fields in Stage 2.
 * `subsets`  (server) => named subsets (Java constants on the enum).
 * `fieldName` the usual leaf name; a field spelled differently is drift.
 * `decisions` proposed decision per drift kind (from 08 §1/§3), for the lead
 *            to confirm. Proposals never change a stored or wire value.
 */

const cop = (server) => server('config/cop-rules');
const seats = (server) => server('config/judge-seats');
const slip = (server) => server('utils/scoring/judge-slip.util');

const CONCEPTS = [
  {
    name: 'Gender',
    fields: [/\.(gender|sex)$/],
    fieldName: 'gender',
    source: (server) => cop(server).GENDERS,
    decisions: {
      name: 'Java field is always `gender`; `TeamDocument` maps it with `@Field("sex")` (08 §3). Stored name unchanged.',
    },
  },
  {
    name: 'AgeGroup',
    fields: [/AgeGroup$/i],
    source: (server) => cop(server).CATEGORY_AGE_GROUPS,
    subsets: (server) => ({
      ENTRY: cop(server).AGE_GROUPS,
      CATEGORY: cop(server).CATEGORY_AGE_GROUPS,
    }),
    behaviour: (server, values) =>
      Object.fromEntries(values.map((v) => [v, { ageRange: cop(server).AGE_GROUP_RANGES[v] || null }])),
    decisions: {
      subset:
        'One enum. `AgeGroup.ENTRY` (athletes, teams, entries) and `AgeGroup.CATEGORY` (panels, score sheets, order, draws) are named sets on it; each document field is validated against the set Node uses (08 §3). Age ranges move to the rulebook (09), not the enum.',
    },
  },
  {
    name: 'CompetitionType',
    fields: [/\.competitionTypes?$/],
    source: (server) => cop(server).COMPETITION_TYPE_SLUGS,
    forms: (server, values) =>
      Object.fromEntries(values.map((v) => [v, { display: cop(server).toCompetitionTypeDisplay(v) }])),
    decisions: {
      form: 'One enum; slug is the wire value. `scores.competitionType` is declared `DisplayForm<CompetitionType>` and its converter writes `display()` and reads with `fromAny` (08 §4).',
      subset:
        '`Qualification.competitionType` keeps Node\'s restriction as a named set `CompetitionType.FINALS` (Competition II and III).',
    },
  },
  {
    name: 'Apparatus',
    fields: [/\.apparatus$/, /\.apparatusConfig\./, /\.apparatusByGender\./],
    source: (server) => cop(server).APPARATUS,
  },
  {
    name: 'JudgeSeat',
    fields: [/^Judge\.judgeType$/],
    source: (server) => seats(server).JUDGE_SEAT_TYPES,
    behaviour: (server, values) =>
      Object.fromEntries(
        values.map((v) => {
          const mapping = slip(server).JUDGE_ROLE_MAP[v];
          return [
            v,
            {
              seatNo: seats(server).SEAT_NO[v],
              isEvaluator: slip(server).isPanelJudgeType(v),
              scoreField: mapping ? mapping.field : null,
              slipRole: mapping ? mapping.role : null,
              shareable: seats(server).SHAREABLE_SEATS.includes(v),
            },
          ];
        }),
      ),
    subsets: (server) => ({
      EVALUATORS: slip(server).PANEL_JUDGE_TYPES,
      RECORDERS: seats(server).SHAREABLE_SEATS,
    }),
  },
  { name: 'JudgeRole', fields: [/\.judgeRole$/] },
  {
    name: 'Role',
    fields: [
      /^AccountRequest\.userType$/,
      /^AccountRequest\.decidedBy\.userType$/,
      /^RefreshToken\.userType$/,
      /^Admin\.role$/,
      /^AuditLog\.adminType$/,
    ],
    // `cookie.util.js` ROLES is Node's one ordered list, and it is the plan's rank order (08 §3).
    source: (server) => server('utils/security/cookie.util').ROLES,
    behaviour: (_server, values) => Object.fromEntries(values.map((v, i) => [v, { rank: i + 1 }])),
    decisions: {
      subset:
        'One `Role` enum. Each field keeps Node\'s allowed list as a named set (`Role.ACCOUNT_REQUESTERS`, `Role.ADMIN_ROLES`, `Role.AUDITED`, `Role.REQUEST_DECIDERS`), so a value Node would refuse is still refused (08 §1).',
    },
  },
  {
    name: 'CompetitionLevel',
    fields: [/\.level$/],
    source: (server) => server('config/competition-levels').COMPETITION_LEVELS,
  },
  { name: 'ChampionshipType', fields: [/^Competition\.championshipType$/] },
  { name: 'CompetitionStatus', fields: [/^Competition\.status$/] },
  { name: 'PaymentStatus', fields: [/\.paymentStatus$/] },
  { name: 'PaymentGateway', fields: [/\.paymentGateway$/] },
  { name: 'TransactionSource', fields: [/^Transaction\.source$/] },
  { name: 'TransactionType', fields: [/^Transaction\.type$/] },
  { name: 'AccountRequestKind', fields: [/^AccountRequest\.kind$/] },
  { name: 'AccountRequestStatus', fields: [/^AccountRequest\.status$/] },
  {
    name: 'EmailType',
    fields: [/^Player\.emailType$/, /^AccountRequest\.newEmailType$/],
    decisions: {
      subset:
        '`AccountRequest.newEmailType` keeps Node\'s restriction as a named set `EmailType.CHANGEABLE_TO` (a change request can\'t move to `none`).',
    },
  },
  { name: 'QualificationStatus', fields: [/^Qualification\.(slices\[\]\.)?status$/] },
  { name: 'SkipReason', fields: [/^Qualification\.skipped\[\]\.reason$/] },
  { name: 'WalkInStatus', fields: [/^WalkInRegistration\.status$/] },
  { name: 'RowSource', fields: [/^WalkInRegistration\.rows\[\]\.source$/] },
  { name: 'MatchChoice', fields: [/^WalkInRegistration\.rows\[\]\.matchChoice$/] },
  { name: 'ElementPhase', fields: [/\.elementSelections\[\]\.phase$/] },
  { name: 'ElementClass', fields: [/\.elementSelections\[\]\.class$/] },
  { name: 'CertificationLevel', fields: [/^JudgeAccount\.certificationLevel$/] },
  { name: 'SlipAttribution', fields: [/\.judgeSlips\[\]\.attribution$/] },
  {
    name: 'TeamSize',
    fields: [/^Competition\.maxTeamSize$/],
    numberPrefix: 'SIZE',
    source: (server) => server('utils/scoring/team-championship.util').TEAM_SIZES,
    behaviour: (server, values) =>
      Object.fromEntries(
        values.map((v) => [
          v,
          { countedPerApparatus: server('utils/scoring/team-championship.util').TEAM_SIZE_COUNTED[v] },
        ]),
      ),
  },
  { name: 'LevelSetBy', fields: [/^Player\.levelTeams\[\]\.setByType$/] },
  {
    name: 'PanelSize',
    fields: [/\.playerScores\[\]\.panelSize$/],
    numberPrefix: 'JUDGES',
    unlisted:
      'Not in the plan\'s 28 (08 §3). Proposed: a 29th kernel enum `PanelSize` (3, 4, 5); which calculation method each size uses stays in the rulebook (09).',
  },
];

/**
 * Enum-constrained fields that are COP rule values, not vocabulary. They
 * belong to the rulebook (generator 3), so the kernel gets no enum for them.
 */
const RULE_DATA_FIELDS = [
  { field: /\.judgeSlips\[\]\.bonusScore$/, rulebook: 'bonus values' },
  { field: /\.elementSelections\[\]\.value$/, rulebook: 'element class values (A/B/C)' },
];

module.exports = { CONCEPTS, RULE_DATA_FIELDS };
