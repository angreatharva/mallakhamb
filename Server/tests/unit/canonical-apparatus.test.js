/**
 * `registeredTeams[].players[].apparatus` is written in ONE shape now.
 *
 * The field is Mixed and held three: a bare string, a flat list, and an object
 * keyed by competition type. That was a live divergence, not just history —
 * `CoachDashboard.jsx` posts the flat list and the superadmin's
 * `AddPlayerForm.jsx` posts the object, while `coach.routes` validated it as an
 * array and `coach.service` defaulted it to `{}`.
 *
 * The object is canonical because it is the only shape that can express what
 * `Competition.apparatusConfig` already models per type. The tests that matter
 * most here are the two that prove the change is an ENCODING change and not a
 * change of meaning: the fee an athlete is charged, and the roster a panel is
 * shown, must both come out identical.
 */

const {
  apparatusList,
  toCanonicalApparatus,
  isCanonicalApparatus,
} = require('../../src/utils/data/apparatus.util');
const { calculatePlayerFee } = require('../../src/config/payment.config');

const ALL_TYPES = ['competition_1', 'competition_2', 'competition_3'];

describe('toCanonicalApparatus', () => {
  it('spreads a bare string across the meet\'s competition types', () => {
    expect(toCanonicalApparatus('Pole Mallakhamb', ['competition_1', 'competition_3']))
      .toEqual({
        competition_1: ['Pole Mallakhamb'],
        competition_3: ['Pole Mallakhamb'],
      });
  });

  it('spreads a flat list the same way', () => {
    expect(toCanonicalApparatus(['Pole Mallakhamb', 'Rope Mallakhamb'], ['competition_1']))
      .toEqual({ competition_1: ['Pole Mallakhamb', 'Rope Mallakhamb'] });
  });

  it('leaves an already-canonical object alone', () => {
    const stored = {
      competition_1: ['Pole Mallakhamb'],
      competition_3: ['Rope Mallakhamb'],
    };

    expect(toCanonicalApparatus(stored, ALL_TYPES)).toEqual(stored);
  });

  it('is idempotent — running it twice changes nothing', () => {
    const once = toCanonicalApparatus(['Pole Mallakhamb'], ALL_TYPES);
    expect(toCanonicalApparatus(once, ALL_TYPES)).toEqual(once);
  });

  it('normalises a display-form key to its slug', () => {
    expect(toCanonicalApparatus({ 'Competition I': ['Pole Mallakhamb'] }, ALL_TYPES))
      .toEqual({ competition_1: ['Pole Mallakhamb'] });
  });

  it('drops keys that are not competition types, which is where ambiguity crept in', () => {
    expect(toCanonicalApparatus({ somethingElse: ['Pole Mallakhamb'] }, ALL_TYPES)).toEqual({});
  });

  it('returns {} for nothing at all, matching the schema default', () => {
    expect(toCanonicalApparatus(undefined, ALL_TYPES)).toEqual({});
    expect(toCanonicalApparatus(null, ALL_TYPES)).toEqual({});
    expect(toCanonicalApparatus('', ALL_TYPES)).toEqual({});
    expect(toCanonicalApparatus([], ALL_TYPES)).toEqual({});
  });

  it('falls back to every competition type when the meet declares none', () => {
    expect(Object.keys(toCanonicalApparatus('Pole Mallakhamb', []))).toEqual(ALL_TYPES);
  });

  it('does not share one array between the types it spreads across', () => {
    // A shared reference would let an edit to one category silently rewrite
    // the others.
    const canonical = toCanonicalApparatus(['Pole Mallakhamb'], ALL_TYPES);
    canonical.competition_1.push('Rope Mallakhamb');

    expect(canonical.competition_2).toEqual(['Pole Mallakhamb']);
  });
});

describe('isCanonicalApparatus', () => {
  it('accepts the canonical object and the empty default', () => {
    expect(isCanonicalApparatus({ competition_1: ['Pole Mallakhamb'] })).toBe(true);
    expect(isCanonicalApparatus({})).toBe(true);
  });

  it('rejects the two legacy shapes and a half-migrated one', () => {
    expect(isCanonicalApparatus('Pole Mallakhamb')).toBe(false);
    expect(isCanonicalApparatus(['Pole Mallakhamb'])).toBe(false);
    expect(isCanonicalApparatus({ competition_1: 'Pole Mallakhamb' })).toBe(false);
    expect(isCanonicalApparatus({ notAType: ['Pole Mallakhamb'] })).toBe(false);
    // Display keys read fine but are not the stored spelling.
    expect(isCanonicalApparatus({ 'Competition I': ['Pole Mallakhamb'] })).toBe(false);
    // An empty list reads the same as no key, but the normaliser drops it —
    // calling it canonical would leave 008 unable to tidy it.
    expect(isCanonicalApparatus({ competition_1: [] })).toBe(false);
  });

  it('holds the invariant migration 008 depends on', () => {
    // isCanonical(v) implies toCanonical(v) === v, so a skipped row really
    // needed no rewrite.
    const values = [
      'Pole Mallakhamb',
      ['Pole Mallakhamb', 'Rope Mallakhamb'],
      { competition_1: ['Pole Mallakhamb'] },
      { 'Competition I': ['Pole Mallakhamb'] },
      { competition_1: [] },
      { notAType: ['Pole Mallakhamb'] },
      {},
      null,
    ];

    for (const value of values) {
      if (isCanonicalApparatus(value)) {
        expect(toCanonicalApparatus(value, ALL_TYPES)).toEqual(value);
      }
    }
  });
});

describe('the encoding changes, the meaning does not', () => {
  const competition = {
    playerFee: 500,
    apparatusFees: { 'Pole Mallakhamb': 100, 'Rope Mallakhamb': 150 },
    competitionTypes: ALL_TYPES,
  };

  const feeFor = (apparatus) => calculatePlayerFee({ apparatus }, competition);

  it('charges an athlete exactly the same before and after normalisation', () => {
    // The critical property: `calculatePlayerFee` reads with no competition
    // type and de-duplicates through a Set, so spreading one list across three
    // types cannot double-charge the add-ons.
    const legacy = ['Pole Mallakhamb', 'Rope Mallakhamb'];
    const canonical = toCanonicalApparatus(legacy, ALL_TYPES);

    expect(feeFor(canonical)).toBe(feeFor(legacy));
    expect(feeFor(canonical)).toBe(500 + 100 + 150);
  });

  it('charges the same for a bare string too', () => {
    expect(feeFor(toCanonicalApparatus('Pole Mallakhamb', ALL_TYPES)))
      .toBe(feeFor('Pole Mallakhamb'));
  });

  it('reads back the same roster for every competition type', () => {
    // Asked about one type, the array form ignored the type and returned the
    // whole list. Spreading reproduces that exactly rather than narrowing it.
    const legacy = ['Pole Mallakhamb', 'Rope Mallakhamb'];
    const canonical = toCanonicalApparatus(legacy, ALL_TYPES);

    for (const type of ALL_TYPES) {
      expect(apparatusList(canonical, type).sort())
        .toEqual(apparatusList(legacy, type).sort());
    }
  });

  it('reads back the same flattened list with no type', () => {
    const legacy = ['Pole Mallakhamb'];
    expect(new Set(apparatusList(toCanonicalApparatus(legacy, ALL_TYPES))))
      .toEqual(new Set(apparatusList(legacy)));
  });
});

describe('the display-keyed object was charged for and invisible at once', () => {
  const displayKeyed = { 'Competition I': ['Rope Mallakhamb'] };

  it('read as nothing per type, while the fee reader saw it', () => {
    // The one case migration 008 deliberately CHANGES rather than re-encodes.
    expect(apparatusList(displayKeyed, 'competition_1')).toEqual([]);
    expect(apparatusList(displayKeyed)).toEqual(['Rope Mallakhamb']);
  });

  it('is visible to both after normalisation, at the same fee', () => {
    const canonical = toCanonicalApparatus(displayKeyed, ALL_TYPES);

    expect(apparatusList(canonical, 'competition_1')).toEqual(['Rope Mallakhamb']);
    expect(apparatusList(canonical)).toEqual(apparatusList(displayKeyed));
    // Only competition_1 — a display key names one category, so it is not
    // spread the way a bare list is.
    expect(Object.keys(canonical)).toEqual(['competition_1']);
  });
});

describe('what the array form could never say', () => {
  it('keeps Competition I and Competition III apart', () => {
    // This is the reason the object wins. As `['Pole','Rope']` this athlete
    // appears on the Rope roster for Competition I, a category they are not
    // entered in.
    const canonical = {
      competition_1: ['Pole Mallakhamb'],
      competition_3: ['Rope Mallakhamb'],
    };

    expect(apparatusList(canonical, 'competition_1')).toEqual(['Pole Mallakhamb']);
    expect(apparatusList(canonical, 'competition_3')).toEqual(['Rope Mallakhamb']);

    const asArray = ['Pole Mallakhamb', 'Rope Mallakhamb'];
    expect(apparatusList(asArray, 'competition_1')).toEqual(asArray);
  });
});
