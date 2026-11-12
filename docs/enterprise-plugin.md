# Enterprise plugin roadmap

Status: **a first plugin build now exists at `plugin/`, additive to the workspace.** Today this
repo is still, primarily, a workspace (a project folder with `.claude/skills`, `.claude/commands`,
`.claude/settings.json`, `.claude/hooks` and `.mcp.json`), and that workspace is untouched by the
plugin build. The decision that was made: `plugin/` is a **new, separate, self-contained package**
sitting alongside the workspace — not an in-place conversion of `.claude/` into a plugin. The two
can coexist in this repo indefinitely; installing the plugin elsewhere has no effect on this repo's
own workspace mode, and nothing under `.claude/`, `starters/`, `scripts/` or `.mcp.json` was modified
to produce it. See `plugin/README.md` for what was built, its known issues, and the exact
verification commands. This document continues to describe the fuller roadmap — what has and has
not been done toward it is noted inline below and in §6.

Important provenance note: `plugin/hooks/guard-bash.sh` and `plugin/hooks/test-guard.sh` were built
from the **already-hardened** `artifacts/hardening-patch/` versions of the guards (the ones that fix
the reviewer-confirmed gaps tracked in `docs/architecture/security-architecture.html`), not from the
older, unpatched versions still committed at `.claude/hooks/`. Building the plugin did **not** apply
that hardening patch to the workspace's own `.claude/hooks/` — that remains a separate, still
outstanding manual step for a human to run, exactly as described in
`artifacts/hardening-patch/README.md`. Until that step happens, the workspace's own guards remain the
older, less-hardened versions; only the plugin's copies are on the hardened baseline.

This document describes what it would take to ship the same capability as a Claude Code
**plugin** for an enterprise client that

- runs Claude Code against its own inference endpoint (Microsoft Foundry, Amazon Bedrock,
  Google Cloud, or an internal LLM gateway), and
- cannot use Claude Desktop or the claude.ai web app.

The second constraint is already met: this workspace runs in the **Claude Code CLI** and has
never depended on Claude Desktop. The features that do touch claude.ai are listed below and
degrade to "unavailable" rather than breaking the rest.

Facts marked *(docs)* were checked against the Claude Code documentation by a
documentation-lookup agent on 2026-09-08, with a second pass on 2026-09-11 that resolved most
of the items previously marked *(verify)*. Two *(verify)* notes remain: the bypass-mode
behaviour of deny rules and hook denies in §3, which the agent could only source from search
snippets, and the plugin-cache carve-out in §3, which depends on the client's environment.
Documentation URLs are at the end.

---

## 1. What changes between a workspace and a plugin

| Concern | Workspace (today) | Plugin (proposed) |
|---|---|---|
| Distribution | Clone or "Use this template" | `/plugin install` from a marketplace, `--plugin-dir <path>` for local testing, `--plugin-url` for a remote zip *(docs)* |
| Manifest | none | `.claude-plugin/plugin.json` at the plugin root; **`name` is the only required field** — "If you include a manifest, `name` is the only required field." `description`, `version`, `author`, `homepage`, `repository`, `license` are all optional metadata fields; `author` is an **object** (`{name, email?, url?}`), not a string *(docs, confirmed via a direct fetch of the plugins-reference page, 2026-09-15; corrects an earlier draft of this table which listed `description` as required too)* |
| Skills, commands | `.claude/skills/*`, `.claude/commands/*` | `skills/`, `commands/` at the plugin root, **outside** `.claude-plugin/` *(docs)* |
| Hooks | registered in `.claude/settings.json`, scripts under `.claude/hooks/`, referenced as `"$CLAUDE_PROJECT_DIR"/.claude/hooks/…` | `hooks/hooks.json` at the plugin root *(docs)*. A hook references its own script through `"${CLAUDE_PLUGIN_ROOT}"/hooks/guard-bash.sh`, the absolute path of the plugin's installation directory, quoted in shell-form hooks *(docs)* |
| MCP server | `.mcp.json` in the project | `.mcp.json` at the plugin root *(docs)* |
| Permission deny list | `permissions.deny` in `.claude/settings.json` | **Plugins cannot ship permission rules** *(docs)*. The deny list must be delivered another way, see §3 |
| Default settings | n/a | a plugin may ship a `settings.json`, but only the `agent` and `subagentStatusLine` keys are honoured, so it cannot carry `permissions` *(docs, re-confirmed via a direct fetch of the plugins-reference page, 2026-09-15: "Only the `agent` and `subagentStatusLine` keys are supported")* |
| CLAUDE.md policy | project `CLAUDE.md` | not a plugin component; ship it as a skill's instructions or ask the client to add it to their project or managed `CLAUDE.md` |
| Starters, export scripts | `starters/`, `scripts/*.mjs` | plugin root; the guard's `node` allowlist must be rewritten to `${CLAUDE_PLUGIN_ROOT}/scripts/…` and the self-test extended for it |

### Why the deny list matters more than it looks

The security model of this workspace is **three layers that overlap on purpose**
(drawn in `docs/architecture/security-architecture.html`):

1. `permissions.deny` in settings: cheap, evaluated by Claude Code before any hook, and
   the only layer that covers `Read`/`Write`/`Edit` (protecting the hooks themselves,
   `.mcp.json`, `scripts/`, credentials and dotfiles).
2. Two PreToolUse hooks: `guard-bash.sh` allowlists command forms per pipeline segment,
   `guard-browser.py` keeps Chrome DevTools MCP on project files and `127.0.0.1`.
3. Per-skill `allowed-tools`, plus the `CLAUDE.md` rules the model is expected to follow.

A plugin can carry layer 2 and layer 3. It cannot carry layer 1. Without layer 1 the hooks
are writable by the agent, which makes layer 2 advisory. **The plugin is therefore only
"fit for use" when the client installs layer 1 through managed settings** (§3). The
plugin's `README` and its `/doctor` skill must check for that and refuse to run the
export, ingest and browser skills until it is present.

---

## 2. Inference without Anthropic-hosted endpoints

Claude Code selects the provider with one environment flag; everything in this workspace
is provider-agnostic because it never calls the model API itself, it only runs inside
Claude Code. *(docs, all rows)*

This is the reason the workspace exists. Claude Code's built-in `/design` command and the
artifact platform it publishes to require a claude.ai session on the Anthropic API; the
docs list both as unavailable on Amazon Bedrock, Google Vertex AI, Microsoft Foundry and
Claude Platform on AWS *(docs, artifacts.md and commands.md, checked 2026-09-12)*. A client
on those endpoints has no supported path to Claude Design output from Claude Code, and this
workspace, or the plugin proposed here, is that path.

| Provider | Enable | Endpoint / region | Auth | Model names |
|---|---|---|---|---|
| Microsoft Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | `ANTHROPIC_FOUNDRY_RESOURCE` or `ANTHROPIC_FOUNDRY_BASE_URL` | `ANTHROPIC_FOUNDRY_API_KEY`, Microsoft Entra ID (default Azure credential chain), or `ANTHROPIC_FOUNDRY_AUTH_TOKEN` | Must match the client's deployment names, e.g. `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`. There is no startup check; a missing deployment fails at request time |
| Amazon Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | `AWS_REGION` (falls back to `us-east-1`) | AWS default credential chain, `--profile`, `AWS_BEARER_TOKEN_BEDROCK`, or an `awsAuthRefresh` command in settings | Inference-profile ids such as `us.anthropic.claude-opus-5-5` |
| Google Cloud (Agent Platform, formerly Vertex AI) | `CLAUDE_CODE_USE_VERTEX=1` | `CLOUD_ML_REGION`, `ANTHROPIC_VERTEX_PROJECT_ID` | Application Default Credentials, `GOOGLE_APPLICATION_CREDENTIALS`, or a `gcpAuthRefresh` command in settings | `claude-opus-5-5`, `claude-sonnet-5-5`, … |
| LLM gateway / proxy | provider flag as above | `ANTHROPIC_BASE_URL`, or per-provider `ANTHROPIC_BEDROCK_BASE_URL`, `ANTHROPIC_VERTEX_BASE_URL`, `ANTHROPIC_FOUNDRY_BASE_URL` | whatever the gateway requires | as the underlying provider |

Pin models with `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`,
`ANTHROPIC_DEFAULT_HAIKU_MODEL` *(docs)*.

### What is unavailable on third-party providers *(docs)*

| Feature | Used by this workspace? | Effect |
|---|---|---|
| Artifact tool (`/publish`, comments, replies) | yes, `publish` skill | skill reports "unavailable on this provider" and stops; sharing falls back to `/export-standalone` and the client's own hosting |
| DesignSync (`/sync-design-system`) | yes, `sync-design-system` skill | unavailable; the design-system registry under `design-systems/` keeps working locally |
| WebSearch, fast mode, Advisor, Channels, analytics dashboard, server-managed settings, `/import` | no | none |
| Remote Control (gateway only) | no | none |

Everything else in the workspace, including Chrome DevTools MCP, exports, ingest, snapshots
and handoff, is local tooling and does not depend on the provider.

Telemetry is off by default on Bedrock, Vertex and Foundry; `DISABLE_TELEMETRY` turns it off
elsewhere *(docs)*. Data retention on third-party providers follows the cloud provider's
agreement, not Anthropic's *(docs)*.

---

## 3. Delivering the controls a plugin cannot carry

**Managed settings** are the enterprise mechanism. Paths *(docs)*:

- macOS: `/Library/Application Support/ClaudeCode/managed-settings.json`
- Linux: `/etc/claude-code/managed-settings.json`
- Windows: `C:\Program Files\ClaudeCode\managed-settings.json`

Precedence is managed → user (`~/.claude/settings.json`) → project (`.claude/settings.json`)
→ `--settings` flag, and managed settings can force hooks, restrict MCP servers and set
`permissions` *(docs)*. Deny rules, and hooks that return a deny decision, block the tool in
every permission mode, including `bypassPermissions` and `--dangerously-skip-permissions`
*(confirmed via a documentation lookup on 2026-09-15: "A hook that returns
`permissionDecision: "deny"` blocks the tool even in bypassPermissions mode or with
`--dangerously-skip-permissions`, letting you enforce policy that users can't bypass by
changing their permission mode," and separately, "Deny rules ... and hooks are evaluated
before the mode check and can still block a tool." Both direct page fetches for this session
returned oversized documents that this session's tooling could not fully inline, so this was
confirmed via targeted documentation search rather than a full primary-source read of the
page end-to-end; the quoted sentences match Anthropic's documented phrasing closely enough,
and were corroborated independently in two separate searches, that this note now treats the
claim as confirmed rather than "verify" — but a human with full page access should still
spot-check it against the live permission-modes/hooks-guide pages before an audit leans on
it hard)*. Managed settings can also disable that mode outright with
`permissions.disableBypassPermissionsMode`, listed in the settings reference as "Prevent
anyone from entering bypassPermissions mode" *(docs; the reference does not state the value
type, so confirm the accepted value in the client's Claude Code version)*.

Proposed split:

| Control | Where it lives in the plugin model |
|---|---|
| `permissions.deny` (network tools, package managers, credential paths, protected files) | managed settings, maintained by the client's platform team; the plugin ships a reference copy and `/doctor` diffs against it |
| `guard-bash.sh`, `guard-browser.py` | plugin `hooks/hooks.json`; a managed-settings hook entry can additionally force them so a project cannot omit them *(docs: managed settings can force hooks)* |
| `.mcp.json` with pinned `chrome-devtools-mcp` and `--isolated` | plugin; managed settings restrict which MCP servers may run |
| `CLAUDE.md` rules (ask before ingest, untrusted content, browser scope) | client's managed or project `CLAUDE.md`, copied from the plugin |
| Self-test (`test-guard.sh`) | plugin; run by `/doctor` and in the client's CI |

Resolved: the workspace's own deny list includes a blanket `Read(~/.claude/**)`, which would
also block reading plugin caches under `~/.claude/plugins/` — confirmed via a direct fetch of
the plugins-reference page (2026-09-15): Claude Code caches marketplace plugins at
`~/.claude/plugins/cache` (one directory per installed version, grouped by marketplace and
plugin name) and keeps a persistent per-plugin data directory at `~/.claude/plugins/data/{id}/`.
`plugin/managed-settings.reference.json` in this repo carves this out: instead of a blanket
`Read(~/.claude/**)`, it denies only the two specific files that matter
(`Read(~/.claude/settings.json)`, `Read(~/.claude/settings.local.json)`) plus `~/.claude.json`,
and leaves `~/.claude/plugins/**` readable so an installed plugin can read its own cached
files. It still denies `Write`/`Edit` under `~/.claude/**` (including the plugin cache) and adds
an explicit `Edit(~/.claude/plugins/**)` deny, since nothing should be rewriting an installed
plugin's files in place.

---

## 4. Supply chain and egress inventory

An auditor will ask what leaves the machine. Complete list for this workspace:

| Destination | Initiated by | Gate | Required? |
|---|---|---|---|
| Inference endpoint (Anthropic API, Foundry, Bedrock, Vertex, or gateway) | Claude Code itself, every turn | provider env flags; not visible to hooks | yes |
| npm registry | `npx chrome-devtools-mcp@1.9.0` on every MCP start, per `.mcp.json` | version pinned; **no integrity hash**; the client should vendor the package or point npm at an internal registry | yes, for preview |
| Chrome / Chromium | the MCP launches Chrome with `--isolated`; Chrome's own background traffic is not controlled by this repo | none from this repo | yes, for preview |
| github.com | `gh repo clone` in `ingest-github`, after an explicit yes | guard-bash allows only `repo clone`, `repo fork`, `auth status`, `pr`, `issue`; `gh api` denied | optional |
| api.figma.com | `curl` GET in `ingest-figma`, after an explicit yes | guard-bash allows one `https://api.figma.com/` URL, GET, `-o` under `artifacts/ingested/` | optional |
| fonts.googleapis.com, fonts.gstatic.com | artifact pages and export scripts | script hosts limited to unpkg + Google Fonts in the export scripts | optional (fonts fall back) |
| unpkg.com | React/Babel artifacts, pinned with SRI hashes | export scripts refuse other hosts | optional |
| cdn.jsdelivr.net | published copies only (`/publish` rewrites unpkg → jsdelivr, same hashes) | n/a on third-party providers | optional |
| claude.ai | `/publish`, comments, `/sync-design-system` | user asks each time; unavailable on third-party providers | optional |
| puppeteer's Chromium download | `npm install -D puppeteer` at install time, run by the user, never the agent | user's shell | optional (PDF export) |

No other outbound call exists in the committed skills. `wget`, `nc`, `ssh`, `scp`, `rsync`,
`npx`, `npm`, `brew`, `pip` are denied by settings and by the guard.

---

## 5. What an auditor should run

### Against the workspace (`.claude/`)

1. `bash .claude/hooks/test-guard.sh` and confirm **0 failed**. The suite has 389 cases
   (up from 287), reflecting the hardening patch under `artifacts/hardening-patch/`, applied
   to `.claude/hooks/` on 2026-09-15 (commit `dd641c0`) and confirmed passing.
   This closed a critical bypass (found the same day by an adversarial review of the
   plugin build, documented as finding #10 in `artifacts/hardening-patch/README.md`) that
   let a smuggled command past the guard entirely via a `\"` sequence — see that finding for
   the mechanism and proof-of-concept string.
2. `git diff --no-index` the two hooks against the plugin's reference copy (a plugin must
   ship a checksum file for this).
3. Confirm `.claude/settings.json` (or managed settings) contains the deny list, and that
   `Write`/`Edit` on `.claude/hooks/**`, `settings*.json`, `.mcp.json`, `scripts/**` is denied.
4. Confirm `.mcp.json` pins `chrome-devtools-mcp@1.9.0` with `--isolated`.
5. Read the findings register in `docs/architecture/security-architecture.html`: G-01 to
   G-10 are reviewer/adversarial-review-confirmed gaps, all closed by the hardening patch
   now applied to the committed guard (G-10 is the critical backslash/quote-tracking desync
   above); R-01 to R-05 are accepted residual risks. Confirm the self-test still passes at
   389 before relying on this.

### Against the plugin (`plugin/`)

6. `bash -n plugin/hooks/guard-bash.sh` and `python3 -m py_compile plugin/hooks/guard-browser.py`
   — both must exit clean before anything else below is meaningful.
7. `bash plugin/hooks/test-guard.sh` and confirm **0 failed** against **408 cases** (103
   must-allow, 263 must-block, 42 browser-guard; verified via
   `rg -c '^b?check ' plugin/hooks/test-guard.sh`). A `node --check` gap was found and fixed
   during this build (support for that flag was dropped from `re_node_ok` rather than patched)
   — see `plugin/README.md`'s "Known issues" section for the history. A separate, **critical**
   backslash/quote-tracking desync was found by an adversarial review after the build landed —
   see `plugin/README.md`'s "Critical bypass found by adversarial review" section — and fixed
   there, in `plugin/hooks/guard-bash.sh`; the same fix has since been applied to
   `.claude/hooks/guard-bash.sh` protecting this repo's own workspace mode (commit `dd641c0`).
8. Confirm `plugin/.claude-plugin/plugin.json` is valid JSON with at least `name` set, and
   that `plugin/hooks/hooks.json` wires both guards through `"${CLAUDE_PLUGIN_ROOT}"/hooks/…`.
9. Confirm a managed-settings deny list (`plugin/managed-settings.reference.json` or
   equivalent) is actually deployed at the OS-specific managed-settings path on any machine
   this plugin is installed on — without it, the plugin's PreToolUse hooks are the *only*
   enforced control, with no deny-list layer underneath them (see §3, "Why the deny list
   matters more than it looks", which applies to the plugin exactly as it does to the
   workspace).
10. Confirm `plugin/scripts/` and `plugin/.mcp.json` actually exist in the installed plugin
    (they do, as of this build — the staging-and-rename history is in `plugin/README.md`'s
    "Setup-step history" section).
11. Confirm `/.claude-plugin/marketplace.json` (repo root) is valid JSON with `name`, `owner.name`
    and one `plugins` entry whose `source` is `"./plugin"`; `claude plugin validate ./plugin`
    should pass. `/plugin marketplace add crywolfe/claude-code-design` then
    `/plugin install claude-code-design@claude-code-design` is the documented end-user install
    path — an auditor should run both against a scratch project to confirm it actually works, not
    just that the JSON parses.

---

## 6. Work plan

1. **DONE (2026-09-15, commit `dd641c0`).** Applied and tested the hardening patch on the
   workspace itself, from the user's own shell (see `artifacts/hardening-patch/README.md`).
   `.claude/hooks/test-guard.sh` now passes 389 cases, 0 failed. This step was about the
   *workspace's* own `.claude/hooks/`, which the plugin build below did not touch and does
   not substitute for.
2. **DONE, additively.** Restructured into a plugin layout at `plugin/` — `skills/`,
   `commands/`, `hooks/` with `hooks/hooks.json`, `.claude-plugin/plugin.json` — built as a
   *new, separate* package (not an in-place move of `.claude/skills` etc.), so the workspace
   at `.claude/` is untouched and still works exactly as before. Hook scripts are referenced
   as `"${CLAUDE_PLUGIN_ROOT}"/hooks/…`; `guard-bash.sh`'s `node` allowlist was rewritten to
   `"${CLAUDE_PLUGIN_ROOT}"/scripts/…` (its `python3` rule needed no change — python3 is only
   used for the local preview server, which never touches `scripts/` or `starters/`), with
   self-test cases added in `plugin/hooks/test-guard.sh`. The plugin's `guard-bash.sh` and
   `test-guard.sh` were built from the hardening-patch versions, not from step 1's
   (still-unapplied) target — see the provenance note near the top of this document.
3. **Partially done, one design change from the original plan.** `plugin/managed-settings.reference.json`
   is written. `/doctor` (`plugin/skills/doctor/SKILL.md`, new Phase 0) checks for a
   managed-settings file and **warns** when it is missing — it does **not** "refuse to
   proceed on mismatch" as this plan originally said. That was a deliberate change made while
   implementing Phase 0: `/doctor` is a diagnostic skill with no enforcement mechanism of its
   own (it cannot stop other skills from running), so a hard refuse-to-proceed there would be
   theater, not a control — the actual enforcement is, and remains, the PreToolUse hooks plus
   whatever managed settings an admin deploys underneath them.
4. **Done.** `plugin/skills/publish/SKILL.md` gained a Phase 0 that checks for the `Artifact`
   tool and stops with a message pointing to `/export-standalone` if it is unavailable.
   `plugin/skills/sync-design-system/SKILL.md` already had an equivalent `DesignSync`
   availability check in its existing Phase 0 and needed no change.
5. **NOT DONE.** Vendoring or mirroring `chrome-devtools-mcp@1.9.0` is unchanged from the
   workspace's own posture; the plugin's `.mcp.json` pins the same version the workspace does,
   nothing more.
6. **NOT DONE.** No Foundry deployment or Bedrock inference profile is available in this
   environment to test against.
7. **DONE, by self-hosting.** No cloud credentials or third-party marketplace account were ever
   actually required — a plugin marketplace is just a `.claude-plugin/marketplace.json` file in a
   git repo. This repo now carries one at its root, with a single entry (`source: "./plugin"`)
   pointing at the `plugin/` directory in the same repo, so the standard `/plugin marketplace add`
   / `/plugin install` flow works against this repo directly:
   ```
   /plugin marketplace add crywolfe/claude-code-design
   /plugin install claude-code-design@claude-code-design
   ```
   `plugin/marketplace-entry.example.json` remains as a reference for the *different* case of the
   plugin's source living in its own separate repo (which needs the `git-subdir` source form
   instead of a relative path). Submitting to Anthropic's community marketplace, or any
   third-party marketplace listing, is still not done and not attempted.

---

## Documentation checked (2026-09-08, second pass 2026-09-11, `/design` check 2026-09-12)

- https://code.claude.com/docs/en/artifacts.md (`/design` canvas; provider and login requirements)
- https://code.claude.com/docs/en/commands.md (`/design` unavailable on Bedrock, Vertex AI, Foundry, Claude Platform on AWS)
- https://code.claude.com/docs/en/plugins.md
- https://code.claude.com/docs/en/plugins-reference.md (`${CLAUDE_PLUGIN_ROOT}`)
- https://code.claude.com/docs/en/plugin-marketplaces.md (`version`, `ref`, `sha` pinning)
- https://code.claude.com/docs/en/discover-plugins.md (managed scope)
- https://code.claude.com/docs/en/admin-setup.md (Windows managed-settings path)
- https://code.claude.com/docs/en/settings-reference.md (`permissions.disableBypassPermissionsMode`)
- https://code.claude.com/docs/en/permission-modes.md (bypass-mode behaviour of deny rules and hook denies; not yet confirmed on the page)
- https://code.claude.com/docs/en/microsoft-foundry.md
- https://code.claude.com/docs/en/amazon-bedrock.md
- https://code.claude.com/docs/en/google-vertex-ai.md
- https://code.claude.com/docs/en/third-party-integrations.md
- https://code.claude.com/docs/en/feature-availability.md
- https://code.claude.com/docs/en/managed-settings.md
- https://code.claude.com/docs/en/hooks.md (full PreToolUse schema and exit codes not re-checked)
