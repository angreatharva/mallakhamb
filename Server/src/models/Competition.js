const mongoose = require('mongoose');
const { AGE_GROUPS, CATEGORY_AGE_GROUPS, GENDERS } = require('../config/cop-rules');
const { TEAM_SIZES } = require('../utils/scoring/team-championship.util');
const { COMPETITION_LEVELS, LEVELS_SENTENCE } = require('../config/competition-levels');

const competitionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Competition name is required'],
    trim: true
  },
  level: {
    type: String,
    required: [true, 'Competition level is required'],
    enum: {
      values: [...COMPETITION_LEVELS],
      message: `Level must be ${LEVELS_SENTENCE}`
    }
  },
  competitionTypes: [{
    type: String,
    enum: {
      values: ['competition_1', 'competition_2', 'competition_3'],
      message: 'Competition type must be competition_1, competition_2, or competition_3'
    }
  }],
  apparatusConfig: {
    type: Map,
    of: [{
      type: String,
      enum: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb']
    }],
    default: {}
  },
  /*
   * The apparatus each gender competes on, per competition type:
   * `{ competition_1: { Male: [...], Female: [...] } }`.
   *
   * The source of truth when present; `apparatusConfig` above is derived from
   * it on write (the union of both genders) so every reader that predates the
   * split keeps working. Absent on meets saved before it — those fall back to
   * `apparatusConfig` for both genders. See utils/data/competition-apparatus.util.
   */
  /*
   * Max athletes a team may enter per gender + age group in this meet — 4 or
   * 6, chosen by the superadmin. It also decides the Team Championship count:
   * 4 → best 3 per apparatus, 6 → best 5 (utils/scoring/team-championship.util).
   *
   * Required on create (super-admin.service), not here: meets saved before
   * it existed have none, and are read as 6 and uncapped.
   */
  maxTeamSize: {
    type: Number,
    enum: {
      values: TEAM_SIZES,
      message: `Max team size must be one of: ${TEAM_SIZES.join(', ')}`
    }
  },
  apparatusByGender: {
    type: Map,
    of: new mongoose.Schema({
      Male: [{ type: String, enum: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'] }],
      Female: [{ type: String, enum: ['Pole Mallakhamb', 'Hanging Mallakhamb', 'Rope Mallakhamb'] }]
    }, { _id: false }),
    default: undefined
  },
  place: {
    type: String,
    required: [true, 'Competition place is required'],
    trim: true
  },
  year: {
    type: Number,
    required: [true, 'Competition year is required'],
    min: [2000, 'Year must be 2000 or later'],
    max: [2100, 'Year must be 2100 or earlier']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return !this.startDate || value >= this.startDate;
      },
      message: 'End date cannot be before start date'
    }
  },
  /**
   * ── Registration / fee window ──────────────────────────────────────────
   *
   * `registrationOpenDate` — first day entry fees can be paid.
   * `feeDueDate`           — LAST day the base fee alone is accepted.
   * `lateFee`              — per-player penalty charged on every payment made
   *                          after `feeDueDate` and up to 23:59 on `endDate`.
   *
   * All three are optional: competitions created before this feature still
   * validate, and one with no `feeDueDate` simply never charges a late fee.
   *
   * The window itself is resolved in exactly ONE place —
   * `src/config/payment.config.js#resolveFeeWindow` — mirrored for the browser
   * in `Web/src/utils/scoring/competitionFee.js`. Never re-derive the phase
   * from these dates by hand; a second comparison is a second set of boundary
   * bugs, and this one decides how much money a coach is charged.
   *
   * Cross-field ordering (open <= due <= end) is enforced in the SERVICE, next
   * to the `playerFee` check. A schema validator cannot do it reliably: the
   * repository updates through `findByIdAndUpdate`, where `this` is the query
   * and the sibling paths are not readable. The `endDate` validator above has
   * the same limitation and is kept for parity, not relied on.
   */
  registrationOpenDate: {
    type: Date
  },
  feeDueDate: {
    type: Date
  },
  lateFee: {
    type: Number,
    default: 0,
    min: [0, 'Late fee cannot be negative']
  },
  /*
   * Scored before automatic finals existed: its Competition II / III entries
   * were chosen by coaches and stay as they are; the qualification engine
   * leaves this meet alone (migration 016, docs/qualification-plan.md).
   */
  legacyFinals: {
    type: Boolean,
    default: false
  },
  // Ages are measured on 31 December of the year the meet is held — always
  // derived from `startDate` (cop-rules#ageCutoffYear). The old per-meet
  // `ageCutoffYear` override is gone (migration 015 removed saved values).
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: {
      values: ['upcoming', 'ongoing', 'completed'],
      message: 'Status must be upcoming, ongoing, or completed'
    },
    default: 'upcoming'
  },
  admins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }],
  // Embedded teams array - replaces CompetitionTeam model
  registeredTeams: [{
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true
    },
    coach: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coach',
      required: true
    },
    players: [{
      player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
      },
      ageGroup: {
        type: String,
        enum: AGE_GROUPS
      },
      gender: {
        type: String,
        enum: GENDERS
      },
      /*
       * The apparatus this athlete is entered for, keyed by competition-type
       * slug: `{ competition_1: ['Pole Mallakhamb'], competition_3: [...] }`.
       *
       * Mixed because three shapes exist in stored data — a bare string, a flat
       * list, and this object. Migration 008 rewrites the first two, and
       * `utils/data/apparatus.util` still reads all three so a row that has not
       * been migrated degrades instead of going blank. Everything WRITTEN from
       * 008 onward goes through `toCanonicalApparatus`, which is the only
       * function that should ever produce a value for this path.
       *
       * Do not "simplify" it to `[String]`: the array form cannot say that an
       * athlete is on Pole in Competition I and Rope in Competition III, which
       * `Competition.apparatusConfig` already models per type and COP requires
       * for Competition III.
       */
      apparatus: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
      }
    }],
    isSubmitted: {
      type: Boolean,
      default: false
    },
    submittedAt: {
      type: Date
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'pending'
    },
    paymentAmount: {
      type: Number
    },
    paymentGateway: {
      type: String,
      enum: ['razorpay'],
    },
    paymentOrderId: {
      type: String,
      trim: true,
    },
    paymentId: {
      type: String,
      trim: true,
    },
    paymentSignature: {
      type: String,
      trim: true,
    },
    paymentVerifiedAt: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  ageGroups: [{
    gender: {
      type: String,
      enum: GENDERS,
      required: true
    },
    ageGroup: {
      type: String,
      enum: AGE_GROUPS,
      required: true
    }
  }],
  playerFee: {
    type: Number,
    required: [true, 'Player fee is required'],
    min: [0, 'Player fee cannot be negative']
  },
  apparatusFees: {
    type: Map,
    of: Number,
    default: {}
  },
  startedAgeGroups: [{
    gender: {
      type: String,
      enum: GENDERS,
      required: true
    },
    ageGroup: {
      type: String,
      enum: CATEGORY_AGE_GROUPS,
      required: true
    },
    competitionType: {
      type: String,
      enum: ['competition_1', 'competition_2', 'competition_3'],
      required: true
    },
    startedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // ── v2 spec additions ──────────────────────────────────────────────
  // COP edition this competition's rules are based on (v2 §1).
  editionRef: {
    type: String,
    default: 'COP Nov 2022'
  },
  // Qualification threshold percentage for Competition II/III eligibility
  // (v2 §6.1, rule 1.11.A.i). Admin-configurable, defaults to 60%.
  qualificationThresholdPct: {
    type: Number,
    default: 60.0,
    min: 0,
    max: 100
  },
  // Championship type — determines which age-group/apparatus engine applies
  // (v2 §8, §10.2). National Games bypasses age limits; Khelo India fixes U18.
  championshipType: {
    type: String,
    enum: ['national', 'khelo_india', 'national_games', 'invitational', 'district_state', null],
    default: null
  }
}, {
  timestamps: true
});

// Indexes
competitionSchema.index({ name: 1, year: 1, place: 1 }, { unique: true });
competitionSchema.index({ status: 1, startDate: 1 });

/**
 * Soft delete. `BaseRepository` appends `isDeleted != true` to EVERY read on
 * this model, so it is part of essentially every competition query in the app.
 * Built by migration 002 and declared by no schema.
 */
competitionSchema.index({ isDeleted: 1 });
competitionSchema.index({ year: 1 });
competitionSchema.index({ admins: 1 });
competitionSchema.index({ competitionTypes: 1 });
competitionSchema.index({ 'ageGroups.gender': 1, 'ageGroups.ageGroup': 1 });

/**
 * "Which registration placed this Razorpay order?" — the only lookup the payment
 * webhook performs (`CompetitionRepository.applyPaymentWebhookResult`).
 *
 * Sparse because most registrations never reach checkout, so the field is unset
 * on the majority of the array entries and there is no point indexing those.
 * NOT unique: a coach who abandons a checkout and starts a new one leaves the
 * old order id behind, and a unique index would refuse the retry.
 */
competitionSchema.index({ 'registeredTeams.paymentOrderId': 1 }, { sparse: true });
competitionSchema.index({ 'startedAgeGroups.gender': 1, 'startedAgeGroups.ageGroup': 1, 'startedAgeGroups.competitionType': 1 });

/**
 * Entry lookups by the three references a registration holds.
 *
 * `Team` has no `competition` and `Player` has no `competition` — this array IS
 * the record of who is entered — so "which meets is this coach in?" and "which
 * meets is this athlete entered in?" can only be asked of these sub-paths.
 *
 * Declared here rather than left to migration 001, which is where `.team` and
 * `.coach` used to live alone. Since `connection.js` sets
 * `autoIndex: isDevelopment()`, that meant a database built from the schema had
 * neither of them while a migrated one had both — the two-sources-of-truth
 * problem `infrastructure/database/index-manager.js` exists to end. The schema
 * is authoritative; add index declarations here, never in a migration.
 *
 * `registeredTeams.players.player` was indexed NOWHERE, and it is read on every
 * athlete profile load (`player.service.getPlayerProfile`) and every
 * `getAssignedCompetitions` for a player — a collection scan across every
 * competition, each of which is a multi-megabyte document.
 *
 * Note migration 001 also builds `registeredTeams.paymentStatus`, which no query
 * in the codebase uses. It is multikey write cost for nothing. Left in place
 * deliberately: dropping an index is an operational decision, and the index
 * manager reports undeclared indexes rather than removing them.
 */
competitionSchema.index({ 'registeredTeams.coach': 1 });
competitionSchema.index({ 'registeredTeams.team': 1 });
competitionSchema.index({ 'registeredTeams.players.player': 1 });

// Method to add admin to competition
competitionSchema.methods.addAdmin = function(adminId) {
  // Check if admin already exists
  const adminExists = this.admins.some(admin => admin.toString() === adminId.toString());
  
  if (!adminExists) {
    this.admins.push(adminId);
  }
  
  return this.save();
};

// Method to remove admin from competition
competitionSchema.methods.removeAdmin = function(adminId) {
  this.admins = this.admins.filter(admin => admin.toString() !== adminId.toString());
  return this.save();
};

// Method to set initial status based on start date
competitionSchema.methods.setInitialStatus = function() {
  const now = new Date();
  
  if (now < this.startDate) {
    this.status = 'upcoming';
  } else if (now >= this.startDate && now <= this.endDate) {
    this.status = 'ongoing';
  } else {
    this.status = 'completed';
  }
  
  return this;
};

// Method to update competition status with validation
competitionSchema.methods.updateCompetitionStatus = function(newStatus) {
  const now = new Date();
  
  // Validate status transitions based on dates
  if (newStatus === 'ongoing') {
    if (now < this.startDate) {
      throw new Error('Cannot set status to ongoing before start date');
    }
  } else if (newStatus === 'completed') {
    if (now <= this.endDate) {
      throw new Error('Cannot set status to completed before end date');
    }
  }
  
  this.status = newStatus;
  return this.save();
};

// Legacy method for backward compatibility - auto-updates status based on dates
competitionSchema.methods.updateStatus = function() {
  const now = new Date();
  
  if (now < this.startDate) {
    this.status = 'upcoming';
  } else if (now >= this.startDate && now <= this.endDate) {
    this.status = 'ongoing';
  } else {
    this.status = 'completed';
  }
  
  return this.save();
};

// Method to check if competition is active
competitionSchema.methods.isActive = function() {
  const now = new Date();
  return now >= this.startDate && now <= this.endDate && this.status === 'ongoing';
};

// Method to get competition type labels
competitionSchema.methods.getCompetitionTypeLabels = function() {
  const labels = {
    'competition_1': 'Competition I',
    'competition_2': 'Competition II',
    'competition_3': 'Competition III'
  };
  return this.competitionTypes.map(type => labels[type] || 'Unknown').join(', ');
};

// Static method to get all competition type labels
competitionSchema.statics.getCompetitionTypeLabels = function() {
  return {
    'competition_1': 'Competition I - Team Championship & Qualifier',
    'competition_2': 'Competition II - All Round Individual Final',
    'competition_3': 'Competition III - Apparatus Championship'
  };
};

// Method to find a registered team
competitionSchema.methods.findRegisteredTeam = function(teamId) {
  return this.registeredTeams.find(rt => rt.team.toString() === teamId.toString());
};

// Method to find a registered team by ID
competitionSchema.methods.findRegisteredTeamById = function(registeredTeamId) {
  return this.registeredTeams.id(registeredTeamId);
};

// Method to register a team
competitionSchema.methods.registerTeam = function(teamId, coachId) {
  const existing = this.findRegisteredTeam(teamId);
  if (existing) {
    return existing;
  }
  
  this.registeredTeams.push({
    team: teamId,
    coach: coachId,
    players: [],
    isSubmitted: false,
    paymentStatus: 'pending',
    isActive: true
  });
  
  return this.registeredTeams[this.registeredTeams.length - 1];
};

// Method to add player to registered team
competitionSchema.methods.addPlayerToTeam = function(teamId, playerId, ageGroup, gender) {
  const registeredTeam = this.findRegisteredTeam(teamId);
  if (!registeredTeam) {
    throw new Error('Team not registered for this competition');
  }
  
  const existingPlayer = registeredTeam.players.find(p => p.player && p.player.toString() === playerId.toString());
  if (existingPlayer) {
    existingPlayer.ageGroup = ageGroup;
    existingPlayer.gender = gender;
  } else {
    registeredTeam.players.push({ player: playerId, ageGroup, gender });
  }
  
  return registeredTeam;
};

// Method to remove player from registered team
competitionSchema.methods.removePlayerFromTeam = function(teamId, playerId) {
  const registeredTeam = this.findRegisteredTeam(teamId);
  if (!registeredTeam) {
    throw new Error('Team not registered for this competition');
  }
  
  registeredTeam.players = registeredTeam.players.filter(p => !p.player || p.player.toString() !== playerId.toString());
  return registeredTeam;
};

module.exports = mongoose.model('Competition', competitionSchema);
