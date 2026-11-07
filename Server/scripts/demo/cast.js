/**
 * The demo season: who exists, who plays where, who judges what.
 *
 * Pure and deterministic — `buildCast({ seed, today })` returns the same people
 * and the same stories for the same seed. Only the TEMPORARY dates (used while
 * the meets are open for scoring) and the live/upcoming meets depend on
 * `today`. Nothing here talks to the API; `seedDemo.js` does that.
 *
 * Shape of the season (docs/demo-seed-plan.md):
 *   - 18 season meets, 3 per level, Jan–Oct 2026, scored and then back-dated;
 *   - 1 live meet dated today, half scored;
 *   - 1 upcoming meet in December with registration open.
 *   - 12 clubs (one team per coach — the product reads a coach's FIRST team),
 *     each entering 2–4 levels.
 *   - Players are final with ONE team per level (owner rule 2026-10-28), so a
 *     player climbing District → State → National may change club per level.
 *
 * @module scripts/demo/cast
 */

const { createRng } = require('./rng');
const { MALE_FIRST, FEMALE_FIRST, SURNAMES } = require('./names');

const YEAR = 2026;
const EMAIL_DOMAIN = 'example.com';
const NAME_PREFIX = '[DEMO]';

const POLE = 'Pole Mallakhamb';
const HANGING = 'Hanging Mallakhamb';
const ROPE = 'Rope Mallakhamb';
const APPARATUS_BY_GENDER = { Male: [POLE, HANGING, ROPE], Female: [POLE, ROPE] };

const LEVEL_LABEL = {
  district: 'District', dso: 'DSO School', state: 'State',
  university: 'University', national: 'National', international: 'International',
};

/** Categories each kind of meet runs. School meets are juniors, university seniors. */
const CATEGORIES = {
  default: {
    Male: ['Under10', 'Under12', 'Under14', 'Under18', 'Above18'],
    Female: ['Under10', 'Under12', 'Under14', 'Under16', 'Above16'],
  },
  dso: {
    Male: ['Under10', 'Under12', 'Under14', 'Under18'],
    Female: ['Under10', 'Under12', 'Under14', 'Under16'],
  },
  university: {
    Male: ['Under18', 'Above18'],
    Female: ['Under16', 'Above16'],
  },
};
const categoriesFor = (level) => {
  const set = CATEGORIES[level] || CATEGORIES.default;
  return [
    ...set.Male.map((ageGroup) => ({ gender: 'Male', ageGroup })),
    ...set.Female.map((ageGroup) => ({ gender: 'Female', ageGroup })),
  ];
};

/** Age on 31 Dec 2026 for each bracket (COP 1.8.3; Under N includes N). */
const AGE_RANGE = {
  Under10: [8, 10], Under12: [11, 12], Under14: [13, 14], Under16: [15, 16],
  Under18: [15, 18], Above16: [17, 23], Above18: [19, 25],
};

/** The season, in order. `start` is where the meet ends up (back-dated). */
const SEASON = [
  { place: 'Mumbai', level: 'district', start: '2026-01-10' },
  { place: 'Pune', level: 'district', start: '2026-01-24' },
  { place: 'Thane', level: 'district', start: '2026-02-14' },
  { place: 'Nashik', level: 'dso', start: '2026-03-07' },
  { place: 'Satara', level: 'dso', start: '2026-03-21' },
  { place: 'Kolhapur', level: 'dso', start: '2026-03-28' },
  { place: 'Nagpur', level: 'state', start: '2026-04-11' },
  { place: 'Aurangabad', level: 'state', start: '2026-05-02' },
  { place: 'Solapur', level: 'state', start: '2026-05-23' },
  { place: 'Varanasi', level: 'university', start: '2026-06-06' },
  { place: 'Bhopal', level: 'university', start: '2026-06-20' },
  { place: 'Jaipur', level: 'university', start: '2026-06-27' },
  { place: 'Delhi', level: 'national', start: '2026-07-11' },
  { place: 'Bengaluru', level: 'national', start: '2026-08-01' },
  { place: 'Chennai', level: 'national', start: '2026-08-22' },
  { place: 'Goa', level: 'international', start: '2026-09-12' },
  { place: 'Hyderabad', level: 'international', start: '2026-09-26' },
  { place: 'Kolkata', level: 'international', start: '2026-10-17' },
];
const LIVE = { place: 'Ujjain', level: 'national', kind: 'live' };
const UPCOMING = { place: 'Ratnagiri', level: 'state', kind: 'upcoming', start: '2026-12-12' };

/** Competition I, I+II, I+III, I+II+III in turn, so every finals case shows. */
const TYPE_ROTATION = [
  ['competition_1'],
  ['competition_1', 'competition_2'],
  ['competition_1', 'competition_3'],
  ['competition_1', 'competition_2', 'competition_3'],
];

const CLUBS = [
  { id: 'c1', name: 'Shree Samarth Vyayam Mandir', city: 'Mumbai', state: 'Maharashtra', levels: ['district', 'state', 'national', 'international'], coach: ['Uday', 'Deshpande'] },
  { id: 'c2', name: 'Akhil Maharashtra Mallakhamb Kendra', city: 'Pune', state: 'Maharashtra', levels: ['district', 'state', 'national'], coach: ['Ganesh', 'Phadke'] },
  { id: 'c3', name: 'Jai Hanuman Vyayamshala', city: 'Thane', state: 'Maharashtra', levels: ['district', 'dso'], coach: ['Sachin', 'Mhatre'] },
  { id: 'c4', name: 'Ujjain Mallakhamb Akhada', city: 'Ujjain', state: 'Madhya Pradesh', levels: ['district', 'state', 'national', 'international'], coach: ['Ramesh', 'Chouhan'] },
  { id: 'c5', name: 'Narmada Krida Mandal', city: 'Jabalpur', state: 'Madhya Pradesh', levels: ['dso', 'state'], coach: ['Alok', 'Dubey'] },
  { id: 'c6', name: 'Sardar Patel Vyayam Shala', city: 'Vadodara', state: 'Gujarat', levels: ['dso', 'university'], coach: ['Hitesh', 'Parikh'] },
  { id: 'c7', name: 'Karnataka Mallakhamb Sangha', city: 'Bengaluru', state: 'Karnataka', levels: ['university', 'national'], coach: ['Prakash', 'Hegde'] },
  { id: 'c8', name: 'Chennai Mallar Kambam Academy', city: 'Chennai', state: 'Tamil Nadu', levels: ['university', 'international'], coach: ['Senthil', 'Murugan'] },
  { id: 'c9', name: 'Delhi Mallakhamb Academy', city: 'Delhi', state: 'Delhi', levels: ['dso', 'university'], coach: ['Rajiv', 'Malhotra'] },
  { id: 'c10', name: 'Raipur Mallakhamb Kendra', city: 'Raipur', state: 'Chhattisgarh', levels: ['national', 'international'], coach: ['Manoj', 'Sahu'] },
  { id: 'c11', name: 'Rajasthan Yuva Krida Kendra', city: 'Jaipur', state: 'Rajasthan', levels: ['university', 'international'], coach: ['Vikas', 'Shekhawat'] },
  { id: 'c12', name: 'Vidarbha Vyayam Prasarak Mandal', city: 'Nagpur', state: 'Maharashtra', levels: ['district', 'dso', 'state'], coach: ['Nitin', 'Wagh'] },
];

/** Where a level's higher-ranked athletes are recruited from, and how often. */
const RECRUIT = {
  state: { from: ['district', 'dso'], p: 0.55 },
  university: { from: ['state', 'district'], p: 0.3 },
  national: { from: ['state', 'district'], p: 0.65 },
  international: { from: ['national'], p: 0.75 },
};
/** A fresh athlete's ability, by the level they first appear at. */
const NEW_ABILITY = {
  district: [6.6, 8.8], dso: [6.4, 8.6], state: [7.2, 9.0],
  university: [6.9, 8.9], national: [7.7, 9.1], international: [8.1, 9.25],
};

/** Judge pool by home state (the Fairness board's home-state signal). */
const JUDGE_STATES = [
  ...Array(8).fill('Maharashtra'), ...Array(4).fill('Madhya Pradesh'),
  ...Array(3).fill('Gujarat'), ...Array(3).fill('Karnataka'), ...Array(3).fill('Tamil Nadu'),
  ...Array(3).fill('Delhi'), ...Array(2).fill('Chhattisgarh'), ...Array(2).fill('Rajasthan'),
];
const CERTIFICATIONS = ['International', 'National', 'National', 'State', 'State', 'District'];

const SEAT_ORDER = ['Senior Judge', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer', 'Time Keeper'];

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (date) => date.toISOString().slice(0, 10);
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDay(d);
};
const slug = (text) => String(text).toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');

/**
 * Build the whole season.
 *
 * @param {{seed?: number, today?: string}} options
 */
function buildCast({ seed = 2026, today = isoDay(new Date()) } = {}) {
  const rng = createRng(seed);
  const usedEmails = new Set();
  const usedNames = new Set();

  // ── Meets ────────────────────────────────────────────────────────────────
  // TEMPORARY dates first: every meet must be open (not past its end date)
  // while it is registered and judged. Spread from three weeks out so the fee
  // deadline (start − 7) is in the future too and nobody pays a late fee.
  const tempStart = (index) => addDays(today, 21 + index * 2);

  const meets = SEASON.map((m, index) => ({
    ...m,
    kind: 'season',
    order: index,
    // The app prints the year after the name, so the name carries none.
    name: `${NAME_PREFIX} ${m.place} ${LEVEL_LABEL[m.level]} Championship`,
    end: addDays(m.start, 1),
    tempStart: tempStart(index),
    tempEnd: addDays(tempStart(index), 1),
    competitionTypes: TYPE_ROTATION[index % 4],
    maxTeamSize: index % 2 === 0 ? 6 : 4,
    categories: categoriesFor(m.level),
  }));
  // The live meet runs from today for ten days, so a demo later this week
  // still finds it open. Re-run `--only=dates` to move it.
  meets.push({
    ...LIVE,
    order: SEASON.length,
    name: `${NAME_PREFIX} ${LIVE.place} ${LEVEL_LABEL[LIVE.level]} Open`,
    start: today,
    end: addDays(today, 10),
    tempStart: today,
    tempEnd: addDays(today, 10),
    competitionTypes: TYPE_ROTATION[3],
    maxTeamSize: 6,
    categories: categoriesFor(LIVE.level),
  });
  meets.push({
    ...UPCOMING,
    order: SEASON.length + 1,
    name: `${NAME_PREFIX} ${UPCOMING.place} ${LEVEL_LABEL[UPCOMING.level]} Winter Cup`,
    end: addDays(UPCOMING.start, 1),
    tempStart: UPCOMING.start,
    tempEnd: addDays(UPCOMING.start, 1),
    competitionTypes: TYPE_ROTATION[1],
    maxTeamSize: 6,
    categories: categoriesFor(UPCOMING.level),
  });

  // ── People helpers ───────────────────────────────────────────────────────
  const nameRng = rng.fork('names');
  function personName(gender, state) {
    const firsts = gender === 'Female' ? FEMALE_FIRST : MALE_FIRST;
    const surnames = SURNAMES[state] || SURNAMES.Maharashtra;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const firstName = nameRng.pick(firsts);
      const lastName = nameRng.pick(surnames);
      const key = `${firstName} ${lastName}`;
      if (!usedNames.has(key)) { usedNames.add(key); return { firstName, lastName }; }
    }
    throw new Error('ran out of unique names');
  }
  function emailFor(firstName, lastName, role) {
    const base = `${slug(firstName)}.${slug(lastName)}${role ? `.${role}` : ''}`;
    let email = `${base}@${EMAIL_DOMAIN}`;
    for (let n = 2; usedEmails.has(email); n += 1) email = `${base}${n}@${EMAIL_DOMAIN}`;
    usedEmails.add(email);
    return email;
  }
  const phoneRng = rng.fork('phones');
  const phone = () => `9${String(phoneRng.int(100000000, 999999999))}`;
  const passwordFor = (firstName) => `${firstName}@2026`;

  // ── Admins ───────────────────────────────────────────────────────────────
  const admins = [
    { key: 'a1', name: 'Meera Iyer', email: emailFor('Meera', 'Iyer', 'admin'), password: 'Meera@2026',
      levels: ['district', 'dso', 'state', 'university'] },
    { key: 'a2', name: 'Rohit Kapoor', email: emailFor('Rohit', 'Kapoor', 'admin'), password: 'Rohit@2026',
      levels: ['national', 'international'] },
  ];
  for (const meet of meets) meet.adminKey = admins.find((a) => a.levels.includes(meet.level)).key;

  // ── Clubs and coaches ────────────────────────────────────────────────────
  const clubs = CLUBS.map((club) => {
    const [firstName, lastName] = club.coach;
    usedNames.add(`${firstName} ${lastName}`);
    return {
      ...club,
      coach: {
        firstName, lastName,
        email: emailFor(firstName, lastName, 'coach'),
        phone: phone(),
        password: passwordFor(firstName),
      },
      // The rising squad improves fastest (story: coach trend goes up).
      growthBoost: club.id === 'c12' ? 0.07 : 0,
    };
  });
  const clubById = new Map(clubs.map((c) => [c.id, c]));

  // ── Athletes ─────────────────────────────────────────────────────────────
  const athletes = [];
  const athleteRng = rng.fork('athletes');

  function makeAthlete({ gender, ageGroup, level, club, ability, firstName, lastName, tags = [] }) {
    const name = firstName ? { firstName, lastName } : personName(gender, club.state);
    if (firstName) usedNames.add(`${firstName} ${lastName}`);
    const [minAge, maxAge] = AGE_RANGE[ageGroup];
    const age = athleteRng.int(minAge, maxAge);
    const dob = `${YEAR - age}-${pad2(athleteRng.int(1, 12))}-${pad2(athleteRng.int(1, 28))}`;
    const [lo, hi] = NEW_ABILITY[level];
    const offered = APPARATUS_BY_GENDER[gender];
    const isStar = tags.includes('star');
    let apparatus;
    if (isStar) apparatus = [...offered];
    else {
      const first = athleteRng.pick(offered);
      apparatus = [first];
      if (athleteRng.chance(0.35)) {
        const second = athleteRng.pick(offered.filter((a) => a !== first));
        apparatus.push(second);
      }
    }
    const athlete = {
      key: `p${athletes.length + 1}`,
      ...name,
      gender,
      ageGroup,
      dateOfBirth: dob,
      phone: phone(),
      password: passwordFor(name.firstName),
      emailType: 'self',
      registeredBy: 'self',
      ability: ability ?? Number(athleteRng.float(lo, hi).toFixed(2)),
      growth: Number(athleteRng.float(-0.015, 0.05).toFixed(3)) + club.growthBoost,
      affinity: Object.fromEntries(offered.map((a) => [a, Number(athleteRng.float(-0.25, 0.25).toFixed(2))])),
      weak: athleteRng.pick(['difficulty', 'combination', 'execution']),
      apparatus,
      teams: {},
      tags,
      homeClub: club.id,
    };
    athlete.email = emailFor(athlete.firstName, athlete.lastName);
    athletes.push(athlete);
    return athlete;
  }

  // Rosters: `${clubId}:${level}` → athlete keys. Seeded with the two stars,
  // whose path is fixed so the cheat sheet can name it.
  const rosters = new Map();
  const rosterOf = (clubId, level) => {
    const key = `${clubId}:${level}`;
    if (!rosters.has(key)) rosters.set(key, []);
    return rosters.get(key);
  };
  const place = (athlete, clubId, level) => {
    athlete.teams[level] = clubId;
    rosterOf(clubId, level).push(athlete.key);
  };

  const starM = makeAthlete({
    gender: 'Male', ageGroup: 'Under18', level: 'district', club: clubById.get('c3'),
    ability: 9.05, firstName: 'Aditya', lastName: 'Pawar', tags: ['star'],
  });
  starM.growth = 0.03;
  place(starM, 'c3', 'district');
  place(starM, 'c3', 'dso');
  place(starM, 'c1', 'state');
  place(starM, 'c1', 'national');
  place(starM, 'c1', 'international');

  const starF = makeAthlete({
    gender: 'Female', ageGroup: 'Above16', level: 'district', club: clubById.get('c12'),
    ability: 8.95, firstName: 'Ishita', lastName: 'Deshmukh', tags: ['star'],
  });
  starF.growth = 0.035;
  place(starF, 'c12', 'district');
  place(starF, 'c12', 'state');
  place(starF, 'c4', 'national');
  place(starF, 'c4', 'international');

  const LADDER = ['district', 'dso', 'state', 'university', 'national', 'international'];
  const ROSTER_SIZE = 12;
  const fillRng = rng.fork('rosters');

  for (const level of LADDER) {
    const cats = categoriesFor(level);
    for (const club of clubs.filter((c) => c.levels.includes(level))) {
      const roster = rosterOf(club.id, level);
      const byCat = (cat) => roster.filter((key) => {
        const a = athletes.find((x) => x.key === key);
        return a.gender === cat.gender && a.ageGroup === cat.ageGroup;
      }).length;

      // One per category first (every panel has someone from most clubs),
      // then the rest spread at random, at most three per category.
      const wanted = [];
      for (const cat of cats) if (byCat(cat) === 0) wanted.push(cat);
      while (roster.length + wanted.length < ROSTER_SIZE) {
        const cat = fillRng.pick(cats);
        const already = byCat(cat) + wanted.filter((w) => w.gender === cat.gender && w.ageGroup === cat.ageGroup).length;
        if (already < 3) wanted.push(cat);
      }

      for (const cat of wanted) {
        const free = (a) => a.gender === cat.gender && a.ageGroup === cat.ageGroup && !a.teams[level];
        let chosen = null;

        // The club's own athletes from the levels below come up with it.
        const own = athletes.filter((a) => free(a) && Object.entries(a.teams)
          .some(([lvl, cid]) => cid === club.id && LADDER.indexOf(lvl) < LADDER.indexOf(level)));
        if (own.length && fillRng.chance(0.7)) {
          chosen = own.sort((x, y) => y.ability - x.ability)[0];
        }

        // Otherwise, sometimes, the best of the levels below are recruited.
        const recruit = RECRUIT[level];
        if (!chosen && recruit && fillRng.chance(recruit.p)) {
          const pool = athletes
            .filter((a) => free(a) && recruit.from.some((lvl) => a.teams[lvl]))
            .sort((x, y) => y.ability - x.ability)
            .slice(0, 4);
          if (pool.length) chosen = fillRng.pick(pool);
        }

        if (!chosen) chosen = makeAthlete({ gender: cat.gender, ageGroup: cat.ageGroup, level, club });
        place(chosen, club.id, level);
      }
    }
  }

  // No-email children (single level, young): three registered by their coach,
  // three by a guardian with the parent's address. They sign in by Player ID.
  const young = athletes.filter((a) => ['Under10', 'Under12'].includes(a.ageGroup)
    && Object.keys(a.teams).length === 1 && !a.tags.length);
  young.slice(0, 3).forEach((a) => {
    a.emailType = 'none'; a.registeredBy = 'coach'; a.email = null;
  });
  young.slice(3, 6).forEach((a) => {
    a.emailType = 'guardian';
    a.guardian = { name: `${slug(a.lastName) ? `Mr ${a.lastName}` : 'Parent'}`, relation: 'Father', phone: a.phone };
    a.guardianEmail = emailFor('parent', a.lastName);
    a.email = null;
  });

  // Climbers: athletes at three or more levels.
  for (const a of athletes) {
    if (Object.keys(a.teams).length >= 3 && !a.tags.includes('star')) a.tags.push('climber');
  }

  // ── Entries: which athletes each club fields at each meet ────────────────
  const entryRng = rng.fork('entries');
  for (const meet of meets) {
    const levelClubs = clubs.filter((c) => c.levels.includes(meet.level));
    const indexInLevel = meets.filter((m) => m.level === meet.level && m.kind === 'season')
      .findIndex((m) => m.place === meet.place);
    meet.entries = [];
    levelClubs.forEach((club, i) => {
      // One club sits out the second meet of each level (a field of 4, not 5).
      if (meet.kind === 'season' && indexInLevel === 1 && i === levelClubs.length - 1) return;
      const roster = rosterOf(club.id, meet.level).map((key) => athletes.find((a) => a.key === key));
      const seen = new Set();
      const squad = roster.filter((a) => {
        const cat = `${a.gender}/${a.ageGroup}`;
        const first = !seen.has(cat);
        seen.add(cat);
        return first || a.tags.length > 0 || entryRng.chance(0.85);
      }).filter((a) => meet.categories.some((c) => c.gender === a.gender && c.ageGroup === a.ageGroup));
      meet.entries.push({ clubId: club.id, athletes: squad.map((a) => a.key) });
    });
  }

  // ── Judges ───────────────────────────────────────────────────────────────
  const judges = JUDGE_STATES.map((state, i) => {
    const gender = i % 3 === 1 ? 'Female' : 'Male';
    const { firstName, lastName } = personName(gender, state);
    return {
      key: `j${i + 1}`,
      firstName, lastName,
      email: emailFor(firstName, lastName, 'judge'),
      phone: phone(),
      password: passwordFor(firstName),
      stateUnit: state,
      certificationLevel: CERTIFICATIONS[i % CERTIFICATIONS.length],
      strictness: Number(rng.fork(`strict${i}`).normal(0.04).toFixed(3)),
      bias: {},
      tags: [],
    };
  });
  const rename = (judge, firstName, lastName) => {
    usedNames.delete(`${judge.firstName} ${judge.lastName}`);
    usedEmails.delete(judge.email);
    Object.assign(judge, { firstName, lastName, password: passwordFor(firstName) });
    judge.email = emailFor(firstName, lastName, 'judge');
  };

  // Story judges.
  const partial = judges[0]; // Maharashtra
  rename(partial, 'Vikram', 'Gaikwad');
  partial.strictness = 0;
  partial.bias = { c2: 0.4 };
  partial.tags.push('partial');
  partial.certificationLevel = 'State';

  const strict = judges[1]; // Maharashtra
  rename(strict, 'Sunita', 'Karande');
  strict.strictness = -0.25;
  strict.tags.push('strict');
  strict.certificationLevel = 'National';

  const thin = judges[8]; // Madhya Pradesh
  rename(thin, 'Rakesh', 'Raghuwanshi');
  thin.strictness = 0;
  thin.bias = { c10: 0.35 };
  thin.tags.push('thin');

  // ── Seats per meet ───────────────────────────────────────────────────────
  // One set of seats per meet, as the e2e plan does (panels are per category
  // and apparatus, but the same people sit them all).
  const seatRng = rng.fork('seats');
  const load = new Map(judges.map((j) => [j.key, 0]));
  const PARTIAL_AT = ['Pune', 'Nagpur', 'Aurangabad', 'Delhi'];
  const STRICT_AT = ['Mumbai', 'Nashik', 'Varanasi', 'Bengaluru', 'Goa', 'Kolkata'];

  for (const meet of meets) {
    const seats = {};
    const taken = new Set();
    const take = (seat, judge) => { seats[seat] = judge.key; taken.add(judge.key); load.set(judge.key, load.get(judge.key) + 1); };

    if (PARTIAL_AT.includes(meet.place)) take('Judge 1', partial);
    if (STRICT_AT.includes(meet.place)) take('Judge 2', strict);
    if (meet.kind === 'live') take('Judge 3', thin);

    const others = judges.filter((j) => !j.tags.length);
    const next = (filter = () => true) => {
      const pool = others.filter((j) => !taken.has(j.key) && filter(j));
      const least = Math.min(...pool.map((j) => load.get(j.key)));
      return seatRng.pick(pool.filter((j) => load.get(j.key) === least));
    };

    take('Senior Judge', next((j) => ['International', 'National'].includes(j.certificationLevel)));
    for (const seat of ['Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Scorer']) {
      if (!seats[seat]) take(seat, next());
    }
    // The Time Keeper is the Scorer at every third meet (the role popup case).
    if (meet.order % 3 === 0) seats['Time Keeper'] = seats.Scorer;
    else take('Time Keeper', next());
    meet.seats = Object.fromEntries(SEAT_ORDER.filter((s) => seats[s]).map((s) => [s, seats[s]]));

    // Panel size per category, every size present where there is room.
    const sizes = seatRng.shuffle(meet.categories.map((_, i) => [3, 4, 5][i % 3]));
    meet.panels = meet.categories.map((cat, i) => ({ ...cat, size: sizes[i] }));
  }

  // ── Planted ties ─────────────────────────────────────────────────────────
  // Two athletes of different clubs, same category and apparatus, on a
  // 3-judge panel, given identical marks. `time` decides it (COP §1.12 for a
  // 3-judge panel), or — with the same time — a lucky draw is owed.
  const ties = [];
  function plantTie(placeName, mode) {
    const meet = meets.find((m) => m.place === placeName);
    const athleteOf = (key) => athletes.find((a) => a.key === key);
    for (const panel of meet.panels.filter((p) => p.size === 3)) {
      const inPanel = meet.entries.flatMap((e) => e.athletes.map((k) => ({ clubId: e.clubId, a: athleteOf(k) })))
        .filter(({ a }) => a.gender === panel.gender && a.ageGroup === panel.ageGroup && !a.tags.length);
      for (let i = 0; i < inPanel.length; i += 1) {
        for (let j = i + 1; j < inPanel.length; j += 1) {
          if (inPanel[i].clubId === inPanel[j].clubId) continue;
          const shared = inPanel[i].a.apparatus.find((x) => inPanel[j].a.apparatus.includes(x));
          if (!shared) continue;
          const tie = {
            place: placeName, mode, gender: panel.gender, ageGroup: panel.ageGroup, apparatus: shared,
            athletes: [inPanel[i].a.key, inPanel[j].a.key],
          };
          ties.push(tie);
          return tie;
        }
      }
    }
    return null;
  }
  plantTie('Pune', 'time');       // settled by the clock
  plantTie('Delhi', 'draw');      // settled by a recorded lucky draw
  plantTie(LIVE.place, 'awaiting'); // waits for the admin, live in the demo

  return {
    seed,
    today,
    year: YEAR,
    meets,
    admins,
    clubs,
    athletes,
    judges,
    ties,
    rosters: Object.fromEntries(rosters),
    apparatusByGender: APPARATUS_BY_GENDER,
  };
}

module.exports = {
  buildCast,
  EMAIL_DOMAIN,
  NAME_PREFIX,
  LEVEL_LABEL,
  APPARATUS_BY_GENDER,
  SEAT_ORDER,
  addDays,
};
