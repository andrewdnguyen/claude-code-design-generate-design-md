---
name: export-pptx
description: Export an HTML deck to PPTX via per-slide screenshots. Requires Node + pptxgenjs + puppeteer (run /doctor first).
argument-hint: <deck.html> [output.pptx]
allowed-tools: Read Write Bash(node "${CLAUDE_PLUGIN_ROOT}"/scripts/export-pptx.mjs:*) Bash(node --version) Bash(realpath:*) Bash(mkdir -p artifacts:*) Bash(which:*) Bash(test:*) Bash(stat:*) Bash(ls:*)
---

# Export PPTX

Screenshot-based PPTX export — each `<section>` inside `<deck-stage>` becomes one slide (1920×1080 image + optional speaker notes).

## Preflight

1. `Bash(node --version)` — if it fails, tell user to install Node 20+ (`which node` is blocked by the guard)
2. `Bash(ls -d node_modules/pptxgenjs)` and `Bash(ls -d node_modules/puppeteer)` — if either prints `No such file or directory`, tell the user to run `npm install -D pptxgenjs@4.0.1 puppeteer@24.41.0` in a separate shell (or `/doctor`), and stop. Never run `npm` from this skill. Do not use `test -d`: it prints nothing on failure and the exit code is not visible in the tool result, so a missing install reads as a pass.

## Steps

1. Resolve paths:
   - `$0` = deck HTML (required)
   - `$1` = output (default: basename + `.pptx`)

2. Run the export script:
   ```
   Bash(node "${CLAUDE_PLUGIN_ROOT}"/scripts/export-pptx.mjs "<input>" "<output>")
   ```

3. Report size + path.

## Script dependencies

`"${CLAUDE_PLUGIN_ROOT}"/scripts/export-pptx.mjs` is versioned as part of this plugin. If it is missing or the plugin install is corrupt, reinstall the plugin — do not rewrite it, and never run `node` with anything other than that script. The script launches Chromium without `--no-sandbox` and blocks every outbound request except the artifact's own directory over `file://`, `data:`, `blob:`, `https://unpkg.com/` and Google Fonts. A deck that loads `../starters/deck_stage.js` instead of a copy beside the HTML exports with the stage script blocked; `make-deck` copies the starter next to the deck for this reason.

## What the script does

- Launches headless Chromium (puppeteer)
- Loads the deck HTML at 1920×1080
- Reads `<deck-stage>.totalSlides`
- For each slide: `goToSlide(i)`, set `noscale`, `page.screenshot` at clip 0,0,1920,1080
- Reads `#speaker-notes` JSON (if present) and attaches per-slide notes
- Builds `.pptx` with `pptxgenjs` (16:9 layout, one PNG-background slide each)

## Notes

- Images can be large — 5 MB per slide at 1920×1080 is normal
- For smaller files, pass `--jpeg 0.8` to the script (compress to JPEG at 80% quality)
- Not editable in PowerPoint — each slide is a raster image. For native-editable export, skill not supported in v3.
