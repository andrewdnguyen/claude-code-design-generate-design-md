---
name: ingest-screenshot
description: Analyze an uploaded image (screenshot of a design, website, app) and extract design tokens to use as a starting point. Use when user pastes or attaches an image and says "recreate this", "match this image", "use this style".
argument-hint: <image-path>
allowed-tools: Read Write Bash(mkdir -p artifacts:*) Bash(realpath:*) Bash(file:*)
disallowed-tools: WebFetch WebSearch Artifact ArtifactComments ArtifactData DesignSync Agent
---

# Ingest Screenshot

Extract design tokens from a static image using Claude's vision. Honest caveats: exact hex codes are approximate without source files. Claude recreates UIs more reliably from code than from screenshots.

## Steps

1. **Resolve image path:** `$0`. `Bash(file <path>)` to confirm it's an image (png/jpg/webp/heic).

2. **Read via multimodal `Read`:** this loads the image for vision. Claude can see it.

3. **Analyze systematically.** From the image, identify:
   - **Dominant colors** — pick 5-8 swatches with hex approximations. Flag uncertain ones ("looks like #2A4B6D but vision hex is approximate").
   - **Typography** — font family (match to common families: Inter-like, serif-like, display, mono), sizes (relative), weights (light/regular/medium/bold), line-height impression
   - **Spacing rhythm** — estimate base unit (4/6/8px) from gaps + padding
   - **Radii** — sharp / small / medium / pill
   - **Component patterns** — what types of elements appear (buttons, cards, navigation, inputs)
   - **Aesthetic register** — minimal / dense / decorative / playful / corporate / brutalist

4. **Write output:**
   ```
   artifacts/ingested/screenshot-<timestamp>-tokens.json
   ```
   Same schema as `ingest-github` + `"source": { "image": "<path>", "ingested_at": "..." }` + `"confidence": "low|medium|high"` per category.

5. **Preview confidence:** for each uncertain value, add a `"confidence"` field (`low` | `medium` | `high`). Vision-derived hex codes should be `low` or `medium`.

6. **Offer next step:**
   - "Extracted tokens saved. Colors are approximate — do you have the source file (CSS, design system, brand guide) to cross-check?"
   - Follow-up: `/create-design-system` or start `/make-deck` / `/interactive-prototype` using these as starting point.

## Limitations — tell the user

- Vision returns approximate hex, not exact. For production accuracy, provide source files.
- Multiple overlapping colors → Claude picks representative samples, not all variations
- Typography recognition is fuzzy — "looks like Inter" ≠ "is Inter"
- Pixel dimensions require the image's actual resolution to be readable

## Workflow integration

After ingest, always offer to pair with a real source (Figma, codebase) to lock in exact values — the screenshot gives a *starting direction*, not ground truth.
