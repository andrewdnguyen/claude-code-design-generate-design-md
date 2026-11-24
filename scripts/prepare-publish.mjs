#!/usr/bin/env node
// Prepare an artifact for sharing: strip dev-only tooling, inline local assets, rewrite pinned
// unpkg URLs to jsdelivr, then scan the result for secrets and PII.
//
// Usage:
//   node scripts/prepare-publish.mjs artifacts/<name>.html [--allow-findings]
//       writes artifacts/publish/<name>.html, prints JSON incl. sha256 on stdout
//   node scripts/prepare-publish.mjs artifacts/<name>.html --strip-only --out <handoff/...|artifacts/...>.html
//       only removes dev-only elements (no inlining, no scan); lists the local files still referenced
//
// Exit codes: 0 ok | 1 bad usage or unsafe path | 2 I/O or parse error
//             3 secret/PII findings (unless --allow-findings) | 4 dev-only content survived
//
// Node standard library only. The source artifact is never modified.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEV_SCRIPT_FILES = new Set(['editor_overlay.js', 'live_reload.js']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT = new Set(['script', 'style']);
const MAX_ASSET_BYTES = 8 * 1024 * 1024;
const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const ALLOWED_SCRIPT_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'cdn.tailwindcss.com', 'code.jquery.com'];

class UsageError extends Error {}

// ---------- paths
function lexicalCheck(p, label) {
  if (typeof p !== 'string' || p === '' || p.includes('\0')) throw new UsageError(`${label}: empty or invalid path`);
  if (path.isAbsolute(p) || /^[A-Za-z]:/.test(p)) throw new UsageError(`${label}: absolute paths are not allowed`);
  if (p.split(/[\\/]+/).includes('..')) throw new UsageError(`${label}: '..' is not allowed`);
}

// Returns the absolute path if `p` is lexically and (for existing files) physically under one of `roots`.
function resolveUnder(p, roots, label, { mustExist }) {
  lexicalCheck(p, label);
  const abs = path.resolve(process.cwd(), p);
  const root = roots.find((r) => abs.startsWith(path.resolve(process.cwd(), r) + path.sep));
  if (!root) throw new UsageError(`${label}: must be under ${roots.join(' or ')}/`);
  if (mustExist) {
    let real;
    try {
      real = fs.realpathSync(abs);
    } catch {
      throw new UsageError(`${label}: file not found: ${p}`);
    }
    const rootReal = fs.realpathSync(path.resolve(process.cwd(), root));
    if (!real.startsWith(rootReal + path.sep)) throw new UsageError(`${label}: resolves outside ${root}/`);
    return real;
  }
  return abs;
}

// ---------- HTML tokenizer (comments and <script>/<style> bodies are skipped, not parsed)
function readTagEnd(html, i) {
  let quote = null;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return j + 1;
  }
  return -1;
}

function parseAttrs(s) {
  const list = [];
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const m of s.matchAll(re)) list.push([m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? null]);
  return list;
}

function tokenize(html) {
  const tokens = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const e = html.indexOf('-->', lt + 4);
      i = e === -1 ? html.length : e + 3;
      continue;
    }
    const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(html.slice(lt, lt + 40));
    if (!m) {
      i = lt + 1;
      continue;
    }
    const end = readTagEnd(html, lt + m[0].length);
    if (end === -1) throw new Error(`unterminated tag at offset ${lt}`);
    const name = m[2].toLowerCase();
    const inner = html.slice(lt + m[0].length, end - 1);
    const tok = {
      type: m[1] ? 'close' : 'open', name, start: lt, end,
      attrs: m[1] ? [] : parseAttrs(inner.replace(/\/\s*$/, '')),
      selfClosing: /\/\s*$/.test(inner),
    };
    tokens.push(tok);
    i = end;
    if (tok.type === 'open' && RAW_TEXT.has(name) && !tok.selfClosing) {
      const closeRe = new RegExp(`</${name}\\s*>`, 'i');
      const rest = html.slice(end);
      const cm = closeRe.exec(rest);
      if (!cm) throw new Error(`unterminated <${name}> at offset ${lt}`);
      tok.bodyStart = end;
      tok.bodyEnd = end + cm.index;
      tok.elementEnd = end + cm.index + cm[0].length;
      i = tok.elementEnd;
    } else if (tok.type === 'open') {
      tok.elementEnd = tok.end; // refined by callers that need balanced removal
    }
  }
  return tokens;
}

const attr = (tok, name) => {
  const hit = tok.attrs.find(([n]) => n === name);
  return hit ? (hit[1] === null ? '' : hit[1]) : undefined;
};
const hasAttr = (tok, name) => tok.attrs.some(([n]) => n === name);
const isDevTag = (tok) =>
  tok.type === 'open' &&
  (hasAttr(tok, 'data-dev-only') ||
    (tok.name === 'script' && DEV_SCRIPT_FILES.has(path.posix.basename((attr(tok, 'src') || '').split(/[?#]/)[0]))));

function renderTag(name, attrs, selfClose) {
  const parts = attrs.map(([n, v]) => (v === null ? n : `${n}="${String(v).replace(/"/g, '&quot;')}"`));
  return `<${[name, ...parts].join(' ')}${selfClose ? ' /' : ''}>`;
}

// End offset of the element opened by tokens[idx] (balanced for same-name nesting).
function elementEndFor(tokens, idx) {
  const t = tokens[idx];
  if (RAW_TEXT.has(t.name) && t.elementEnd) return t.elementEnd;
  if (VOID.has(t.name) || t.selfClosing) return t.end;
  let depth = 1;
  for (let k = idx + 1; k < tokens.length; k++) {
    const u = tokens[k];
    if (u.name !== t.name) continue;
    if (u.type === 'open' && !u.selfClosing) depth++;
    else if (u.type === 'close' && --depth === 0) return u.end;
  }
  throw new Error(`no closing </${t.name}> for dev-only element at offset ${t.start}`);
}

function applyEdits(html, edits) {
  // edits: [{start, end, text}] non-overlapping after merge; applied right to left.
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  let lastEnd = -1;
  for (const e of sorted) {
    if (e.start < lastEnd) continue; // nested inside an earlier edit
    kept.push(e);
    lastEnd = e.end;
  }
  let out = html;
  for (const e of kept.reverse()) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

// ---------- step 1: strip dev-only
function stripDev(html) {
  const tokens = tokenize(html);
  const edits = [];
  const stripped = [];
  tokens.forEach((t, idx) => {
    if (!isDevTag(t)) return;
    edits.push({ start: t.start, end: elementEndFor(tokens, idx), text: '' });
    stripped.push(attr(t, 'src') ? `${t.name} src=${attr(t, 'src')}` : t.name);
  });
  return { html: applyEdits(html, edits), stripped };
}

// ---------- step 2: inline local files, rewrite unpkg
const isLocalRef = (v) => typeof v === 'string' && v !== '' && !/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(v);

function readSibling(ref, baseDir) {
  const clean = ref.split(/[?#]/)[0];
  const rel = path.posix.join(baseDir.split(path.sep).join('/'), clean);
  const abs = resolveUnder(rel, ['artifacts'], `reference '${ref}'`, { mustExist: true });
  const size = fs.statSync(abs).size;
  if (size > MAX_ASSET_BYTES) throw new UsageError(`reference '${ref}': larger than ${MAX_ASSET_BYTES} bytes`);
  return { abs, rel, buf: fs.readFileSync(abs) };
}

function unpkgToJsdelivr(url) {
  const m = /^https:\/\/unpkg\.com\/((?:@[^/@]+\/)?[^/@]+)@(\d+\.\d+\.\d+[^/]*)\/(.+)$/.exec(url);
  if (!m) throw new UsageError(`unpkg URL is not pinned to an exact version: ${url}`);
  return `https://cdn.jsdelivr.net/npm/${m[1]}@${m[2]}/${m[3]}`;
}

function inlineAssets(html, baseDir, report) {
  const tokens = tokenize(html);
  const edits = [];
  for (const t of tokens) {
    if (t.type !== 'open') continue;
    if (t.name === 'script' && hasAttr(t, 'src')) {
      const src = attr(t, 'src');
      const keep = t.attrs.filter(([n]) => !['src', 'integrity', 'crossorigin'].includes(n));
      if (isLocalRef(src)) {
        const { rel, buf } = readSibling(src, baseDir);
        // '</script' inside the body would end the element early; '<\/script' is equivalent in JS.
        const body = buf.toString('utf8').replace(/<\/(script)/gi, '<\\/$1');
        edits.push({ start: t.start, end: t.elementEnd, text: `${renderTag('script', keep, false)}\n${body}\n</script>` });
        report.inlined.push(rel);
      } else if (/^https?:\/\/unpkg\.com\//i.test(src)) {
        const next = t.attrs.map(([n, v]) => (n === 'src' ? [n, unpkgToJsdelivr(src)] : [n, v]));
        const body = html.slice(t.bodyStart, t.bodyEnd);
        edits.push({ start: t.start, end: t.elementEnd, text: `${renderTag('script', next, false)}${body}</script>` });
        report.rewritten.push(src);
      } else if (/^(https?:)?\/\//i.test(src)) {
        warnRemote(src, report);
      }
    } else if (t.name === 'link' && /\bstylesheet\b/i.test(attr(t, 'rel') || '') && hasAttr(t, 'href')) {
      const href = attr(t, 'href');
      if (isLocalRef(href)) {
        const { rel, buf } = readSibling(href, baseDir);
        const css = buf.toString('utf8');
        if (/<\/style/i.test(css)) throw new UsageError(`stylesheet '${href}' contains '</style' and cannot be inlined`);
        edits.push({ start: t.start, end: t.end, text: `<style>\n${css}\n</style>` });
        report.inlined.push(rel);
      } else if (!/^https:\/\/fonts\.(googleapis|gstatic)\.com\//i.test(href)) {
        warnRemote(href, report);
      }
    } else if (t.name === 'img' && hasAttr(t, 'src')) {
      const src = attr(t, 'src');
      if (isLocalRef(src)) {
        const { rel, buf, abs } = readSibling(src, baseDir);
        const mime = MIME[path.extname(abs).toLowerCase()];
        if (!mime) throw new UsageError(`image '${src}': unsupported extension`);
        const next = t.attrs.map(([n, v]) => (n === 'src' ? [n, `data:${mime};base64,${buf.toString('base64')}`] : [n, v]));
        edits.push({ start: t.start, end: t.end, text: renderTag('img', next, t.selfClosing) });
        report.inlined.push(rel);
      } else if (/^(https?:)?\/\//i.test(src)) {
        warnRemote(src, report);
      }
    }
  }
  return applyEdits(html, edits);
}

function warnRemote(url, report) {
  let host = '';
  try {
    host = new URL(url.startsWith('//') ? `https:${url}` : url).hostname;
  } catch {
    // fall through with empty host
  }
  if (!ALLOWED_SCRIPT_HOSTS.includes(host)) report.warnings.push(`remote origin will not load on the published page: ${url}`);
}

// Artifact host adds its own document skeleton: drop doctype and html/head/body wrapper tags.
function unwrapDocument(html, report) {
  const tokens = tokenize(html);
  const edits = [];
  for (const t of tokens) {
    if (!['html', 'head', 'body'].includes(t.name)) continue;
    if (t.type === 'open' && t.attrs.some(([n]) => n !== 'lang')) report.warnings.push(`attributes on <${t.name}> are dropped by unwrapping`);
    edits.push({ start: t.start, end: t.end, text: '' });
  }
  return applyEdits(html, edits).replace(/<!doctype[^>]*>/i, '').trimStart();
}

// Local references that survived (broken once published or copied elsewhere).
function localRefs(html) {
  const refs = [];
  for (const t of tokenize(html)) {
    if (t.type !== 'open') continue;
    const v = t.name === 'link' ? attr(t, 'href') : ['script', 'img', 'source', 'video', 'audio'].includes(t.name) ? attr(t, 'src') : undefined;
    if (isLocalRef(v)) refs.push(v);
  }
  return refs;
}

// ---------- step 3: secret / PII scan
const PATTERNS = [
  ['github-token', /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{30,}/g],
  ['github-pat', /\bgithub_pat_[A-Za-z0-9_]{22,}/g],
  ['figma-token', /\bfigd_[A-Za-z0-9_-]{20,}/g],
  ['api-key (sk-)', /\bsk-[A-Za-z0-9_-]{20,}/g],
  ['slack-token', /\bxox[bparos]-[A-Za-z0-9-]{10,}/g],
  ['aws-access-key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
  ['absolute-path', /(?:\/Users|\/home)\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/g],
];

const redact = (s) => `${s.slice(0, Math.min(4, Math.floor(s.length / 4)))}[REDACTED:${s.length}]`;

function redactAll(text) {
  let out = text;
  for (const [, re] of PATTERNS) out = out.replace(new RegExp(re.source, 'g'), redact);
  return out;
}

function scan(html) {
  const findings = [];
  html.split('\n').forEach((line, i) => {
    for (const [type, re] of PATTERNS) {
      for (const m of line.matchAll(new RegExp(re.source, 'g'))) {
        const from = Math.max(0, m.index - 30);
        const excerpt = redactAll(line.slice(from, m.index + m[0].length + 30));
        findings.push({ type, line: i + 1, excerpt: excerpt.replace(/\s+/g, ' ') });
      }
    }
  });
  return findings;
}

const devSurvivors = (html) => ['data-dev-only', ...DEV_SCRIPT_FILES].filter((s) => html.includes(s));

// ---------- main
function main() {
  const args = process.argv.slice(2);
  const opt = { allowFindings: false, stripOnly: false, out: null };
  const pos = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--allow-findings') opt.allowFindings = true;
    else if (args[i] === '--strip-only') opt.stripOnly = true;
    else if (args[i] === '--out') opt.out = args[++i];
    else if (args[i].startsWith('--')) throw new UsageError(`unknown flag ${args[i]}`);
    else pos.push(args[i]);
  }
  if (pos.length !== 1) {
    throw new UsageError('Usage: node scripts/prepare-publish.mjs artifacts/<name>.html [--allow-findings] | --strip-only --out <path>');
  }
  const input = pos[0];
  if (!/^[A-Za-z0-9._ -]+\.html$/.test(path.basename(input))) throw new UsageError('input must be a .html file with a plain file name');
  const inAbs = resolveUnder(input, ['artifacts'], 'input', { mustExist: true });
  const baseDir = path.posix.dirname(input.split(path.sep).join('/'));
  const name = path.basename(input, '.html');

  let outRel;
  if (opt.stripOnly) {
    if (!opt.out) throw new UsageError('--strip-only requires --out <path>');
    outRel = opt.out;
    resolveUnder(outRel, ['handoff', 'artifacts'], '--out', { mustExist: false });
  } else {
    if (opt.out) throw new UsageError('--out is only valid with --strip-only');
    outRel = `artifacts/publish/${name}.html`;
  }

  const report = { source: input, out: outRel, stripped: [], inlined: [], rewritten: [], warnings: [] };
  const stripResult = stripDev(fs.readFileSync(inAbs, 'utf8'));
  report.stripped = stripResult.stripped;
  let html = stripResult.html;

  if (opt.stripOnly) {
    report.local_refs = [...new Set(localRefs(html))];
  } else {
    html = inlineAssets(html, baseDir, report);
    html = unwrapDocument(html, report);
    report.warnings.push(...localRefs(html).map((r) => `unresolved local reference: ${r}`));
  }

  const survivors = devSurvivors(html);
  if (survivors.length) {
    console.error(`dev-only content survived stripping: ${survivors.join(', ')}`);
    process.exit(4);
  }

  const findings = opt.stripOnly ? [] : scan(html);
  const outAbs = resolveUnder(outRel, ['handoff', 'artifacts'], 'output', { mustExist: false });
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  // Re-check physical location now that the directory exists (blocks symlinked output dirs).
  const realDir = fs.realpathSync(path.dirname(outAbs));
  const allowed = ['handoff', 'artifacts'].map((r) => path.resolve(process.cwd(), r));
  const allowedReal = allowed.map((r) => (fs.existsSync(r) ? fs.realpathSync(r) : r));
  if (!allowedReal.some((r) => realDir === r || realDir.startsWith(r + path.sep))) throw new UsageError('output directory resolves outside handoff/ and artifacts/');
  fs.writeFileSync(outAbs, html);

  if (findings.length && !opt.allowFindings) {
    console.error(`${findings.length} possible secret/PII finding(s) in ${outRel}; nothing may be published until reviewed:`);
    for (const f of findings) console.error(`  [${f.type}] line ${f.line}: ${f.excerpt}`);
    console.error('Re-run with --allow-findings only after the user has reviewed and accepted them.');
    process.exit(3);
  }

  report.findings_allowed = findings.length;
  report.sha256 = crypto.createHash('sha256').update(html).digest('hex');
  report.bytes = Buffer.byteLength(html);
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (e) {
  console.error(e.message);
  process.exit(e instanceof UsageError ? 1 : 2);
}
