/**
 * Index reconciliation.
 *
 * The case that matters is the one that broke `migrate:up`: an index that
 * already exists on the right key under a DIFFERENT NAME. Mongoose's autoIndex
 * builds `email_1` from a path's `unique: true`; migration 005 then asked for
 * the same key as `judge_account_email_unique`, MongoDB refused, and the whole
 * migration batch rolled back — so 006 and 007 never ran on any developer
 * machine.
 */

const {
  optionsMatch,
  keySignature,
  reconcileModel,
  formatResults,
} = require('../../../../src/infrastructure/database/index-manager');

/**
 * A stand-in for a Mongoose model: the reconciler only needs the schema's
 * declared indexes and the collection's actual ones.
 *
 * @param {Array} declared - `[key, options]` pairs, as `schema.indexes()` returns
 * @param {Array} existing - as `collection.indexes()` returns
 */
function fakeModel(declared, existing, { createIndex } = {}) {
  const created = [];
  return {
    modelName: 'Fake',
    schema: { indexes: () => declared },
    collection: {
      indexes: async () => existing,
      createIndex: createIndex || (async (key, options) => {
        created.push({ key, options });
        return options.name || 'generated_name';
      }),
    },
    _created: created,
  };
}

describe('optionsMatch', () => {
  it('ignores the name', () => {
    // The whole point: same key, same meaning, different label.
    expect(optionsMatch({ unique: true, name: 'judge_account_email_unique' }, { unique: true, name: 'email_1' }))
      .toBe(true);
  });

  it('treats a missing option as false rather than undefined', () => {
    expect(optionsMatch({}, { name: 'x' })).toBe(true);
    expect(optionsMatch({ unique: false }, {})).toBe(true);
  });

  it('does not match when uniqueness differs', () => {
    expect(optionsMatch({ unique: true }, {})).toBe(false);
    expect(optionsMatch({}, { unique: true })).toBe(false);
  });

  it('compares partial filters structurally', () => {
    const filter = { judgeAccount: { $type: 'objectId' } };
    expect(optionsMatch({ partialFilterExpression: filter }, { partialFilterExpression: { ...filter } }))
      .toBe(true);
    expect(optionsMatch({ partialFilterExpression: filter }, {})).toBe(false);
  });

  it('does not match when sparse differs', () => {
    // MongoDB refuses `sparse` together with `partialFilterExpression` and
    // builds the filter alone, so a schema declaring both never matches what
    // comes back. Judge.js had exactly that and reported a conflict forever.
    expect(optionsMatch({ sparse: true }, {})).toBe(false);
  });
});

describe('keySignature', () => {
  it('distinguishes key order, because a compound index is order-sensitive', () => {
    expect(keySignature({ a: 1, b: 1 })).not.toBe(keySignature({ b: 1, a: 1 }));
  });

  it('distinguishes direction', () => {
    expect(keySignature({ a: 1 })).not.toBe(keySignature({ a: -1 }));
  });
});

describe('reconcileModel', () => {
  it('treats an index that exists under another name as satisfied', async () => {
    const model = fakeModel(
      [[{ email: 1 }, { unique: true, name: 'judge_account_email_unique' }]],
      [{ name: 'email_1', key: { email: 1 }, unique: true }]
    );

    const result = await reconcileModel(model);

    expect(result.satisfied).toHaveLength(1);
    expect(result.satisfied[0].name).toBe('email_1');
    expect(result.created).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    // Nothing was written — this is the call that used to throw.
    expect(model._created).toHaveLength(0);
  });

  it('creates an index that is genuinely missing', async () => {
    const model = fakeModel([[{ team: 1 }, {}]], [{ name: '_id_', key: { _id: 1 } }]);

    const result = await reconcileModel(model);

    expect(result.created).toHaveLength(1);
    expect(model._created).toHaveLength(1);
    expect(model._created[0].key).toEqual({ team: 1 });
  });

  it('reports a same-key different-meaning index as a conflict and does not touch it', async () => {
    const model = fakeModel(
      [[{ email: 1 }, { unique: true }]],
      [{ name: 'email_1', key: { email: 1 } }] // built WITHOUT unique
    );

    const result = await reconcileModel(model);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].declared).toEqual({ unique: true });
    expect(result.created).toHaveLength(0);
    // Dropping a unique index to rebuild it can succeed and then fail on the
    // rebuild, leaving no constraint at all. So it is reported, never fixed.
    expect(model._created).toHaveLength(0);
  });

  it('reports an undeclared index without dropping it', async () => {
    const model = fakeModel(
      [],
      [
        { name: '_id_', key: { _id: 1 } },
        { name: 'isActive_1', key: { isActive: 1 } },
      ]
    );

    const result = await reconcileModel(model);

    // Migrations 001 and 002 created indexes no schema declares. Mongoose's own
    // syncIndexes() would delete exactly these.
    expect(result.undeclared).toEqual([{ key: { isActive: 1 }, name: 'isActive_1' }]);
  });

  it('never reports the _id index as undeclared', async () => {
    const model = fakeModel([], [{ name: '_id_', key: { _id: 1 } }]);
    expect((await reconcileModel(model)).undeclared).toHaveLength(0);
  });

  it('writes nothing when apply is false', async () => {
    const model = fakeModel([[{ team: 1 }, {}]], []);

    const result = await reconcileModel(model, { apply: false });

    expect(result.created[0].pending).toBe(true);
    expect(model._created).toHaveLength(0);
  });

  it('treats a collection that does not exist yet as having no indexes', async () => {
    const missing = Object.assign(new Error('ns does not exist'), { codeName: 'NamespaceNotFound' });
    const model = {
      modelName: 'Fake',
      schema: { indexes: () => [[{ email: 1 }, {}]] },
      collection: {
        indexes: async () => { throw missing; },
        createIndex: async () => 'email_1',
      },
    };

    const result = await reconcileModel(model);

    // A fresh database has no collections until something is written; creating
    // the index creates the collection.
    expect(result.created).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });

  it('records a creation failure instead of throwing', async () => {
    const model = fakeModel([[{ email: 1 }, {}]], [], {
      createIndex: async () => { throw new Error('duplicate key'); },
    });

    const result = await reconcileModel(model);

    // One model's bad index must not abort the reconciliation of the rest.
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toBe('duplicate key');
  });
});

describe('formatResults', () => {
  it('summarises counts on the first line', () => {
    const lines = formatResults([{
      model: 'Fake',
      created: [{ key: { a: 1 } }],
      satisfied: [{ key: { b: 1 } }],
      conflicts: [],
      undeclared: [],
      failed: [],
    }], true);

    expect(lines[0]).toContain('1 already correct');
    expect(lines[0]).toContain('1 created');
  });

  it('omits models with nothing to report', () => {
    const lines = formatResults([{
      model: 'Quiet', created: [], satisfied: [{ key: { a: 1 } }],
      conflicts: [], undeclared: [], failed: [],
    }], true);

    expect(lines.join('\n')).not.toContain('Quiet');
  });
});
