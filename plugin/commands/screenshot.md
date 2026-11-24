---
description: Screenshot current preview; optionally run JS between captures
argument-hint: <output.png> [--step "js1" --step "js2" ...]
allowed-tools: mcp__chrome-devtools__take_screenshot
---

Capture screenshots of whatever Chrome DevTools MCP has open. Supports multi-step capture with JS between frames.

## Argument parsing

`$ARGUMENTS` format: first positional = output path, then `--step "<js>"` pairs.

- No `--step`: one screenshot → save to `$0`
- One or more `--step`: save as `<basename>-01.png`, `<basename>-02.png`, … — run each JS expression via `mcp__chrome-devtools__evaluate_script` before the corresponding capture

## Steps

1. Parse `$ARGUMENTS` — split output path from steps
2. For each capture:
   - If `--step` provided: `mcp__chrome-devtools__evaluate_script({function: <js>})`
   - Small settle delay (~200ms)
   - `mcp__chrome-devtools__take_screenshot` with format png
   - Save to disk at the computed path
3. Report list of saved paths
