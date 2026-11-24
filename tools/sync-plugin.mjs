#!/usr/bin/env node
// Generates the plugin's skills, starters and export scripts from the repo-local copies, so
// `.claude/skills/` is the single source of truth. Run by humans and CI (not by the agent).
//
//   node tools/sync-plugin.mjs           write plugin/ so it matches what would be generated
//   node tools/sync-plugin.mjs --check   exit 1 and print a summary if plugin/ is out of date
//
// Generated (plugin/ <- repo):
//   plugin/skills/<name>/**      <- .claude/skills/<name>/**  (mechanical path transform on .md)
//   plugin/starters/**           <- starters/**               (byte-identical)
//   plugin/scripts/*.mjs         <- scripts/*.mjs             (byte-identical)
//
// Not generated: plugin/hooks/** (legitimate plugin-specific differences), plugin/commands/**,
// plugin/.claude-plugin/**, plugin/.mcp.json, plugin/evals/**, plugin/*.md|json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_SKILLS = path.join(ROOT, '.claude', 'skills');
const DST_SKILLS = path.join(ROOT, 'plugin', 'skills');
const OVERRIDES = path.join(ROOT, 'tools', 'plugin-overrides', 'skills');

// Skills that exist only in the repo-local set; never copied to the plugin.
const REPO_ONLY = new Set(['ship-branch']);
// Skills that exist only in the plugin; never touched or deleted by this tool.
const PLUGIN_ONLY = new Set(['generate-design-md']);
// Skills whose plugin copy is hand-written beyond the path transform. Their SKILL.md is taken
// from tools/plugin-overrides/skills/<name>/SKILL.md (other files still come from the source).
// Keep these in step with the source skill by hand.
const PLUGIN_OVERRIDDEN = new Set(['doctor', 'publish', 'export-pdf', 'export-pptx']);

const ROOT_VAR = '"${CLAUDE_PLUGIN_ROOT}"';

// The only mechanical transform: repo-relative starters/ and scripts/ paths become plugin-root paths.
// Matches a path at a word boundary (start, whitespace, backtick or open paren), so
// `artifacts/...` and `.claude/scripts/...` are left alone.
function transformText(text) {
  return text.replace(/(^|[\s`(])(starters|scripts)\//g, `$1${ROOT_VAR}/$2/`);
}

function walk(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out.sort();
}

// Expected tree: Map<absolute destination path, Buffer>
function buildExpected() {
  const expected = new Map();
  const problems = [];

  for (const name of fs.readdirSync(SRC_SKILLS)) {
    const dir = path.join(SRC_SKILLS, name);
    if (!fs.statSync(dir).isDirectory() || REPO_ONLY.has(name)) continue;
    if (PLUGIN_ONLY.has(name)) {
      problems.push(`skill "${name}" is in both .claude/skills and the plugin-only allowlist`);
      continue;
    }
    for (const rel of walk(dir)) {
      const data = fs.readFileSync(path.join(dir, rel));
      const dest = path.join(DST_SKILLS, name, rel);
      if (rel === 'SKILL.md' && PLUGIN_OVERRIDDEN.has(name)) {
        const ov = path.join(OVERRIDES, name, 'SKILL.md');
        if (!fs.existsSync(ov)) problems.push(`missing override ${path.relative(ROOT, ov)}`);
        else expected.set(dest, fs.readFileSync(ov));
      } else if (rel.endsWith('.md')) {
        expected.set(dest, Buffer.from(transformText(data.toString('utf8')), 'utf8'));
      } else {
        expected.set(dest, data);
      }
    }
  }
  for (const name of PLUGIN_OVERRIDDEN) {
    if (!fs.existsSync(path.join(SRC_SKILLS, name))) problems.push(`override "${name}" has no source skill`);
  }

  const mirror = (srcDir, dstDir, filter) => {
    for (const rel of walk(srcDir)) {
      if (filter && !filter(rel)) continue;
      expected.set(path.join(dstDir, rel), fs.readFileSync(path.join(srcDir, rel)));
    }
  };
  mirror(path.join(ROOT, 'starters'), path.join(ROOT, 'plugin', 'starters'));
  mirror(path.join(ROOT, 'scripts'), path.join(ROOT, 'plugin', 'scripts'), (r) => r.endsWith('.mjs'));

  return { expected, problems };
}

// Files that currently exist in the generated areas of plugin/ (plugin-only skills excluded).
function listActual() {
  const actual = [];
  const add = (dir, filter) => {
    for (const rel of walk(dir)) if (!filter || filter(rel)) actual.push(path.join(dir, rel));
  };
  add(DST_SKILLS, (r) => !PLUGIN_ONLY.has(r.split('/')[0]));
  add(path.join(ROOT, 'plugin', 'starters'));
  add(path.join(ROOT, 'plugin', 'scripts'), (r) => r.endsWith('.mjs'));
  return actual;
}

function firstDiffLine(a, b) {
  const al = a.toString('utf8').split('\n');
  const bl = b.toString('utf8').split('\n');
  const n = Math.max(al.length, bl.length);
  for (let i = 0; i < n; i++) {
    if (al[i] !== bl[i]) {
      return `line ${i + 1}: expected ${JSON.stringify((al[i] ?? '').slice(0, 120))} got ${JSON.stringify((bl[i] ?? '').slice(0, 120))}`;
    }
  }
  return 'content differs';
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const unknown = args.filter((a) => a !== '--check');
  if (unknown.length) {
    console.error(`usage: node tools/sync-plugin.mjs [--check]  (unknown: ${unknown.join(' ')})`);
    process.exit(2);
  }

  const { expected, problems } = buildExpected();
  if (problems.length) {
    for (const p of problems) console.error(`error: ${p}`);
    process.exit(2);
  }

  const missing = [];
  const changed = [];
  const stale = [];
  for (const [dest, data] of expected) {
    if (!fs.existsSync(dest)) missing.push(dest);
    else {
      const cur = fs.readFileSync(dest);
      if (!cur.equals(data)) changed.push([dest, data, cur]);
    }
  }
  for (const f of listActual()) if (!expected.has(f)) stale.push(f);

  const rel = (p) => path.relative(ROOT, p);
  const clean = !missing.length && !changed.length && !stale.length;

  if (check) {
    if (clean) {
      console.log(`sync-plugin: plugin/ is up to date (${expected.size} generated files)`);
      return;
    }
    console.error('sync-plugin: plugin/ is out of sync with its sources');
    for (const f of missing) console.error(`  missing  ${rel(f)}`);
    for (const [f, want, got] of changed) console.error(`  differs  ${rel(f)}  (${firstDiffLine(want, got)})`);
    for (const f of stale) console.error(`  stale    ${rel(f)}  (no source; remove or add to an allowlist)`);
    console.error('Fix the source (.claude/skills, starters, scripts) and run: node tools/sync-plugin.mjs');
    process.exit(1);
  }

  for (const f of stale) fs.rmSync(f);
  for (const [dest, data] of expected) {
    if (missing.includes(dest) || changed.some(([f]) => f === dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data);
    }
  }
  console.log(`sync-plugin: wrote ${missing.length + changed.length}, removed ${stale.length}, unchanged ${expected.size - missing.length - changed.length}`);
}

main();
