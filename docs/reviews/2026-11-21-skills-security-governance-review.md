# Security & governance review: claude-code-design agent skills

**Date:** 2026-11-21 · **Revision reviewed:** `a4e9912` on `claude-design-features` (clean tree)
**Reviewer:** Claude (Opus 5.5), static review. Nothing was executed against the guards except the session's own ordinary tool calls.

## 0. Scope, method, and caveats

The review brief said the skills would be provided, but none were attached, so this review covers the skill set in this repository:

- `.claude/skills/*` (29 skills), `.claude/commands/*` (4 commands), `.claude/hooks/*` (bash guard, browser guard, 389-case self-test), `.claude/settings.json`, `.mcp.json`, `scripts/*.mjs`
- `plugin/` (the marketplace distribution, v0.2.0): its 29 skills (adds `generate-design-md`, omits `ship-branch`), hooks, `managed-settings.reference.json`, evals
- The existing threat-model material in `docs/architecture/security-architecture.html` and `trust-map.html` (findings G-01…G-10, residuals R-01…R-06)

**Evidence labels used below**
- **[src]**: confirmed by reading the source in this repo. Not exercised live.
- **[docs]**: from the current Claude Code docs (skills, hooks, permissions, sub-agents, plugin manifest pages on code.claude.com). A subagent fetched these this session, and the quotes are reproduced from its report.
- **[env]**: true of the environment this review ran in, not of the repo.
- **[unverified]**: plausible from reading, not confirmed.

**Framework citations.** NIST AI RMF 1.0 (AI 100-1) subcategory IDs, SP 800-218 SSDF practice IDs, SP 800-53 Rev. 5 control IDs, CSF 2.0 categories, ISO/IEC 42001 clauses and Annex A controls, ISO/IEC 23894 clauses, and ISO/IEC 27001:2022 Annex A controls are cited by ID. The following are cited **by topic only**, because exact clause numbers could not be verified this session: NIST AI 600-1 (cited by its 12 risk-area names), SP 800-218A's AI-specific additions, ISO/IEC 27090, NIST's COSAiS control overlays (draft; "COSIS" in the brief appears to be a typo for this), and the NIST Cyber AI Profile.

**Not applicable.** These skills neither train, fine-tune, nor host models, so the weight-integrity, training-data protection and membership-inference items in 800-218A and 27090 do not apply. The "data" in scope is design context that is ingested and later re-emitted: repositories, Figma, Office files, screenshots, and comments.

---

## 1. Summary for the whole set

**Overall assessment: Critical gaps.** Two enforcement bypasses were confirmed from source. The design baseline underneath them is unusually strong.

**What is genuinely good**
- **Fail-closed, allowlist-first Bash guard with an adversarial self-test.** `bash .claude/hooks/test-guard.sh` was run this session: **389 cases, 0 failed**. Several cases come from prior red-team findings (G-01…G-10). This maps well to SSDF PW.7/PW.8, 800-53 CM-7 and SI-10, and 27001 A.8.29.
- **Human-in-the-loop gates before every ingest.** Phase 0 asks "Ingest X? (yes/no)". There are also confirm-before-clone and confirm-before-read steps, a plan-then-approve flow for remote writes, and a "never publish unasked" rule. These support AI RMF MAP 3.5 and GOVERN 3.2.
- **A consistent untrusted-content rule.** Repos, Figma, documents, comments and remote files are all treated as data. This is the right stance for AI 600-1 *Information Security* (prompt injection).
- **Export isolation.** The Chromium sandbox is kept, a `--host-resolver-rules` DNS deny-all is combined with request interception, and the export scripts are version-pinned and write-protected. This covers SC-7, SC-39 and SSDF PO.5.
- **Pinned dependencies with SRI.** React and Babel are pinned with SRI hashes, there is a lockfile, and `chrome-devtools-mcp` is pinned and runs `--isolated` with a throwaway profile. This covers SR-3 and SSDF PW.4.
- **An existing trust map and findings register with residual risks recorded.** This supports ISO 23894 §6.7, 42001 §6.1 and A.6.2.7, and AI RMF MANAGE 1.4.

**Core problem.** Policy lives mostly in prose: CLAUDE.md and the SKILL.md files. Mechanical enforcement covers only two tool families, Bash and three Chrome DevTools tools. Even inside those, the guard has bypasses, and the files that define policy can be written by the agent it governs. This conflicts with the core agentic-security principle of separating policy and enforcement from model reasoning (COSAiS agent overlays; 800-53 AC-3, AC-6 and CM-5). It also over-relies on model guardrails, which the existing register itself accepts as R-03.

### Cross-cutting findings

| ID | Finding | Evidence | Framework mapping | Priority |
|---|---|---|---|---|
| **X-01** | **The Bash guard can be bypassed by "reader" commands that write or execute.** `fd` is in READ mode, and the `find -exec` rule does not match `fd -x`, `-X`, `--exec` or `--exec-batch`. So `fd … -x cp <src> {}` runs a `cp` that never passes the cp rules, and that `cp` can overwrite the hook with content staged in `artifacts/`, which the Write tool can write. **The same lines are unchanged in `plugin/hooks/guard-bash.sh`, so marketplace installs are exposed too.** Other forms that write files pass READ-mode `path_ok`, which skips `-`-prefixed tokens and allows any relative path: `sort -o <file>`, `uniq <in> <out>`, `tree -o <file>`, and `git diff`/`git log --output=<file>`. The project's own permission rules do not stop these, because Bash rules "aren't a security boundary" [docs]. The remaining layer is the user's permission prompt or the auto-mode classifier. | [src] `guard-bash.sh` L163–164, L307–318 | 800-53 AC-6, CM-5, CM-7, SI-10; SSDF PW.7/PW.8; 27001 A.8.2, A.8.9 | **High** |
| **X-02** | **The agent can write its own policy and skills.** Edit/Write deny rules and `path_ok` protect only `.claude/hooks`, `.claude/settings*`, `.mcp.json`, `scripts/` and `.git`. They do not protect `CLAUDE.md`, `.claude/skills/**`, `.claude/commands/**`, `starters/**`, `plugin/hooks/**`, `plugin/scripts/**` or `plugin/skills/**`. A hijacked session could edit a skill or its `allowed-tools` grant, or edit the **shipped** plugin guard, and `ship-branch` (S-01) then pushes and merges the change. That makes this a supply-chain path to every marketplace user. | [src] settings.json, `path_ok` L135–138 | 800-53 CM-5, SI-7, SA-10; SSDF PS.1, PS.2; CSF GV.SC; 42001 A.6.2 (lifecycle change control); AI 600-1 *Value Chain & Component Integration* | **High** |
| **X-03** | **Enforcement does not cover most tools.** Hooks match only `Bash` and `chrome-devtools` `navigate_page`, `new_page` and `evaluate_script`. Ungated: **WebFetch/WebSearch** (an egress channel, and an ingest path that skips the Phase 0 gate); Chrome DevTools `take_screenshot`, `take_snapshot`, `take_heapsnapshot` and `performance_stop_trace` with `filePath` (these write wherever the MCP process can); `upload_file`, `click` and `fill_form` (R-02); and `Artifact`, `ArtifactComments`, `ArtifactData` and `DesignSync` (outbound publishing). Typical developer setups also add user-level plugins and connectors that no hook here covers: shell-execution MCP tools, browser drivers that can use the real logged-in browser profile, and account connectors that send messages, share files or move money. The reviewing environment had examples of each, with auto mode on [env]. The "Browser scope" and "Untrusted content" rules in CLAUDE.md are therefore model-only on all of these paths. | [src] settings.json hooks; [env] | AI RMF MEASURE 2.7, MANAGE 2.4; 800-53 AC-4, SC-7, CM-7; COSAiS (tool-calling boundaries); CSF PR.AA, PR.PS | **High** |
| **X-04** | **Hooks fail open at the harness level.** Any hook exit other than 0 or 2 is "Non-blocking error … The action goes ahead" [docs]. `guard-bash.sh` fails closed internally through an ERR trap. It still fails open if the file is replaced (X-01, X-02), deleted or made non-executable, or if `python3` is missing for `guard-browser.py`. The fix is documented: set `"onFailure": "block"` on each hook [docs]. | [docs], [src] | 800-53 SI-17 (fail-safe), SC-24 (fail in known state); SSDF PW.9 | **High** |
| **X-05** | **Some permission rules are dead and give false assurance.** Per the docs, `Write(path)` deny rules match nothing, and file-tool writes are governed by `Edit(path)` [docs]. Every protected path also has an `Edit(...)` twin, so the effective protection holds, but 19 `Write(...)` lines do nothing. Separately, `Read(.env)` covers only the project root. `~/.git-credentials`, `~/.docker/config.json`, `~/.kube/config` and shell history files are not denied to the Read tool. The Bash guard does cover them. | [docs], [src] | 800-53 AC-3, CM-6; 27001 A.8.3 | Medium |
| **X-06** | **There is no tamper-evident audit trail.** Hooks log neither allows nor denies. Skill invocations, publishes, syncs, pushes and merges are not recorded with inputs or hashes. The only record is the session transcript, which is writable on the same machine. | [src] | 800-53 AU-2, AU-3, AU-9, AU-12; 42001 A.6.2.8 (event logs); 27001 A.8.15, A.8.16; CSF DE.CM; AI RMF MEASURE 2.4, MANAGE 4.1 | Medium |
| **X-07** | **The agent has no identity of its own, and its credentials are not attenuated.** It acts as the user everywhere: the user's `gh` token, long-lived Figma PAT, and claude.ai account (Artifact, DesignSync). Nothing is short-lived, scoped per task, or separately attributable. | [src] | 800-53 IA-2, IA-4, IA-5, IA-9, AC-6; COSAiS (distinct agent identities, zero standing privilege, short-lived authorization); CSF PR.AA | Medium |
| **X-08** | **Validation that must be deterministic is written as prose for the model.** Examples: apply-edits regex allowlists, apply-tweaks typed-schema checks, `[A-Za-z0-9_-]+` name checks, `data-dev-only` stripping, unpkg→jsdelivr rewriting, publish self-containment. None of it is implemented in code: `rg data-dev-only scripts/` finds nothing. Model compliance varies from run to run. | [src] | 800-53 SI-10; SSDF PW.5, PW.9; AI 600-1 *Confabulation*, *Information Integrity*; AI RMF MEASURE 2.5 (valid/reliable) | Medium |
| **X-09** | **The repo copy and the plugin copy have drifted.** 13 skills and `guard-bash.sh` differ between `.claude/` and `plugin/`. `ship-branch` is repo-only and `generate-design-md` is plugin-only. A plugin cannot ship `permissions.deny` [docs], so `managed-settings.reference.json` is advisory. Marketplace users get the hooks but not the deny list unless they apply it by hand. Plugin hooks under `~/.claude/plugins/…` are then protected against the Write tool only if that reference file is installed. | [src], [docs] | SSDF PS.2, PS.3 (release integrity and provenance); 800-53 CM-2, CM-3, SR-4, SR-11; 42001 A.10.3; CSF GV.SC | Medium |
| **X-10** | **The supply chain is pinned but not integrity-checked at runtime.** `.mcp.json` runs `npx -y chrome-devtools-mcp@1.9.0`. The version is pinned, but there is no integrity check, the package is fetched outside `package-lock.json`, and the `npx` deny rule covers only the Bash tool. `generate-design-md` requires `npx @google/design.md@0.4.0`, which the guard blocks (see S-21). monolith comes from an unpinned brew install. Puppeteer downloads Chromium at install time. No SBOM is produced for plugin releases. | [src] | SSDF PW.4, PS.3.2 (SBOM/provenance); 800-53 SR-3, SR-4, SR-11, CM-14; 27001 A.5.21; AI 600-1 *Value Chain & Component Integration* | Medium |
| **X-11** | **Model behaviour is barely measured.** The guard has strong tests (389 passing cases). The skills do not. The 5 eval cases cover `generate-design-md` and codebase token scanning, and one of them is a prompt-injection eval (good). The only committed result (2026-11-12) is **not a valid run**: it is `partial` with `auth_failed`, it executed 1 of the 5 cases against plugin v0.1.0, and the chrome-devtools mock was missing. It also commits a contributor's local OS username and employer folder path (27001 A.5.34, PII). There are no evals for ingest-github/figma/document/screenshot, publish, sync, ship-branch or apply-*. | [src] | AI RMF MEASURE 1.1, 2.7, 3.1; SSDF PW.8; 42001 A.6.2.4 (verification & validation); 23894 §6.6 | Medium |
| **X-12** | **Data minimisation and retention are not handled.** Raw Figma JSON, document outlines, screenshots and token files stay in `artifacts/ingested/` indefinitely. The agent cannot delete them, because `rm` is allowed only for `/tmp/cd-ingest-*`. `/serve` publishes all of `artifacts/`, including `ingested/`, on 127.0.0.1 using `python -m http.server`, which does not validate the Host header, so pages in the user's browser could read it through DNS rebinding [unverified]. `ingest-screenshot` records the absolute image path, which contains the OS username. | [src] | AI 600-1 *Data Privacy*; AI RMF MEASURE 2.10; 27001 A.5.12, A.8.10, A.8.12; 800-53 SI-12, PT-2 | Low–Med |
| **X-13** | **Governance metadata is missing.** Skills declare no owner, version, risk tier, review date or deprecation path. The plugin has no SECURITY.md or disclosure route. The two architecture pages disagree on fix status: `trust-map.html` says most fixes are "written, not applied", while `security-architecture.html` says "fixed". The current register has no entries for X-01 to X-04. | [src] | 42001 §5.3, A.3.2, A.6.2.7; AI RMF GOVERN 1.6 (inventory), 1.7 (decommissioning), 2.1 (roles); CSF GV.RR, ID.AM | Low–Med |
| **X-14** | **Skill `allowed-tools` is pre-approval, not scoping.** Per the docs, `allowed-tools` "does not restrict which tools are available: every tool remains callable" [docs]. It only removes the permission prompt for the listed tools during that turn. `security-architecture.html` nevertheless counts "per-skill tool scoping" as a control layer. Broad grants then *remove* human checkpoints: `Bash(mkdir -p:*)`, `Bash(test:*)`, `Bash(ls:*)`, `Bash(which:*)`, `Bash(cp artifacts/:*)` and `evaluate_script` in several skills. A skill without `allowed-tools`, such as ship-branch or generate-design-md, is the safer case, because every call still prompts. | [docs], [src] | 800-53 AC-6, CM-7; COSAiS (least / zero standing privilege); AI RMF MAP 3.5 (human oversight) | Medium |

---

## 2. Per-skill assessments

The high-risk skills get full entries. The rest are in the compact table in §2.3. Each row's mappings are in addition to the cross-cutting rows they cite.

### 2.1 Outward-facing and change-making skills

#### S-01 `ship-branch` (repo only): **Critical gaps** · Priority **High**
- **Strengths:** Pins `--repo` explicitly so pushes cannot silently target `upstream`. Uses a merge commit so SHAs are preserved. Leaves branch switching to the user.
- **Gaps**
  - The agent pushes, opens the PR and **merges its own PR** with no human approval step, no `gh pr checks` gate and no reviewer requirement. Mappings: 800-53 AC-5 (separation of duties), CM-3, CM-4; SSDF PS.1, PW.7; 42001 A.6.2.5; AI RMF GOVERN 2.1.
  - It has no `allowed-tools`, so every call still prompts in default mode, which is good (X-14). In auto mode, or with broad user allow rules, the push and merge run unprompted.
  - The guard allows every `gh pr …` and `gh issue …` subcommand against any `--repo`, with free-text bodies. That includes `merge --admin`, `comment`, `close` and `edit`, and makes these an outbound data channel to public repos. Mapping: AC-4.
  - Chained with X-02, this is the delivery mechanism for a poisoned skill or guard reaching the marketplace.
- **Recommendations**
  1. Insert a mandatory `AskUserQuestion` before `gh pr merge` that shows the diff stat and the protected-path changes.
  2. Require `gh pr checks` to pass, with CI running `test-guard.sh` and the evals.
  3. Change the guard to allow only `gh pr create|view|checks|merge` with `--repo crywolfe/claude-code-design`, and forbid `--admin`.
  4. Protect `claude-design-features` on GitHub: one human approval required, required status checks, and CODEOWNERS over `.claude/**`, `plugin/**`, `CLAUDE.md` and `scripts/**`.

#### S-02 `publish`: **Adequate** · Priority **High**
- **Strengths:** Pages are private by default. The file must be read before publishing. Runtime capabilities are explicitly off. Comments are treated as data. The skill never uses `force`. The source artifact is never modified.
- **Gaps**
  - **The tool contract is confabulated.** The skill calls `Artifact({action:"comments"|"resolve"|"watch"})`, but those are not Artifact actions in the current tool schema: comments live in the separate `ArtifactComments` tool, which the skill never mentions. It also passes the deprecated `favicon` where `icon` is expected, and asks for an emoji, contradicting the repo's own no-emoji rule. Mappings: AI 600-1 *Confabulation*; SSDF PW.8 (untested path).
  - Nothing scans for sensitive content before publishing. Emails, tokens, internal URLs, customer names and PII in decks go out unchecked. Mappings: 800-53 AC-22 (publicly accessible content), AC-21; 27001 A.5.12, A.8.12; AI 600-1 *Data Privacy*.
  - The inlining, rewriting and dev-only stripping are done by the model (X-08).
  - No record is kept of which bytes were published. Mappings: AU-3; 42001 A.6.2.8.
- **Recommendations**
  1. Fix the tool calls (`ArtifactComments` for list, reply, resolve and watch; `icon:` with a word, not an emoji).
  2. Add `scripts/prepare-publish.mjs` to the node allowlist. It should inline siblings, rewrite CDNs, strip `[data-dev-only]`, and run a secret and PII regex scan. Hits should block until the user confirms.
  3. Record the SHA-256, URL, label and timestamp in `design-assets.json`.

#### S-03 `sync-design-system`: **Strong** · Priority **Medium**
- **Strengths:** Plan, then approval, then write. Deletes are never in the default plan. It checks that the target is a design-system project before writing. Remote files are treated as data and a suspicious path is skipped. Folder names are validated. Uploads come from disk, which keeps large payloads out of context.
- **Gaps**
  - It pushes to an org-visible project with no classification step and no approval record. Mappings: 42001 A.10.2; 27001 A.5.14 (information transfer).
  - There is no per-file hash manifest of what was pushed. Mappings: AU-3; SR-4.
  - It acts under the user's identity (X-07).
  - Pushing a `locked` entry is allowed with only a notice.
- **Recommendations**
  1. Write `sync/manifest-<ts>.json` containing the path, SHA-256, planId and an "approved by user at" timestamp.
  2. Ask a one-line classification question ("internal / public brand assets?") before `finalize_plan`.

#### S-04 `ingest-github`: **Adequate** · Priority **Medium**
- **Strengths:** Confirms before cloning. Shallow clone into `/tmp`. Reads only files that match the token globs and never README, docs or `.md`. Caps reads at 20 files of 64 KB each. Treats content as data. Cleans up afterwards.
- **Gaps**
  - Provenance is recorded as URL and ref, but not the resolved commit SHA or per-file hashes. Mappings: 800-218A data-provenance additions (topic); 800-53 SR-4; 42001 A.7.5 (data provenance).
  - It uses the user's full `gh` credentials, so private repos can be read.
  - The ">500 MB" check is advisory only.
  - The injection defence is prose only (R-03).
  - The guard also allows `gh repo fork`, which no skill uses. Mapping: CM-7.
- **Recommendations**
  1. Record the commit SHA by reading the clone's `.git/HEAD` and the ref file. Record `shasum -a 256` of each file read.
  2. Use a read-only fine-grained token for clones.
  3. Remove `repo fork` from the guard.
  4. Add an eval with an instruction planted in `tailwind.config.js`.

#### S-05 `ingest-figma`: **Adequate** · Priority **Medium**
- **Strengths:** The token is never echoed, and the guard blocks echoing it. curl is locked to GET on `api.figma.com` with output confined to `artifacts/ingested/`. Text layers are treated as data.
- **Gaps**
  - The guard permits `-L` together with `-H "X-FIGMA-TOKEN: …"`. curl documents that `-H` headers are re-sent to redirect targets, including other hosts. Mappings: IA-5, SC-8.
  - `fileKey` and `nodeId` are not validated before they are put into the URL.
  - The PAT is long-lived and user-scoped. Mapping: IA-5.
  - Raw responses are kept with no way for the agent to delete them (X-12).
- **Recommendations**
  1. Make the guard reject `-L` when `-H` is present.
  2. Validate `fileKey` with `^[A-Za-z0-9]{10,}$` and `nodeId` with `^\d+[:-]\d+$`.
  3. Document using a `file_content:read`-scoped PAT with an expiry.
  4. Write a parsed-tokens-only output and offer the user deletion of the raw JSON.

#### S-06 `ingest-document`: **Strong** · Priority **Low**
- **Strengths:** Accepts only a path the user gave in this turn, and confirms first. Uses `unzip -l`/`-p` only, never extracting to disk. Caps output at 64 KB, which also bounds zip bombs through SIGPIPE. Never copies the source document. Treats content as data.
- **Gaps**
  - The outline stores document text that may be confidential, with no sensitivity label. Mappings: 27001 A.5.12, A.5.13.
  - The source is not hashed. Mappings: SR-4; 42001 A.7.5.
  - The guard does not check `unzip` paths, so any zip on disk can be read. That is by design, but it becomes an exfiltration feeder when combined with X-03. Mapping: AC-4.
- **Recommendations:** Record the source SHA-256. Add `sensitivity: internal` to the outline front matter. Add an injection eval using slide text.

#### S-07 `ingest-screenshot`: **Adequate** · Priority **Low–Med**
- **Strengths:** Gives honest confidence flags and limitations.
- **Gaps:** It has **no confirmation step**, unlike the other three ingest skills and contrary to CLAUDE.md Phase 0. It has no data-not-instructions line, although text inside an image is a visual prompt-injection vector (AI 600-1 *Information Security*). It records the absolute image path (X-12).
- **Recommendations:** Add a Step 0 confirmation and the untrusted-content line. Record only the basename and SHA-256.

#### S-08 `handoff`: **Adequate** · Priority **Low–Med**
- **Strengths:** Writes only under `handoff/` and never modifies the source. Has a no-secrets rule for the README. Lists "Design decisions & assumptions", which is real transparency (AI RMF MEASURE 2.8, MAP 3.5).
- **Gaps**
  - The `dependencies` block in `handoff.json` is a hard-coded example, not derived from the artifact, so it is a confabulation risk.
  - There is no SBOM or file-hash manifest. Mapping: SSDF PS.3.
  - Step 3 contradicts itself: it says to copy the source "as-is" with `cp`, then says `data-dev-only` tags are "removed from the copy".
- **Recommendations:** Derive the dependency list and integrity hashes from the `<script>` tags. Write `MANIFEST.sha256`. Strip dev-only tags with the X-08 script.

#### S-09 `export-pdf` / S-10 `export-pptx`: **Strong** · Priority **Low**
- **Strengths:** Chromium sandbox kept outside CI. DNS deny-all combined with a request allowlist. Pinned dependencies with a lockfile. Scripts are versioned and write-protected. The guard gives `node` exactly these scripts.
- **Gaps:** `unpkg.com` is allowed without SRI enforcement at the script level (the page's own SRI is the control). Mappings: SI-7, SR-11. Chromium is downloaded at install time. Mappings: SSDF PW.4; SR-3.
- **Recommendations:** Document `npm ci --ignore-scripts`, then a pinned browser install. Optionally reject unpkg requests whose script tag lacks `integrity`.

#### S-11 `export-standalone`: **Adequate** · Priority **Low**
- **Strengths:** monolith's `--isolate` CSP. Metadata stripping.
- **Gaps:** monolith is unpinned (X-10). The no-dev copy is made by the model (X-08).
- **Recommendations:** Pin and verify the monolith version in `/doctor`. Use the strip script.

### 2.2 Write-back and state skills

#### S-12 `apply-edits`: **Strong design, Adequate enforcement** · Priority **Low–Med**
- **Strengths:** All-or-nothing validation. Tight regex allowlists. Text edits only on leaf elements, with `&` escaped. The log stores the previous value of every change, which makes revert exact.
- **Gaps:** The validation is model-executed (X-08). The session lookup "most recent directory with prefix" can pick the wrong session.
- **Recommendations:** Add `scripts/validate-pending.mjs`, shared with apply-tweaks, that exits non-zero on any invalid entry. Log the HTML SHA-256 before and after.

#### S-13 `apply-tweaks`: **Adequate** · Priority **Medium**
- **Strengths:** Typed-schema validation. Strings cannot contain markup.
- **Gaps:** The applied log is "copy of pending.yaml": it **stores new values only, not previous ones**. Revert step 3 therefore has to guess the prior value from the current HTML. That is an integrity and reversibility gap, and it is inconsistent with apply-edits. Mappings: 800-53 CM-3, AU-3; AI RMF MANAGE 2.4. Validation is also model-executed (X-08).
- **Recommendations:** Log `{key, value, previous}` as apply-edits does, and use the shared validator.

#### S-14 `make-editable` / S-15 `make-tweakable` / S-16 `live-reload`: **Adequate** · Priority **Low–Med**
- **Strengths:** Dev-only tooling is tagged `data-dev-only`. Nothing touches the HTML until the user runs an `apply` command. Live reload no-ops off 127.0.0.1. Session state lives in files.
- **Gaps:** Stripping the dev-only scripts on publish, export and handoff relies on the model alone (X-08). If it misses one, the editor overlay ships in a published page. The overlay writes through a File System Access handle the user grants, which is fine.
- **Recommendations:** Have `verify-artifact` (or the prepare script) fail if a publish, standalone or handoff output contains `data-dev-only`, `editor_overlay.js` or `live_reload.js`.

#### S-17 `snapshot`: **Adequate** · Priority **Low**
- **Strengths:** Labels are validated. Restore takes a snapshot labelled `before-restore` first. Restore accepts a basename only.
- **Gaps:** No content hashes (SI-7). Versions are gitignored, so they have no backup off the machine (CP-9; 27001 A.8.13).
- **Recommendations:** Add a SHA-256 per version in `index.json`.

#### S-18 `register-asset`: **Adequate** · Priority **Low**
- **Strengths:** `make-assets-index.mjs` HTML-escapes every field it writes [src]. An `--auto` upsert never resets status.
- **Gaps:** The agent can set `status: approved` on its own work. Nothing records who approved it, so there is no separation of duties. Mappings: AC-5; 42001 A.6.2.5.
- **Recommendations:** Add `approved_by` and `approved_at`, and set `approved` only when the user's own message says so.

#### S-19 `use-design-system` / S-20 `create-design-system`: **Adequate** · Priority **Low–Med**
- **Strengths:** Names are validated, matches are confirmed before applying, and locked entries become a remix instead of an overwrite.
- **Gaps:**
  - The `locked` flag is advisory. Any Edit or `cp` can overwrite a locked entry, and `--unlock` needs no confirmation. Mapping: CM-5.
  - `create-design-system` Phase 1 reads an arbitrary local codebase and "a few component files" with no size cap and no data-not-instructions line. It does have that line for the GitHub source.
- **Recommendations:** Have a hook deny Edit and `cp` into `design-systems/<locked>/`. Confirm before unlocking. Add caps and the untrusted-content line to the local-codebase source.

#### S-21 `generate-design-md` (plugin only): **Weak** · Priority **Medium**
- **Strengths:** Path B treats scanned content as data and skips `.env*` and `node_modules`. It asks before overwriting `DESIGN.md`. An injection eval exists for it.
- **Gaps:**
  - It depends on `npx @google/design.md@0.4.0`, which the plugin guard blocks. The broken contract invites the model to look for workarounds, and when the user runs it themselves, the package is unverified. Mappings: SSDF PW.4; SR-3.
  - The "re-run until exit code 0" lint loop is unbounded.
  - It writes `DESIGN.md` to the project root, outside `artifacts/`.
  - Its committed eval result is an invalid partial run (X-11).
- **Recommendations:** Make the linter a devDependency with a lockfile, invoked through an allowlisted `node` script. Cap fix iterations at 3. Use `disallowed-tools` to remove tools it should never need, such as WebFetch and the Artifact tools (X-14). Re-run the evals with authentication and a chrome-devtools mock.

### 2.3 Lower-risk skills and commands (compact)

| Skill / command | Assessment | Strengths | Gaps → mapping | Recommendation | Priority |
|---|---|---|---|---|---|
| `make-deck`, `interactive-prototype`, `animated-video`, `wireframe`, `copy-example` | Adequate | Phase 0 asks before every ingest and never auto-applies a design system. SRI-pinned React. "Mock data inline; no external fetch." | "No made-up data/stats" is the confabulation control, and it is model-only (AI 600-1 *Confabulation*). `evaluate_script` is pre-approved in make-deck and interactive-prototype. | Add a verify-artifact lint for unsourced numerals in decks: list them for the user to confirm. | Low |
| `verify-artifact` | Strong (as measurement) | Programmatic overflow audit, design-token conformance walk, P0–P3 rubric | Silent on pass, so it leaves no record (AU-3, MEASURE 2.4). Screenshots are written via the unguarded `filePath` (X-03). | Write `.claude/verify-<ts>.json` with the results. | Low |
| `inspect` | Adequate | Read-only `evaluate_script`. Asks when there are more than 3 candidates. | The optional direct `Edit` happens without showing the diff first | Show the old and new text before the edit. | Low |
| `local-comments` | Strong | Read-only. Comments are data. Acts only on the user's pick. | None material | None | Low |
| `doctor` | Strong | Never installs anything. Prints pinned install commands. | Does not check that controls are in place (800-53 CA-7, SI-6; CSF DE.CM) | Add hook SHA-256 checks against a published list, confirm settings loaded, run `test-guard.sh`, and flag dangerous user-level MCP tools (X-03). | Low (high leverage) |
| `/done`, `/preview` | Adequate | URL scope enforced by the hook. Cache-bust. | Auto-registers silently. Writes screenshots and snapshots via the unguarded `filePath`. | Covered by X-03. | Low |
| `/screenshot` | Weak | None of note | Takes **arbitrary JS** from its arguments for `evaluate_script` (the denylist filter is best-effort, R-01) and an arbitrary output path for `take_screenshot` (unguarded). Mappings: SI-10, CM-7. | Restrict the output path to `.claude/` or `artifacts/` in a hook. Require the user to confirm step JS. | Medium |
| `/serve` | Adequate | Loopback only, rooted at `artifacts/`, with a pkill pattern | Serves `artifacts/ingested/`. No Host validation (DNS rebinding [unverified]). The guard's curl allows any 127.0.0.1 port, so the agent can make GET requests to other local services (SSRF-like). | Serve a dedicated `artifacts/public/` tree, or exclude `ingested/`. Pin curl to the `/serve` port. | Low–Med |

---

## 3. Places the skills allow unsafe or non-deterministic behaviour

1. **Disabling the guard silently (X-01 + X-04).** A hijacked session could overwrite `guard-bash.sh` using `fd -x cp`, `sort -o` or `git diff --output=`. On the next call the hook exits non-zero but not 2, and Claude Code lets the command through.
2. **Policy and skill poisoning that reaches the marketplace (X-02 + S-01).** The agent edits `plugin/hooks/guard-bash.sh` or a `SKILL.md`, then ship-branch pushes and self-merges it.
3. **Exfiltration around the Bash guard (X-03).** Ingested content tells the model to call WebFetch with data in the query string. Neither a hook nor a deny rule stops it.
4. **Incorrect tool use (S-02).** The publish comment loop calls Artifact actions that do not exist.
5. **Unbounded loops (S-21).** "Re-run until exit code 0" has no limit.
6. **Validation run by the model (X-08).** apply-*, publish, handoff and standalone depend on the model performing regex and transform steps correctly every time.

---

## 4. Prioritised action list

1. **Enable the Claude Code sandbox for Bash.** Restrict filesystem writes to `artifacts/`, `handoff/`, `design-systems/`, `assets/` and `/tmp/cd-ingest-*`, and restrict network to `api.figma.com`, `github.com`, `api.github.com`, `unpkg.com` and the Google Fonts hosts. This closes X-01 structurally: the permissions docs name sandboxing, not Bash rules, as the boundary. The sandbox configuration syntax and its coverage of MCP processes are **[unverified]**, because the sandboxing page was cited, not read. Then patch the guard anyway, for defence in depth:
   - Deny `fd -x|-X|--exec*`, `sort -o`, two-argument `uniq`, `tree -o` and `git --output`.
   - Run the protected-path check in READ mode too.
   - Add test cases for each.
2. **Set `"onFailure": "block"` on both hooks (X-04).** Add a SessionStart integrity check that compares the hooks' SHA-256 to a pinned list and blocks on mismatch.
3. **Protect policy as code (X-02).** Add `Edit(...)` deny rules and `path_ok` entries for `CLAUDE.md`, `.claude/skills/**`, `.claude/commands/**`, `starters/**` and `plugin/**`. Check on the installed Claude Code version that `Write(...)` deny rules really match nothing before deleting the 19 of them (X-05), and keep them until that is confirmed. Narrow the broad `allowed-tools` grants (X-14).
4. **Put a human gate on ship-branch (S-01).** Require confirmation plus CI checks before merge. Protect the branch with required review and CODEOWNERS on `.claude/**` and `plugin/**`. Narrow the guard's `gh` rule to the fork and to create, view, checks and merge, without `--admin`.
5. **Close the coverage gaps (X-03).** In project settings, deny `WebFetch` and `WebSearch` (or allowlist domains), deny shell-capable and browser-driving MCP tools from other plugins, and deny `mcp__claude_ai_*` connectors. Extend the browser hook to check `filePath` on every chrome-devtools tool. Better still, add a catch-all PreToolUse hook that default-denies tool names not on an allowlist. That is a policy decision point independent of the model, in line with the COSAiS agent overlays.
6. **Move deterministic checks into code (X-08).** Add `scripts/validate-pending.mjs` and `scripts/prepare-publish.mjs` (inline, CDN rewrite, dev-only strip, secret and PII scan) to the node allowlist, and make skills call them. Fix publish's tool contract (S-02) and apply-tweaks' missing previous values (S-13).
7. **Attenuate credentials (X-07).** Use a fine-grained GitHub token scoped to the fork, a scoped and expiring Figma PAT, and document both in `/doctor`. Strip `-L` when `-H` is present in the curl rule (S-05).
8. **Audit logging (X-06).** Have both hooks append JSONL decisions (timestamp, tool, input SHA-256, decision, rule) to a path the agent cannot write. Record the skill-set git SHA at session start. Record SHA-256 manifests for publish, sync and handoff.
9. **Single source and release integrity for the plugin (X-09, X-10).** Generate `plugin/` from `.claude/` with a CI drift check. Install `chrome-devtools-mcp` from the lockfile instead of `npx -y`. Produce an SBOM and signed tag per release. Ship a SECURITY.md, and make the managed settings a documented install step.
10. **Measure (X-11).** Add an injection eval for each ingest path (repo config, Figma text layer, PPTX slide, image text, page comment, remote design-system file), plus guard-bypass regression cases. Run them with `test-guard.sh` in CI as a merge gate. Add X-01 to X-04 to the trust-map register and reconcile its "written, not applied" status with security-architecture.html.
