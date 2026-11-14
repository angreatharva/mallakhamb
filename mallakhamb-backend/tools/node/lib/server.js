'use strict';

/**
 * Access to the live Node backend (`Server/`) for the generators.
 *
 * The generators read runtime objects (Mongoose schemas, config modules), not
 * source text, so what they report is what Node actually enforces. `Server/`
 * is only required, never changed. No database connection is opened: Mongoose
 * models can be defined and introspected offline.
 */

const path = require('node:path');
const fs = require('node:fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SERVER_ROOT = path.join(REPO_ROOT, 'Server');
const SERVER_SRC = path.join(SERVER_ROOT, 'src');
const BACKEND_ROOT = path.join(REPO_ROOT, 'mallakhamb-backend');
const GENERATED_DIR = path.join(BACKEND_ROOT, 'generated');

/** Require a module from `Server/src` by its path relative to that directory. */
function requireServer(relativePath) {
  return require(path.join(SERVER_SRC, relativePath));
}

/** Every Mongoose model in `Server/src/models`, as `{ name, model, file }`, sorted by name. */
function loadModels() {
  const dir = path.join(SERVER_SRC, 'models');
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.js'))
    .sort()
    .map((file) => {
      const model = require(path.join(dir, file));
      if (!model || !model.schema || !model.modelName) {
        throw new Error(`Server/src/models/${file} does not export a Mongoose model`);
      }
      return { name: model.modelName, model, file: `Server/src/models/${file}` };
    });
}

/** Path of a file relative to the repo root, with forward slashes (stable across OSes). */
function repoRelative(absolutePath) {
  return path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/');
}

/** Every `.js` file under a `Server/src` subdirectory, sorted, as absolute paths. */
function listSourceFiles(dir = SERVER_SRC) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out.sort();
}

/** Write a file under `mallakhamb-backend/generated/`, with LF endings and a trailing newline. */
function writeGenerated(name, content) {
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  const file = path.join(GENERATED_DIR, name);
  const text = content.endsWith('\n') ? content : `${content}\n`;
  fs.writeFileSync(file, text.replace(/\r\n/g, '\n'));
  return repoRelative(file);
}

module.exports = {
  REPO_ROOT,
  SERVER_ROOT,
  SERVER_SRC,
  BACKEND_ROOT,
  GENERATED_DIR,
  requireServer,
  loadModels,
  repoRelative,
  listSourceFiles,
  writeGenerated,
};
