'use strict';

/**
 * Reading and storing a recorded corpus.
 *
 * Requests are recorded as plain JSON Lines and stored gzipped: every response
 * repeats the same long headers, so a corpus shrinks to a few percent.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { CORPUS_ROOT, corpusDir } = require('./local');

const PLAIN = 'requests.jsonl';
const PACKED = 'requests.jsonl.gz';

/** The corpora that have recorded requests, sorted by name. */
function listCorpora() {
  if (!fs.existsSync(CORPUS_ROOT)) return [];
  return fs.readdirSync(CORPUS_ROOT).filter((name) => fs.existsSync(path.join(CORPUS_ROOT, name, PACKED))).sort();
}

/** Every recorded entry of a corpus, in order. */
function readRequests(name) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(corpusDir(name), PACKED))).toString('utf8');
  return text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

/** Gzip the plain recording in place; returns the number of entries. */
function packRequests(name) {
  const plain = path.join(corpusDir(name), PLAIN);
  if (!fs.existsSync(plain)) return 0;
  const text = fs.readFileSync(plain);
  const entries = text.toString('utf8').split('\n').filter(Boolean).length;
  if (entries > 0) fs.writeFileSync(path.join(corpusDir(name), PACKED), zlib.gzipSync(text, { level: 9 }));
  fs.rmSync(plain);
  return entries;
}

module.exports = { listCorpora, readRequests, packRequests };
