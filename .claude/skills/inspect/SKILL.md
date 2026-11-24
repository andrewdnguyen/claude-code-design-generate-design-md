---
name: inspect
description: Resolve a natural-language element description ("the red button in the hero", "the third card from the top") to a concrete DOM element in the current preview + source-code location. Uses Chrome DevTools MCP take_snapshot UIDs for deterministic targeting. Use when user asks to change/style/remove a specific visual element without pointing at source code.
argument-hint: <natural-language description>
allowed-tools: Read Grep Glob mcp__chrome-devtools__take_snapshot mcp__chrome-devtools__take_screenshot
---

# Inspect

Replaces Claude Design's `<mentioned-element>` inline-comment protocol with a terminal-native alternative: user describes an element in English, Claude resolves to a specific DOM node + source location for surgical edits.

## Prerequisites

- Chrome DevTools MCP has a page loaded (via `/preview` or `/done`)
- `.claude/last-snapshot.txt` exists (produced by `/done`) — or we snapshot fresh

## Pipeline

1. **Get snapshot:**
   - Prefer `Read .claude/last-snapshot.txt` if recent (< 5 min, same URL)
   - Otherwise `mcp__chrome-devtools__take_snapshot` to get fresh tree

2. **Match the description** against snapshot nodes. Use vision + text heuristics:
   - Role/tag match ("button" → role=button, tag=button)
   - Text content match ("the CTA that says 'Get started'")
   - Positional hints ("hero", "top", "third from left", "right sidebar")
   - Color hints ("the red button") — if ambiguous, take screenshot and visually match
   - Size hints ("the big heading")
   - Hierarchy ("inside the first card")

3. **Pick the best UID**. If multiple candidates, show the top 3 to the user with a one-line summary each:
   ```
   Candidates for "red button in hero":
     [uid=3_12] <button> "Get started" — background #d83
     [uid=3_28] <a class="btn"> "Try free" — background #c55
     [uid=3_07] <div role=button> "Sign up" — background #d80
   Which one (or describe differently)?
   ```

4. **Resolve to source location.** Once UID is confirmed:
   - `mcp__chrome-devtools__evaluate_script` — select by UID and return useful identifiers:
     ```js
     // (Pass the picked uid as an arg to the evaluate function)
     (el) => ({
       tag: el.tagName.toLowerCase(),
       id: el.id || null,
       classList: Array.from(el.classList),
       textContent: el.textContent.trim().slice(0, 80),
       dataAttrs: Object.fromEntries(
         Array.from(el.attributes)
           .filter(a => a.name.startsWith('data-'))
           .map(a => [a.name, a.value])
       ),
       outerHTML: el.outerHTML.slice(0, 300),
     })
     ```
   - With these signals, `Grep` the source HTML (current `artifacts/<name>.html`) for the matching element — preferring `id` > `data-*` > unique class combination > text snippet > outerHTML substring.
   - Return: source file path + approximate line number.

5. **Report:**
   ```
   Element: <button> "Get started" (uid 3_12)
   Source: artifacts/landing.html:142-148
   Selector: #cta-primary
   ```

6. **Optional next step:** if user requested an edit alongside inspection ("make it bigger") — perform the `Edit` directly with the located line range. Otherwise just report and wait.

## Heuristic priorities for "the red button" style references

When user phrase maps to multiple candidates:
1. **Explicit labels win** — if `<button aria-label="Subscribe">` and user says "the subscribe button", pick that regardless of visual cues
2. **Visible-first** — prefer elements currently in viewport over below-fold
3. **Unique before common** — a unique hero button beats the third of eight grid buttons
4. **Large before small** — for "the big title" prefer larger font-size
5. **Top-first for ambiguous position** — "the button" → closest to top-of-page in reading order

## When to fall back to asking

If >3 candidates and vision can't disambiguate — ask the user: "you mean X, Y, or Z?"

## Limits

- Only resolves elements that rendered successfully (not in-error components)
- React components with generated class names (CSS modules): selector might not round-trip — use outerHTML substring for source grep
- Elements inside shadow DOM are visible to `take_snapshot` but Grep on source HTML won't find them — warn the user if this path fails
