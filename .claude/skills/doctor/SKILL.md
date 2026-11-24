---
name: doctor
description: First-run health check. Verifies Chrome DevTools MCP and optional deps (monolith, pptxgenjs, puppeteer), prints the install commands for the user to run, creates working dirs, runs smoke test. Use on fresh clone or when things feel broken.
allowed-tools: Read Write Bash(claude mcp list) Bash(which:*) Bash(node --version) Bash(mkdir -p artifacts:*) Bash(ls:*) Bash(test:*) Bash(echo FIGMA_TOKEN-present) mcp__chrome-devtools__list_pages mcp__chrome-devtools__take_screenshot
---

# Doctor

Cold-start health check. Never installs anything itself — it prints the commands for the user to run. Safe to run multiple times.

## Phase 1 — Inventory

Run in parallel where possible:

1. `Bash(claude mcp list)` — parse output, look for `chrome-devtools: ✓ Connected`
2. `Bash(which monolith)` — existence check
3. `Bash(node --version)` — required (`which node` is blocked by the guard; `node --version` is the allowed form and prints the version for the report)
4. `Bash(which gh)` — for `/ingest-github`
5. `Bash(ls package.json)` — prints the name when it exists, an error when it does not
6. `Bash(ls -d starters)` — expect the path printed
7. `Bash(ls -d artifacts)`
8. `Bash(ls .claude/skills)` — one line per skill; count them for the report
9. `Bash(ls -d node_modules/puppeteer)` and `Bash(ls -d node_modules/pptxgenjs)` — the path printed means installed; `No such file or directory` means missing
10. `Bash(test -n "$FIGMA_TOKEN" && echo FIGMA_TOKEN-present)` — prints `FIGMA_TOKEN-present` when set, exits 1 with no output when not. This form never prints the value; the guard blocks `echo $FIGMA_TOKEN`
11. `Bash(ls .claude/hooks/hooks.sha256 .claude/hooks/guard-tools.py)` — the hook-integrity pin and the tool guard. Missing means the 2026-11 security fixes are not installed (see `SECURITY.md`)
12. `Bash(ls -d node_modules/chrome-devtools-mcp)` — `.mcp.json` starts it with `npx --no-install`, so it must be installed locally

Use `ls`, not `test`, for every existence check. A failing `test -d` prints nothing and its non-zero
exit code is not shown in the tool result, so a missing dependency reads as a pass and the export
scripts then crash on `import puppeteer`. `ls` always prints something you can read.

## Phase 2 — Report

Print structured report:

```
Chrome DevTools MCP: ✓ / ✗ (if ✗, show install command)
monolith CLI:        ✓ / ✗ (optional; needed for /export-standalone)
Node:                ✓ / ✗ (required)
gh CLI:              ✓ / ✗ (needed for /ingest-github)
puppeteer:           ✓ / ✗ (needed for /export-pdf and /export-pptx)
pptxgenjs:           ✓ / ✗ (needed for /export-pptx)
package.json:        exists / missing
starters/ dir:       exists / missing
artifacts/ dir:      will create
.claude/skills/:     N skills found
FIGMA_TOKEN env:     set / not set (only needed for /ingest-figma)
hook pins:           present / missing (.claude/hooks/hooks.sha256 + guard-tools.py)
chrome-devtools-mcp: installed / missing (node_modules, needed by .mcp.json)
```

## Phase 3 — Repair (user runs the commands)

Do not install anything. Print the exact commands for the user to run in a separate shell:

```
# Installs the exact versions pinned in package.json / package-lock.json:
# chrome-devtools-mcp (started by .mcp.json with npx --no-install), puppeteer, pptxgenjs
npm ci
brew install monolith
```

Then ask them to restart Claude Code and re-run `/doctor`.

If hook pins are missing, point them to `artifacts/security-fixes/APPLY.md` if it exists, otherwise to `SECURITY.md`. Never create or rewrite `hooks.sha256` yourself.

### Credentials (print as guidance, never ask for the value)

Only print this when the user has `gh` or `FIGMA_TOKEN` set up, or asks about it. Never ask the user to paste a token into the chat, and never read token files.

```
GitHub (gh): /ingest-github only clones, and ship-branch only pushes, opens and merges PRs on the fork.
  Prefer a fine-grained personal access token scoped to the repositories you use, with
  Contents: read/write and Pull requests: read/write, and an expiry (90 days or less):
    gh auth login --with-token  < token-file      # run it yourself, outside Claude Code
  A classic token with the `repo` scope can reach every repo you can; avoid it here.

Figma (FIGMA_TOKEN): /ingest-figma only reads files.
  Create a personal access token with the file content read-only scope and the shortest expiry
  that works. Export it in your shell profile or a secrets manager, never in a project file:
    export FIGMA_TOKEN=...                          # in your own shell, not in .env in this repo
  The guard never sends it anywhere except https://api.figma.com/ and refuses to follow redirects
  with it.

Rotate either token if a session ever printed it, or if an ingested file asked you to share it.
```

The only repair this skill performs itself: `Bash(mkdir -p artifacts assets/thumbs test)`.

## Phase 4 — Smoke test

Run it whenever Chrome DevTools MCP is connected; the optional dependencies (monolith, puppeteer, pptxgenjs) are not needed for the smoke deck, so a missing export dependency does not skip this phase.
1. `test/smoke-deck.html` is versioned in the repo. Only if `Bash(ls test/smoke-deck.html)` reports it missing, write this minimal one:
   ```html
   <!doctype html>
   <html><head><meta charset="utf-8"/><title>Smoke</title>
   <script src="../starters/deck_stage.js"></script></head>
   <body><deck-stage width="1920" height="1080">
     <section style="padding:60px;font:48px/1.2 Georgia"><h1>One</h1></section>
     <section style="padding:60px;font:48px/1.2 Georgia;background:#f4e4d7"><h1>Two</h1></section>
     <section style="padding:60px;font:48px/1.2 Georgia;background:#4a5d2e;color:#fff"><h1>Three</h1></section>
   </deck-stage></body></html>
   ```
2. Run `/done test/smoke-deck.html`
3. If Chrome DevTools MCP is connected — check screenshot at `.claude/last-preview.png` exists and console is clean
4. Report pass/fail

## Phase 5 — Hint sheet

Print one-liner hints:
```
Available commands & skills:
  /make-deck <brief>            — build a slide deck
  /interactive-prototype <brief> — clickable React prototype
  /wireframe <thing>            — low-fi variants
  /create-design-system <src>   — extract style guide
  /ingest-github <url>          — pull tokens from repo
  /ingest-screenshot <path>     — extract tokens from image
  /ingest-figma <url>           — pull from Figma (needs FIGMA_TOKEN)
  /make-tweakable <html>        — add live tweak panel
  /apply-tweaks <html>          — persist panel changes
  /ingest-document <file>       — theme + outline from PPTX/DOCX/XLSX/PDF
  /register-asset <html>        — add to assets.html overview
  /verify-artifact <html>       — vision + design-system conformance QA
  /snapshot <html> <label>      — save / list / restore versions
  /publish <html>               — private share link on claude.ai + comments
  /sync-design-system <name>    — push a registry entry to Claude Design
  /export-pdf  /export-pptx  /export-standalone  /handoff
  /preview /done /screenshot    — operational atomics
```
