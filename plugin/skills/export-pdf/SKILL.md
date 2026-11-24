---
name: export-pdf
description: Export an HTML artifact to PDF via headless Chromium (puppeteer Page.pdf). For multi-slide decks one page per <section>.
argument-hint: <html-path> [output.pdf]
allowed-tools: Read Write Bash(node "${CLAUDE_PLUGIN_ROOT}"/scripts/export-pdf.mjs:*) Bash(node --version) Bash(realpath:*) Bash(mkdir -p artifacts:*) Bash(which:*) Bash(test:*) Bash(stat:*) Bash(ls:*)
---

# Export PDF

Produce a PDF from an HTML artifact. Uses puppeteer's `Page.pdf()` which is lossless vector when the source is HTML/CSS/SVG.

**Why puppeteer instead of Chrome DevTools MCP:** the MCP does not expose `Page.printToPDF` directly (only `take_screenshot`, `list_console_messages`, `evaluate_script`, etc.). Using puppeteer via a Node script is deterministic and matches `/export-pptx`.

## Preflight

1. `Bash(node --version)` — required (`which node` is blocked by the guard)
2. `Bash(ls -d node_modules/puppeteer)` — if it prints `No such file or directory`, tell the user to run `npm install -D puppeteer@24.41.0` in a separate shell (or `/doctor` for the full list), and stop. Do not use `test -d` here: it prints nothing on failure and the exit code is not visible in the tool result, so a missing install reads as a pass and the script then dies on `import puppeteer` with a bare Node stack trace

## Steps

1. Resolve paths:
   - `$0` = input HTML (required)
   - `$1` = output (default: input with `.pdf` extension)
   - If the output directory does not exist: `Bash(mkdir -p <output-dir>)` with the literal directory (no command substitution — the bash guard rejects `$(...)`)

2. Run export script:
   ```
   Bash(node "${CLAUDE_PLUGIN_ROOT}"/scripts/export-pdf.mjs "<input>" "<output>")
   ```
   (The script is versioned at `"${CLAUDE_PLUGIN_ROOT}"/scripts/export-pdf.mjs` as part of this plugin. If it is missing or the plugin install is corrupt, reinstall the plugin — do not rewrite it, and never run `node` with anything other than that script.)

3. Report size + path.

## Script behaviour ("${CLAUDE_PLUGIN_ROOT}"/scripts/export-pdf.mjs)

- Launches headless Chromium without `--no-sandbox` (only added when `CI` is set)
- Blocks every outbound request except the artifact's own directory over `file://`, `data:`, `blob:`, `https://unpkg.com/` and Google Fonts. A deck that loads `../starters/deck_stage.js` instead of a copy beside the HTML therefore exports with the stage script blocked: the sections never become slides and the PDF is one page of stacked content. `test/smoke-deck.html` is such a file and is not an export target; real decks get the starter copied next to them by `make-deck`; DNS for every other host is disabled (`--host-resolver-rules`, which also covers WebSockets) and popups are closed — an artifact cannot phone home during export. A copy from `artifacts/publish/` (rewritten to jsdelivr) will not export; export the source artifact instead
- Decks render one `<section>` per page at natural size; other pages default to A4

## Notes

- For decks: deck_stage.js must have `@media print { @page { size: ... } section { page-break-after: always } }` in the global `<style>` it injects — already present.
- For general pages: defaults to A4. To override, user can pass inline CSS `@page { size: letter }` or similar.
- `networkidle0` waits for all network activity to stop — if artifact uses lazy images, bump timeout to 15000ms.
