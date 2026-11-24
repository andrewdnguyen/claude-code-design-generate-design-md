---
name: doctor
description: First-run health check. Verifies Chrome DevTools MCP and optional deps (monolith, pptxgenjs, puppeteer), prints the install commands for the user to run, creates working dirs, runs smoke test. Use on fresh clone or when things feel broken.
allowed-tools: Read Write Bash(claude mcp list) Bash(which:*) Bash(node --version) Bash(mkdir -p artifacts:*) Bash(ls:*) Bash(test:*) Bash(echo FIGMA_TOKEN-present) mcp__chrome-devtools__list_pages mcp__chrome-devtools__take_screenshot
---

# Doctor

Cold-start health check. Never installs anything itself — it prints the commands for the user to run. Safe to run multiple times.

## Phase 0 — Managed settings check

This plugin's own `settings.json` (if it shipped one) cannot carry a `permissions.deny` list —
a plugin's settings file only honors the `agent` and `subagentStatusLine` keys. The only mechanism
that can deliver a project-wide deny list alongside a plugin is a **managed settings** file the
client machine's administrator deploys outside this repo entirely, at one of:

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux: `/etc/claude-code/managed-settings.json`
- Windows: `C:\Program Files\ClaudeCode\managed-settings.json`

Without one of those in place, the PreToolUse hooks in this plugin (`guard-bash.sh`, `guard-browser.py`)
are still the *only* enforced control — there is no separate deny-list layer underneath them the way
the `.claude/settings.json`-based workspace mode has. That is a materially weaker security posture for
anything sensitive, so doctor checks for it and warns (never blocks — doctor is diagnostic, not
enforcement):

1. On macOS: `Bash(test -f "/Library/Application Support/ClaudeCode/managed-settings.json" && echo present || echo missing)`. Linux/Windows administrators should check their own path from the list above; doctor only knows how to check the macOS path directly from here.

   **Deviation from a literal `ls`-based check:** the natural-looking form
   `Bash(ls "/Library/Application Support/ClaudeCode/managed-settings.json" 2>/dev/null)` looks safer
   but is actually denied by this plugin's own bash guard — an absolute path outside the project always
   hits the guard's outside-project deny, regardless of read vs. write intent. `test -f` is one of the
   handful of commands the guard deliberately leaves path-unchecked (alongside `file`, `realpath`,
   `basename`, `unzip`), specifically so existence checks like this one remain possible. Use `test`, not
   `ls`, for this check and for the `"${CLAUDE_PLUGIN_ROOT}"` checks in Phase 1 below.

2. If missing, warn (do not block):
   > No managed-settings.json found at the standard macOS path. Without it, this plugin's Bash/browser
   > guards are your only layer of defense — there is no separate, admin-deployed deny list under them.
   > Ask your Claude Code administrator to deploy `"${CLAUDE_PLUGIN_ROOT}"/managed-settings.reference.json`
   > (or an equivalent) to the managed-settings path for your OS before relying on this plugin for
   > anything security-sensitive.

## Phase 1 — Inventory

Run in parallel where possible:

1. `Bash(claude mcp list)` — parse output, look for `chrome-devtools: ✓ Connected`
2. `Bash(which monolith)` — existence check
3. `Bash(node --version)` — required (`which node` is blocked by the guard; `node --version` is the allowed form and prints the version for the report)
4. `Bash(which gh)` — for `/ingest-github`
5. `Bash(ls package.json)` — prints the name when it exists, an error when it does not
6. `Bash(test -d "${CLAUDE_PLUGIN_ROOT}/starters" && echo present || echo missing)` — this plugin's own starters, not a project-relative path
7. `Bash(ls -d artifacts)`
8. This plugin ships a fixed set of skills installed alongside the plugin itself, so report the
   plugin's version (from its manifest) rather than a live directory count. **Deviation:** the
   analogous workspace-mode check (`ls .claude/skills`) does not carry over — `ls`/`cat`-style reads of
   any `"${CLAUDE_PLUGIN_ROOT}"` path are denied by this plugin's guard by design (only `node` on the
   three export scripts and `cp` reading a `.js`/`.jsx` starter are allowed), so there is no guard-safe
   way to enumerate `"${CLAUDE_PLUGIN_ROOT}"/skills` from a Bash command here. Do not invent a new guard
   exception for this — it is not worth widening the allowlist for a cosmetic count.
9. `Bash(ls -d node_modules/puppeteer)` and `Bash(ls -d node_modules/pptxgenjs)` — the path printed means installed; `No such file or directory` means missing
10. `Bash(test -n "$FIGMA_TOKEN" && echo FIGMA_TOKEN-present)` — prints `FIGMA_TOKEN-present` when set, exits 1 with no output when not. This form never prints the value; the guard blocks `echo $FIGMA_TOKEN`

Use `ls`, not `test`, for every existence check inside the project (a failing `test -d` prints nothing
and its non-zero exit code is not shown in the tool result, so a missing dependency reads as a pass).
The two exceptions are paths the guard denies to `ls` outright regardless of intent — anything under
`"${CLAUDE_PLUGIN_ROOT}"` and any absolute path outside the project (as used for the managed-settings
check in Phase 0) — where `test` is used deliberately, per the deviations noted above.

## Phase 2 — Report

Print structured report:

```
Chrome DevTools MCP:   ✓ / ✗ (if ✗, show install command)
monolith CLI:          ✓ / ✗ (optional; needed for /export-standalone)
Node:                  ✓ / ✗ (required)
gh CLI:                ✓ / ✗ (needed for /ingest-github)
puppeteer:             ✓ / ✗ (needed for /export-pdf and /export-pptx)
pptxgenjs:             ✓ / ✗ (needed for /export-pptx)
package.json:          exists / missing
plugin starters/ dir:  exists / missing
artifacts/ dir:        will create
plugin skills:         v<plugin.json version> (fixed set, installed with the plugin)
managed-settings.json: present / missing (see Phase 0 — warning only, never blocks)
FIGMA_TOKEN env:       set / not set (only needed for /ingest-figma)
```

## Phase 3 — Repair (user runs the commands)

Do not install anything. Print the exact commands for the user to run in a separate shell:

```
# Chrome DevTools MCP — already declared in .mcp.json (pinned, --isolated); approve it when Claude Code asks,
# or register it manually with the same pinned, isolated form:
claude mcp add chrome-devtools -s project -- npx chrome-devtools-mcp@1.9.0 --isolated
brew install monolith
npm install -D pptxgenjs@4.0.1 puppeteer@24.41.0
```

Then ask them to restart Claude Code and re-run `/doctor`.

### Credentials (print as guidance, never ask for the value)

Only print this when the user has `gh` or `FIGMA_TOKEN` set up, or asks about it. Never ask the user to paste a token into the chat, and never read token files.

```
GitHub (gh): /ingest-github only clones.
  Prefer a fine-grained personal access token scoped to the repositories you use, with
  read-only Contents (add Pull requests: read/write only if you open PRs from Claude Code),
  and an expiry of 90 days or less:
    gh auth login --with-token  < token-file      # run it yourself, outside Claude Code
  A classic token with the `repo` scope can reach every repo you can; avoid it here.

Figma (FIGMA_TOKEN): /ingest-figma only reads files.
  Create a personal access token with the file content read-only scope and the shortest expiry
  that works. Export it in your shell profile or a secrets manager, never in a project file.
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
