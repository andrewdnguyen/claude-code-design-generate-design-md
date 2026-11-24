#!/usr/bin/env node
// Validate a buffered pending.yaml before /apply-edits or /apply-tweaks touches any HTML.
//
// Usage:
//   node scripts/validate-pending.mjs edits  artifacts/edits/<session>/pending.yaml  [--html artifacts/<name>.html] [--allow-null]
//   node scripts/validate-pending.mjs tweaks artifacts/tweaks/<session>/pending.yaml --html artifacts/<name>.html
//
// Exit 0: prints {"kind","count","entries":[...]} as JSON on stdout.
// Exit 1: prints one line per problem on stderr (all-or-nothing; nothing is applied).
// Exit 2: usage / I/O error.
//
// Only the tiny YAML subset written by starters/editor_overlay.js and the Tweaks panel is
// accepted. Anything else is rejected, never guessed at. Node standard library only.

import fs from 'node:fs';
import path from 'node:path';

const EXIT_INVALID = 1;
const EXIT_USAGE = 2;

// ---------- allowlists (must match starters/editor_overlay.js and the apply-edits skill)
const HEX = /^#[0-9a-fA-F]{6}$/;
const LEN = /^(0|-?\d+(\.\d+)?(px|rem|em|%))$/;
const STYLE_PROPS = {
  'color': HEX,
  'background-color': HEX,
  'border-color': HEX,
  'font-size': LEN,
  'line-height': LEN,
  'letter-spacing': LEN,
  'padding': LEN,
  'margin': LEN,
  'gap': LEN,
  'border-radius': LEN,
  'width': LEN,
  'max-width': LEN,
  'font-weight': /^(100|200|300|400|500|600|700|800|900)$/,
  'opacity': /^(0(\.\d+)?|1(\.0+)?)$/,
  'text-align': /^(left|center|right|justify)$/,
};
for (const side of ['top', 'right', 'bottom', 'left']) {
  STYLE_PROPS[`padding-${side}`] = LEN;
  STYLE_PROPS[`margin-${side}`] = LEN;
}
const TEXT_MAX = 500;
const TWEAK_STRING_MAX_DEFAULT = 200;
const TARGET_RE = /^e\d{3}$/;
const NAME_RE = /^[A-Za-z0-9_-]+$/;
const KINDS = ['text', 'style', 'hidden'];

// ---------- small helpers
function die(code, lines) {
  for (const l of Array.isArray(lines) ? lines : [lines]) console.error(l);
  process.exit(code);
}

// Reject absolute paths and `..`; require the path to sit under `root/`, including after symlinks.
function checkPathUnder(p, root, label) {
  if (typeof p !== 'string' || p === '' || p.includes('\0')) die(EXIT_USAGE, `${label}: empty or invalid path`);
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p)) die(EXIT_USAGE, `${label}: absolute paths are not allowed`);
  if (p.split(/[\\/]+/).includes('..')) die(EXIT_USAGE, `${label}: '..' is not allowed`);
  const rootAbs = path.resolve(process.cwd(), root);
  const abs = path.resolve(process.cwd(), p);
  if (!abs.startsWith(rootAbs + path.sep)) die(EXIT_USAGE, `${label}: must be under ${root}/`);
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    die(EXIT_USAGE, `${label}: file not found: ${p}`);
  }
  let rootReal;
  try {
    rootReal = fs.realpathSync(rootAbs);
  } catch {
    die(EXIT_USAGE, `${label}: ${root}/ does not exist`);
  }
  if (!real.startsWith(rootReal + path.sep)) die(EXIT_USAGE, `${label}: resolves outside ${root}/`);
  return real;
}

// A scalar is either a double-quoted JSON string, or a bare token (true/false/null/identifier/number).
function parseScalar(raw) {
  const s = raw.trim();
  if (s.startsWith('"')) {
    let v;
    try {
      v = JSON.parse(s);
    } catch {
      throw new Error('malformed double-quoted string');
    }
    if (typeof v !== 'string') throw new Error('malformed double-quoted string');
    return { quoted: true, value: v };
  }
  if (/^[A-Za-z0-9_.+-]+$/.test(s)) return { quoted: false, value: s };
  throw new Error(`unexpected value syntax: ${JSON.stringify(s.slice(0, 40))}`);
}

function contentLines(text) {
  // Returns [{n, line}] skipping blank and '#' comment lines. Line numbers are 1-based.
  const out = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (line.trim() === '' || line.trimStart().startsWith('#')) return;
    out.push({ n: i + 1, line });
  });
  return out;
}

// ---------- edits parser:  "- key: v" first line, then "  key: v" continuation lines
function parseEditsYaml(text) {
  const entries = [];
  const errors = [];
  let cur = null;
  for (const { n, line } of contentLines(text)) {
    let m = /^- ([a-z]+): (.*)$/.exec(line);
    if (m) {
      cur = { _line: n, fields: {} };
      entries.push(cur);
    } else {
      m = /^ {2}([a-z]+): (.*)$/.exec(line);
      if (!m || !cur) {
        errors.push(`line ${n}: unexpected syntax`);
        continue;
      }
    }
    const [, key, rawVal] = m;
    if (!['target', 'kind', 'prop', 'value'].includes(key)) {
      errors.push(`line ${n}: unknown field '${key}'`);
      continue;
    }
    if (Object.hasOwn(cur.fields, key)) {
      errors.push(`line ${n}: duplicate field '${key}'`);
      continue;
    }
    try {
      cur.fields[key] = parseScalar(rawVal);
    } catch (e) {
      errors.push(`line ${n}: ${e.message}`);
    }
  }
  return { entries, errors };
}

// ---------- tweaks parser:  key: <json value>
function parseTweaksYaml(text) {
  const entries = [];
  const errors = [];
  const seen = new Set();
  for (const { n, line } of contentLines(text)) {
    if (line.trim() === '{}') continue;
    const m = /^([A-Za-z0-9_-]+): (.*)$/.exec(line);
    if (!m) {
      errors.push(`line ${n}: unexpected syntax`);
      continue;
    }
    const [, key, rawVal] = m;
    if (seen.has(key)) {
      errors.push(`line ${n}: duplicate key '${key}'`);
      continue;
    }
    seen.add(key);
    let value;
    try {
      value = JSON.parse(rawVal.trim());
    } catch {
      errors.push(`line ${n}: ${key}: value is not valid JSON`);
      continue;
    }
    if (!['string', 'number', 'boolean'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) {
      errors.push(`line ${n}: ${key}: value must be a string, finite number, or boolean`);
      continue;
    }
    entries.push({ _line: n, key, value });
  }
  return { entries, errors };
}

// ---------- edits validation
function plainText(v, max, what) {
  if (v.length > max) return `${what} longer than ${max} chars`;
  if (/[<>\n\r]/.test(v)) return `${what} must not contain '<', '>' or a newline`;
  return null;
}

function validateEdits(parsed, html, allowNull) {
  const errors = [...parsed.errors];
  const out = [];
  if (html !== null) {
    if (!html.includes('id="__edits"') || !html.includes('edits-generation')) {
      errors.push('html: missing id="__edits" or edits-generation (run /make-editable first)');
    }
  }
  for (const [i, e] of parsed.entries.entries()) {
    const f = e.fields;
    const tag = `entry ${i + 1} (line ${e._line})`;
    const problems = [];
    for (const k of ['target', 'kind', 'value']) if (!f[k]) problems.push(`missing '${k}'`);
    if (problems.length) {
      errors.push(`${tag}: ${problems.join(', ')}`);
      continue;
    }
    const target = f.target.value;
    const kind = f.kind.value;
    if (f.target.quoted || !TARGET_RE.test(target)) problems.push('target must match e + 3 digits');
    if (f.kind.quoted || !KINDS.includes(kind)) problems.push('kind must be text, style or hidden');
    if (problems.length) {
      errors.push(`${tag}: ${problems.join('; ')}`);
      continue;
    }
    const entry = { target, kind };

    if (kind === 'style') {
      const prop = f.prop && !f.prop.quoted ? f.prop.value : null;
      if (!prop || !Object.hasOwn(STYLE_PROPS, prop)) {
        problems.push(`prop '${f.prop ? f.prop.value : ''}' is not in the allowlist`);
      } else {
        entry.prop = prop;
        if (allowNull && !f.value.quoted && f.value.value === 'null') {
          entry.value = null;
        } else if (!f.value.quoted || !STYLE_PROPS[prop].test(f.value.value)) {
          problems.push(`value does not match the allowlist pattern for ${prop}`);
        } else {
          entry.value = f.value.value;
        }
      }
    } else {
      if (f.prop) problems.push(`'prop' is only valid for kind style`);
      if (kind === 'text') {
        if (!f.value.quoted) problems.push('value must be a double-quoted string');
        else {
          const bad = plainText(f.value.value, TEXT_MAX, 'value');
          if (bad) problems.push(bad);
          entry.value = f.value.value;
        }
      } else if (f.value.quoted || !['true', 'false'].includes(f.value.value)) {
        problems.push('value must be true or false');
      } else {
        entry.value = f.value.value === 'true';
      }
    }

    if (html !== null && problems.length === 0) {
      const re = new RegExp(`<[a-zA-Z][a-zA-Z0-9-]*(?:\\s[^<>]*)?\\sdata-edit="${target}"`, 'g');
      const matches = [...html.matchAll(re)];
      if (matches.length !== 1) {
        problems.push(`data-edit="${target}" must appear on exactly one element (found ${matches.length})`);
      } else if (kind === 'text') {
        const problem = leafCheck(html, matches[0]);
        if (problem) problems.push(problem);
      }
    }
    if (problems.length) errors.push(`${tag}: ${problems.join('; ')}`);
    else out.push(entry);
  }
  return { errors, out };
}

// The element must be a leaf: no '<' between its opening tag's end and its closing tag.
function leafCheck(html, match) {
  const tagName = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(match[0])[1];
  const openEnd = html.indexOf('>', match.index + match[0].length);
  if (openEnd === -1) return 'unterminated opening tag';
  const close = html.indexOf(`</${tagName}`, openEnd);
  if (close === -1) return `no closing </${tagName}> found (void element?)`;
  if (html.slice(openEnd + 1, close).includes('<')) return 'element is not a text leaf (contains markup)';
  return null;
}

// ---------- tweaks validation
function readSchema(html) {
  const m = /<script\b[^>]*\bid="__tweak_schema"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('no <script id="__tweak_schema"> block in the HTML');
  const schema = JSON.parse(m[1]);
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('schema must be an object');
  return schema;
}

function validateTweaks(parsed, schema) {
  const errors = [...parsed.errors];
  const out = [];
  for (const e of parsed.entries) {
    const tag = `${e.key} (line ${e._line})`;
    if (!NAME_RE.test(e.key)) {
      errors.push(`${tag}: key must match [A-Za-z0-9_-]+`);
      continue;
    }
    if (!Object.hasOwn(schema, e.key)) {
      errors.push(`${tag}: key is not in __tweak_schema`);
      continue;
    }
    const meta = schema[e.key] || {};
    const v = e.value;
    let problem = null;
    switch (meta.type) {
      case 'color':
        if (typeof v !== 'string' || !HEX.test(v)) problem = 'color must be #rrggbb';
        break;
      case 'number':
        if (typeof v !== 'number') problem = 'must be a number';
        else if (typeof meta.min === 'number' && v < meta.min) problem = `below min ${meta.min}`;
        else if (typeof meta.max === 'number' && v > meta.max) problem = `above max ${meta.max}`;
        break;
      case 'boolean':
        if (typeof v !== 'boolean') problem = 'must be true or false';
        break;
      case 'enum':
        if (!Array.isArray(meta.options) || !meta.options.includes(v)) problem = 'not one of the schema options';
        break;
      case 'string': {
        const max = typeof meta.maxLength === 'number' ? meta.maxLength : TWEAK_STRING_MAX_DEFAULT;
        if (typeof v !== 'string') problem = 'must be a string';
        else problem = plainText(v, max, 'value');
        break;
      }
      default:
        problem = `unknown schema type '${String(meta.type)}'`;
    }
    if (problem) errors.push(`${tag}: ${problem}`);
    else out.push({ key: e.key, type: meta.type, value: v });
  }
  return { errors, out };
}

// ---------- main
function main() {
  const args = process.argv.slice(2);
  const flags = { allowNull: false, html: null };
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allow-null') flags.allowNull = true;
    else if (args[i] === '--html') flags.html = args[++i];
    else if (args[i].startsWith('--')) die(EXIT_USAGE, `unknown flag ${args[i]}`);
    else pos.push(args[i]);
  }
  const [kind, file] = pos;
  if (!['edits', 'tweaks'].includes(kind) || !file || pos.length !== 2) {
    die(EXIT_USAGE, 'Usage: node scripts/validate-pending.mjs <edits|tweaks> <path/to/pending.yaml> [--html <artifact.html>] [--allow-null]');
  }
  if (flags.allowNull && kind !== 'edits') die(EXIT_USAGE, '--allow-null is only valid for edits');
  if (kind === 'tweaks' && !flags.html) die(EXIT_USAGE, 'tweaks requires --html <artifact.html> (the schema lives there)');

  const pendingReal = checkPathUnder(file, kind === 'edits' ? 'artifacts/edits' : 'artifacts/tweaks', 'pending path');
  if (path.basename(pendingReal) !== 'pending.yaml') die(EXIT_USAGE, 'pending path: file must be named pending.yaml');

  let html = null;
  if (flags.html) {
    if (!flags.html.endsWith('.html')) die(EXIT_USAGE, '--html: must be a .html file');
    html = fs.readFileSync(checkPathUnder(flags.html, 'artifacts', '--html'), 'utf8');
  }

  const text = fs.readFileSync(pendingReal, 'utf8');
  let result;
  if (kind === 'edits') {
    result = validateEdits(parseEditsYaml(text), html, flags.allowNull);
  } else {
    let schema;
    try {
      schema = readSchema(html);
    } catch (e) {
      die(EXIT_INVALID, `schema: ${e.message}`);
    }
    result = validateTweaks(parseTweaksYaml(text), schema);
  }

  if (result.errors.length) die(EXIT_INVALID, result.errors);
  console.log(JSON.stringify({ kind, count: result.out.length, entries: result.out }, null, 2));
}

main();
