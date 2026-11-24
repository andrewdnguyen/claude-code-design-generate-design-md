---
name: apply-tweaks
description: Apply buffered tweaks from pending.yaml to the source HTML file. Invoked when user says "save tweaks", "apply tweaks", "persist panel changes", or runs /apply-tweaks.
argument-hint: <html-path>
allowed-tools: Read Write Edit Bash(ls artifacts/:*) Bash(mkdir -p artifacts:*) Bash(date:*)
---

# Apply Tweaks

Persist queued tweak changes (in `pending.yaml`) back to the source HTML via `Edit`. Pattern from claude-pipe: **files are state, Claude is the writer**.

## Session lookup

`session-id` for `<html-path>` = `tweaks-{slugify(basename html-path without ext)}-{today YYYYMMDD}`.
Session dir: `artifacts/tweaks/<session-id>/`.

If skipping date match (e.g. resume from yesterday), `Bash(ls artifacts/tweaks/)` and find the most recent matching prefix.

## Pipeline

1. **Read session state:**
   ```
   Read artifacts/tweaks/<session-id>/state.yaml
   Read artifacts/tweaks/<session-id>/pending.yaml
   ```
   If `pending.yaml` is missing or empty — report "no pending tweaks" and stop.

2. **Read HTML + schema:**
   - `Read` the target HTML (path from state.yaml or `$0`)
   - Extract the `__tweak_schema` block (JSON inside `<script id="__tweak_schema">`)

3. **Validate with code (all or nothing):** if the tweaks came from pasted chat text, first `Write` them to `pending.yaml`. Then run:
   ```
   Bash(node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-pending.mjs tweaks artifacts/tweaks/<session-id>/pending.yaml --html <html-path>)
   ```
   - **Non-zero exit: stop.** Show the script's output (one line per invalid key) to the user. Do not apply a partial set and do not repair values yourself.
   - **Exit 0:** the JSON on stdout (`{key, type, value}` per entry) is the only thing you may apply. The script checks key names (`[A-Za-z0-9_-]+`), that each key exists in `__tweak_schema`, and the typed value rules (`color` = `#rrggbb`; `number` within `[min..max]`; `boolean`; `enum` one of `options`; `string` plain text ≤ `maxLength`, default 200, no `<`, `>` or newline).

4. **Apply:** before each `Edit`, read the **previous** value of that key from the HTML you already read (the `--tweak-<key>` value, the schema `"default"`, the attribute, or the element text, whichever the key type uses) and remember it as `previous`. Then for each validated key → value, by type:
   - `color` / `number` / `boolean` — **CSS var on `:root`:** find `--tweak-<key>: <old>;` and `Edit` to new value, **and** update `"default"` for that key in the `__tweak_schema` block. The panel re-applies every schema default on load as an inline style on `<html>`, so a stale default would silently override the CSS var you just edited (boolean: the class toggle also starts from the default)
   - `enum` — `Edit` the schema `"default"` and, if the root element carries `data-tweak-<key>="…"`, that attribute
   - `string` — `Edit` the text content of every element matching `target` (default `[data-tweak="<key>"]`) and the schema `"default"`
   - **Marker block fallback:** `<!-- tweak:<key> -->...<!-- /tweak:<key> -->` → `Edit` the content inside
   - If no pattern matches for a key → fail loudly (HTML didn't use `/make-tweakable` pattern)

5. **Atomic write via Edit:** each `Edit` is already atomic in Claude Code, so no tmp-rename dance needed.

6. **Append to log:**
   ```
   Bash(date -u +%Y%m%dT%H%M%SZ)   → use the printed value as <ts> (no shell substitution)
   Write artifacts/tweaks/<session-id>/applied/<ts>.yaml:
     applied_at: <ts>
     changes:
       - key: primaryColor
         value: "#0a5c36"
         previous: "#D97757"
       - key: dark
         value: true
         previous: false
   ```
   One entry per changed key, values as JSON scalars. `previous` is always the value read from the HTML before the edit, never a guess.

7. **Clear pending:** `Write artifacts/tweaks/<session-id>/pending.yaml` with empty content (or `{}`)

8. **Update state:**
   ```
   Edit artifacts/tweaks/<session-id>/state.yaml:
     phase: idle → idle (no-op but bump timestamp)
     last_applied_at: <ts>
   ```

9. **Verify:** `/done <html-path>` — confirms file still renders, new values visible in preview.

10. **Report:** "Applied N tweaks. Logged to `artifacts/tweaks/<session-id>/applied/<ts>.yaml`. Pending cleared."

## Revert path

If user says "revert last tweaks":
1. `Bash(ls artifacts/tweaks/<session-id>/applied/)` — the filenames are `YYYYMMDDTHHMMSSZ.yaml`, so the last one in name order is the most recent
2. `Read` that file — get the delta (`{key, value, previous}` per change)
3. Build a pending set with every key's value set to its logged `previous`, `Write` it to `pending.yaml` (format: `key: <JSON value>` per line), and run `Bash(node "${CLAUDE_PLUGIN_ROOT}"/scripts/validate-pending.mjs tweaks artifacts/tweaks/<session-id>/pending.yaml --html <html-path>)`; stop on a non-zero exit. Then apply the validated set exactly as in Pipeline step 4. If a log entry has no `previous` (older log), stop and tell the user — do not guess a value.
4. Append a new applied entry with `type: revert` and reference to reverted file
5. `/done`
