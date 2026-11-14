#!/usr/bin/env node
'use strict';

/**
 * Generator 2: gen-catalogues (07 §1), report mode.
 *
 * Walks every file in `Server/src` with a Babel AST and collects the literals
 * the catalogues will replace (08 §7): error codes and their HTTP statuses,
 * status numbers, user-facing messages, socket events, cookie and header
 * names, and `process.env` reads outside the config manager. Writes:
 *
 *   generated/catalogues.json      everything found, each with its Node file:line
 *   generated/CATALOGUE-REPORT.md  totals, and where Node's own catalogues
 *                                  (`error-codes.js`, `event-types.js`) are
 *                                  incomplete
 *
 * Report mode writes no Java. Output is deterministic.
 */

const fs = require('node:fs');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const { listSourceFiles, repoRelative, requireServer, writeGenerated } = require('../lib/server');

const CODE_SHAPE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$|^[A-Z]{4,}$/;
const CODE_KEYS = new Set(['code', 'errorCode']);
const STATUS_KEYS = new Set(['statusCode', 'status']);
const MESSAGE_KEYS = new Set(['message', 'error']);
/** Socket emit helpers, with the argument index that carries the event name. */
const EMITTERS = { emit: 0, broadcast: 0, emitToRoom: 1, emitToRooms: 1, emitToUser: 1 };
const CONFIG_MANAGER = 'Server/src/config/config-manager.js';

const ERROR_CODES = requireServer('errors/error-codes');
const EVENT_TYPES = requireServer('socket/events/event-types');

/** key → { sites: [file:line], ...extra }. Insertion order is the walk order (files sorted), so output is stable. */
class Tally {
  constructor() {
    this.entries = new Map();
  }
  add(key, site, extra) {
    const entry = this.entries.get(key) || { sites: [] };
    entry.sites.push(site);
    if (extra) extra(entry);
    this.entries.set(key, entry);
  }
  sorted() {
    return [...this.entries.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }
}

const found = {
  codes: new Tally(),
  statuses: new Tally(),
  messages: new Tally(),
  notFoundResources: new Tally(),
  eventsOut: new Tally(),
  eventsIn: new Tally(),
  cookies: new Tally(),
  headers: new Tally(),
  env: new Tally(),
  errorClasses: new Tally(),
};
const parseFailures = [];

const propertyName = (node) => {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'StringLiteral') return node.value;
  return null;
};

/** A string or template literal as message text; `${…}` becomes `{0}`, `{1}`… with the expressions recorded. */
function messageText(node, source) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return { text: node.value, args: [] };
  if (node.type === 'TemplateLiteral') {
    let text = '';
    node.quasis.forEach((quasi, i) => {
      text += quasi.value.cooked;
      if (i < node.expressions.length) text += `{${i}}`;
    });
    return { text, args: node.expressions.map((expr) => source.slice(expr.start, expr.end)) };
  }
  return null;
}

/** The status number in `res.status(N)…` when `path` sits inside that call chain's arguments. */
function enclosingStatus(path) {
  let current = path.parentPath;
  while (current && !current.isFunction()) {
    if (current.isCallExpression()) {
      let callee = current.node.callee;
      while (callee && callee.type === 'MemberExpression') {
        const object = callee.object;
        if (
          object.type === 'CallExpression' &&
          object.callee.type === 'MemberExpression' &&
          propertyName(object.callee.property) === 'status' &&
          object.arguments[0] &&
          object.arguments[0].type === 'NumericLiteral'
        ) {
          return object.arguments[0].value;
        }
        callee = object.type === 'CallExpression' ? object.callee : object;
      }
    }
    current = current.parentPath;
  }
  return null;
}

/** A sibling `statusCode: N` / `status: N` in the same object literal. */
function siblingStatus(objectNode) {
  for (const prop of objectNode.properties) {
    if (prop.type === 'ObjectProperty' && STATUS_KEYS.has(propertyName(prop.key)) && prop.value.type === 'NumericLiteral') {
      return prop.value.value;
    }
  }
  return null;
}

function addCode(code, site, status) {
  found.codes.add(code, site, (entry) => {
    entry.statuses = entry.statuses || [];
    if (status !== null && status !== undefined && !entry.statuses.includes(status)) entry.statuses.push(status);
  });
}

/** `EventTypes.X` / `EVENTS.X` resolved through the Node module, or a string literal. */
function eventName(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return { name: node.value, viaConstant: false };
  if (node.type === 'MemberExpression' && !node.computed) {
    const key = propertyName(node.property);
    if (Object.prototype.hasOwnProperty.call(EVENT_TYPES, key)) return { name: EVENT_TYPES[key], viaConstant: true };
  }
  return null;
}

function visitFile(file) {
  const rel = repoRelative(file);
  const source = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parser.parse(source, { sourceType: 'unambiguous', errorRecovery: true });
  } catch (error) {
    parseFailures.push(`${rel}: ${error.message}`);
    return;
  }
  const at = (node) => `${rel}:${node.loc.start.line}`;

  // Module-level `const NAME = 'literal'`, so a name passed through a constant is still seen.
  const constants = new Map();
  for (const statement of ast.program.body) {
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue;
    for (const declarator of statement.declarations) {
      if (declarator.id.type === 'Identifier' && declarator.init && declarator.init.type === 'StringLiteral') {
        constants.set(declarator.id.name, declarator.init.value);
      }
    }
  }
  /** The string a node stands for: a literal, or a module-level string constant. */
  const stringOf = (node) => {
    if (!node) return null;
    if (node.type === 'StringLiteral') return node.value;
    if (node.type === 'Identifier' && constants.has(node.name)) return constants.get(node.name);
    return null;
  };
  const isCatalogueFile = rel.endsWith('errors/error-codes.js') || rel.endsWith('socket/events/event-types.js');

  traverse(ast, {
    ObjectProperty(path) {
      if (isCatalogueFile) return;
      const key = propertyName(path.node.key);
      const value = path.node.value;
      if (CODE_KEYS.has(key) && value.type === 'StringLiteral' && CODE_SHAPE.test(value.value)) {
        addCode(value.value, at(value), siblingStatus(path.parent) ?? enclosingStatus(path));
      }
      if (STATUS_KEYS.has(key) && value.type === 'NumericLiteral' && value.value >= 100 && value.value <= 599) {
        found.statuses.add(String(value.value), at(value));
      }
      if (MESSAGE_KEYS.has(key)) {
        const message = messageText(value, source);
        // Only messages that go out in a response: inside `res.status(N).json({…})` or `res.json({…})`.
        if (message && message.text.length > 0 && path.findParent((p) => p.isCallExpression() && propertyName(p.node.callee.property) === 'json')) {
          found.messages.add(message.text, at(value), (entry) => {
            entry.args = message.args;
            entry.via = 'response';
          });
        }
      }
    },

    AssignmentExpression(path) {
      const { left, right } = path.node;
      const target = left.type === 'MemberExpression' ? propertyName(left.property) : left.type === 'Identifier' ? left.name : null;
      if (CODE_KEYS.has(target) && right.type === 'StringLiteral' && CODE_SHAPE.test(right.value)) {
        addCode(right.value, at(right), null);
      }
    },

    MemberExpression(path) {
      const { object, property, computed } = path.node;
      // ERROR_CODES.X
      if (!computed && object.type === 'Identifier' && object.name === 'ERROR_CODES' && !isCatalogueFile) {
        const key = propertyName(property);
        if (ERROR_CODES[key]) addCode(ERROR_CODES[key], at(path.node), null);
      }
      // process.env.X
      if (
        object.type === 'MemberExpression' &&
        propertyName(object.object) === 'process' &&
        propertyName(object.property) === 'env' &&
        rel !== CONFIG_MANAGER
      ) {
        const name = computed && property.type !== 'StringLiteral' ? null : propertyName(property);
        if (name) found.env.add(name, at(path.node));
      }
      // req.cookies.X / req.cookies['X'], req.headers['x-…']
      if (object.type === 'MemberExpression') {
        const bag = propertyName(object.property);
        const name = computed ? stringOf(property) : propertyName(property);
        if (name && bag === 'cookies') found.cookies.add(name, at(path.node));
        if (name && bag === 'headers') found.headers.add(name.toLowerCase(), at(path.node));
      }
    },

    CallExpression(path) {
      const { callee, arguments: args } = path.node;
      if (callee.type !== 'MemberExpression') return;
      const method = propertyName(callee.property);
      const first = args[0];

      if (method === 'status' && first && first.type === 'NumericLiteral') {
        found.statuses.add(String(first.value), at(first));
      }
      if ((method === 'cookie' || method === 'clearCookie') && stringOf(first)) {
        found.cookies.add(stringOf(first), at(first));
      }
      if (['setHeader', 'set', 'header', 'get', 'getHeader', 'removeHeader'].includes(method) && stringOf(first)) {
        // `.get('x')` and `.set('x')` are used by many things; keep only names that look like HTTP headers on req/res.
        const owner = propertyName(callee.object);
        if (['req', 'res', 'request', 'response'].includes(owner) && /^[A-Za-z][A-Za-z0-9-]*$/.test(stringOf(first))) {
          found.headers.add(stringOf(first).toLowerCase(), at(first));
        }
      }
      if (Object.prototype.hasOwnProperty.call(EMITTERS, method)) {
        const event = eventName(args[EMITTERS[method]]);
        if (event) {
          found.eventsOut.add(event.name, at(path.node), (entry) => {
            entry.literalSites = entry.literalSites || [];
            if (!event.viaConstant) entry.literalSites.push(at(path.node));
          });
        }
      }
      if (method === 'on' && propertyName(callee.object) === 'socket') {
        const event = eventName(first);
        if (event) found.eventsIn.add(event.name, at(path.node));
      }
    },

    NewExpression(path) {
      const name = propertyName(path.node.callee);
      if (!name || !/Error$/.test(name) || name === 'Error' || name === 'TypeError' || name === 'RangeError') return;
      found.errorClasses.add(name, at(path.node));
      const first = path.node.arguments[0];
      const message = messageText(first, source);
      if (!message) return;
      if (name === 'NotFoundError') {
        found.notFoundResources.add(message.text, at(first));
        return;
      }
      found.messages.add(message.text, at(first), (entry) => {
        entry.args = message.args;
        entry.via = entry.via || name;
      });
    },
  });
}

/** Cookie names built at runtime by `cookie.util.js` (one access and one refresh cookie per role). */
function runtimeCookieNames() {
  const cookies = requireServer('utils/security/cookie.util');
  const perRole = {};
  for (const role of cookies.ROLES) {
    perRole[role] = { access: cookies.accessCookieName(role), refresh: cookies.refreshCookieName(role) };
  }
  return { base: cookies.COOKIE_NAMES, perRole };
}

/** The status and code each error class sends: `super(message, 404, ERROR_CODES.NOT_FOUND)`. */
function errorClassTable() {
  const table = {};
  const errors = requireServer('errors');
  for (const [name, ErrorClass] of Object.entries(errors)) {
    if (typeof ErrorClass !== 'function' || !/Error$/.test(name) || name === 'BaseError') continue;
    try {
      const instance = new ErrorClass('probe');
      table[name] = { statusCode: instance.statusCode, code: instance.code };
    } catch {
      table[name] = { statusCode: null, code: null };
    }
  }
  return table;
}

const code = (value) => `\`${value}\``;

function render(data) {
  const declared = Object.values(ERROR_CODES);
  const used = data.codes.map(([name]) => name);
  const undeclared = data.codes.filter(([name]) => !declared.includes(name));
  const unusedDeclared = declared.filter((name) => !used.includes(name));
  const declaredEvents = [...new Set(Object.values(EVENT_TYPES))];
  const literalEvents = data.eventsOut.filter(([, entry]) => entry.literalSites.length > 0);
  const undeclaredEvents = [...data.eventsOut, ...data.eventsIn].filter(([name]) => !declaredEvents.includes(name));
  const multiStatus = data.codes.filter(([, entry]) => entry.statuses.length > 1);
  const total = (tally) => tally.reduce((n, [, entry]) => n + entry.sites.length, 0);

  const lines = [
    '# Catalogue report',
    '',
    '<!-- GENERATED by tools/node/gen/gen-catalogues.js. Do not edit. -->',
    '',
    'What the catalogues (08 §7) will replace, found by AST in `Server/src`.',
    'Full lists with every `file:line` are in `catalogues.json`.',
    '',
    '## Totals',
    '',
    '| Kind | Distinct | Sites | Becomes |',
    '|---|---|---|---|',
    `| Error codes | ${data.codes.length} | ${total(data.codes)} | \`ErrorCode\` |`,
    `| HTTP status literals | ${data.statuses.length} | ${total(data.statuses)} | the status on \`ErrorCode\` |`,
    `| Messages (thrown or in a response) | ${data.messages.length} | ${total(data.messages)} | \`MessageKey\` + \`messages.properties\` |`,
    `| \`NotFoundError\` resource names | ${data.notFoundResources.length} | ${total(data.notFoundResources)} | \`MessageKey\` arguments |`,
    `| Socket events sent | ${data.eventsOut.length} | ${total(data.eventsOut)} | \`RealtimeEvent\` + \`RealtimeMessage\` records |`,
    `| Socket events received | ${data.eventsIn.length} | ${total(data.eventsIn)} | \`RealtimeEvent\` |`,
    `| Cookie names | ${data.cookies.length} | ${total(data.cookies)} | \`CookieNames\` |`,
    `| Header names | ${data.headers.length} | ${total(data.headers)} | \`HeaderNames\` |`,
    `| \`process.env\` reads outside the config manager | ${data.env.length} | ${total(data.env)} | \`AppProperties\` fields |`,
    '',
    '## Error codes',
    '',
    `\`error-codes.js\` declares **${declared.length}** codes (the plan counted 23). The code base answers with **${data.codes.length}** distinct codes.`,
    '',
    `### Used but not declared (${undeclared.length})`,
    '',
    'Each needs a row in `ErrorCode` with the status below.',
    '',
    '| Code | Status seen | Sites | First site |',
    '|---|---|---|---|',
    ...undeclared.map(([name, entry]) => `| ${code(name)} | ${entry.statuses.join(', ') || '_not next to the code_'} | ${entry.sites.length} | ${entry.sites[0]} |`),
    '',
    `### Declared but never used (${unusedDeclared.length})`,
    '',
    unusedDeclared.length > 0 ? unusedDeclared.map(code).join(', ') : 'None.',
    '',
    'Proposed: keep them in `ErrorCode` only if a recording shows one on the wire; otherwise drop them.',
    '',
    `### One code, more than one status (${multiStatus.length})`,
    '',
    multiStatus.length > 0 ? '| Code | Statuses | Sites |\n|---|---|---|' : 'None.',
    ...multiStatus.map(([name, entry]) => `| ${code(name)} | ${entry.statuses.join(', ')} | ${entry.sites.join('<br>')} |`),
    '',
    multiStatus.length > 0
      ? '`ErrorCode` carries one status per code (08 §7), so each of these needs a decision: split the code name in Java, or keep one code and let the call site choose the status.'
      : 'So `ErrorCode` can carry one status per code, as 08 §7 assumes.',
    '',
    '### Error classes',
    '',
    '| Class | Status | Code | `new` sites |',
    '|---|---|---|---|',
    ...Object.entries(data.errorClassTable).map(([name, row]) => {
      const usage = data.errorClasses.find(([n]) => n === name);
      return `| ${code(name)} | ${row.statusCode} | ${code(row.code)} | ${usage ? usage[1].sites.length : 0} |`;
    }),
    '',
    '## HTTP status literals',
    '',
    '| Status | Sites |',
    '|---|---|',
    ...data.statuses.map(([status, entry]) => `| ${status} | ${entry.sites.length} |`),
    '',
    '## Socket events',
    '',
    `\`event-types.js\` declares **${declaredEvents.length}** distinct event names.`,
    '',
    `### Sent or received but not declared (${undeclaredEvents.length})`,
    '',
    undeclaredEvents.length > 0 ? '| Event | Sites |\n|---|---|' : 'None.',
    ...undeclaredEvents.map(([name, entry]) => `| ${code(name)} | ${entry.sites.join('<br>')} |`),
    '',
    `### Sent as a string literal instead of the constant (${literalEvents.length})`,
    '',
    literalEvents.length > 0 ? '| Event | Literal sites |\n|---|---|' : 'None.',
    ...literalEvents.map(([name, entry]) => `| ${code(name)} | ${entry.literalSites.join('<br>')} |`),
    '',
    'Events whose name is computed at the call site (a variable or a function argument) are not in this list; the Stage-1 socket recordings are the complete list of what goes on the wire.',
    '',
    '## Cookies and headers',
    '',
    `Cookies set or read by name: ${data.cookies.map(([name]) => code(name)).join(', ') || 'none found'}`,
    '',
    'Auth cookies, built per role by `cookie.util.js`:',
    '',
    '| Role | Access cookie | Refresh cookie |',
    '|---|---|---|',
    ...Object.entries(data.runtimeCookies.perRole).map(([role, names]) => `| ${role} | ${code(names.access)} | ${code(names.refresh)} |`),
    '',
    `Headers: ${data.headers.map(([name]) => code(name)).join(', ') || 'none found'}`,
    '',
    'Names passed through a constant are resolved in Stage 1 from the recorded responses (`backend/contract/`).',
    '',
    '## `process.env` reads outside the config manager',
    '',
    '| Variable | Sites |',
    '|---|---|',
    ...data.env.map(([name, entry]) => `| ${code(name)} | ${entry.sites.join('<br>')} |`),
  ];
  if (parseFailures.length > 0) lines.push('', '## Files that failed to parse', '', ...parseFailures.map((line) => `- ${line}`));
  return lines.join('\n');
}

function main() {
  const files = listSourceFiles();
  files.forEach(visitFile);

  const data = Object.fromEntries(Object.entries(found).map(([key, tally]) => [key, tally.sorted()]));
  data.errorClassTable = errorClassTable();
  data.runtimeCookies = runtimeCookieNames();

  const json = {
    generatedBy: 'tools/node/gen/gen-catalogues.js',
    filesScanned: files.length,
    declaredErrorCodes: Object.values(ERROR_CODES),
    declaredEvents: EVENT_TYPES,
    errorClasses: data.errorClassTable,
    authCookies: data.runtimeCookies,
    ...Object.fromEntries(
      Object.keys(found).map((key) => [key, Object.fromEntries(data[key].map(([name, entry]) => [name, entry]))]),
    ),
  };

  const jsonFile = writeGenerated('catalogues.json', JSON.stringify(json, null, 2));
  const reportFile = writeGenerated('CATALOGUE-REPORT.md', render(data));
  console.log(
    `gen-catalogues: ${files.length} files → ${data.codes.length} codes, ${data.messages.length} messages, ` +
      `${data.eventsOut.length} events sent, ${data.env.length} stray env vars`,
  );
  console.log(`  ${jsonFile}\n  ${reportFile}`);
  if (parseFailures.length > 0) {
    console.error(`gen-catalogues: ${parseFailures.length} file(s) failed to parse`);
    process.exit(1);
  }
}

main();
