'use strict';

/**
 * Database snapshots for the twin-run: the state every replay starts from.
 *
 * A snapshot is one gzip file of canonical Extended JSON (types survive: an
 * Int32 stays an Int32, a Date a Date), with each collection's indexes, so a
 * restored database refuses the same duplicates the recorded one did.
 */

const fs = require('node:fs');
const zlib = require('node:zlib');
const { mongodb, dbUri, assertLocal } = require('./local');

async function withDatabase(name, work) {
  const { MongoClient } = mongodb();
  const client = new MongoClient(assertLocal(dbUri(name)));
  await client.connect();
  try {
    return await work(client.db(name));
  } finally {
    await client.close();
  }
}

/** Write every collection and its indexes to `file`. Returns document counts per collection. */
async function dump(database, file) {
  const { BSON } = mongodb();
  return withDatabase(database, async (db) => {
    const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('system.'))
      .sort();
    const snapshot = { collections: {} };
    const counts = {};
    for (const name of collections) {
      const collection = db.collection(name);
      const documents = await collection.find({}).sort({ _id: 1 }).toArray();
      const indexes = (await collection.indexes()).filter((index) => index.name !== '_id_');
      snapshot.collections[name] = { indexes, documents };
      counts[name] = documents.length;
    }
    fs.writeFileSync(file, zlib.gzipSync(BSON.EJSON.stringify(snapshot, { relaxed: false })));
    return counts;
  });
}

/** Drop `database` and rebuild it from `file`. */
async function restore(file, database) {
  const { BSON } = mongodb();
  const snapshot = BSON.EJSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'), { relaxed: false });
  return withDatabase(database, async (db) => {
    await db.dropDatabase();
    for (const [name, { indexes, documents }] of Object.entries(snapshot.collections)) {
      const collection = await db.createCollection(name);
      if (documents.length > 0) await collection.insertMany(documents, { ordered: true });
      for (const { key, name: indexName, v, ns, background, ...options } of indexes) {
        await collection.createIndex(key, { name: indexName, ...options });
      }
    }
  });
}

const drop = (database) => withDatabase(database, (db) => db.dropDatabase());

module.exports = { dump, restore, drop, withDatabase };
