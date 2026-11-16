# DRAFT: replacement text for the Accessibility section

Status: draft for review. Not yet wired into SKILL.md. When approved, replace the fixed Accessibility text in Step 2 of SKILL.md with the block below, and change "should be explicitly as follows" to "must include the following, and may add project-specific rules beneath it".

---

## Accessibility

Meet WCAG 2.0 Level AA as the minimum. The rules below are the baseline for every screen, component and document built from this design system.

**Structure and order**
- Use real semantic elements: `table` with header cells, `ol` and `ul` for lists, `h1` to `h6` for headings, `label` for inputs. Do not imitate tables, lists or headings with generic divs.
- Source order must match visual reading order. Do not use absolute positioning, grid placement or CSS ordering to change the meaning of the sequence.
- Every screen, page or slide has one h1. Heading levels never skip.
- Every page or view has a descriptive title, and the page language is set.

**Text alternatives**
- Provide text alternatives for informative imagery. This includes graphics built from CSS, SVG or divs.
- Diagrams, charts and flows need a text description of their structure and branches. Mark purely decorative elements, such as connectors and backdrops, as decorative.
- Do not use color, icons, hover or motion as the only means of conveying information or enabling an action.

**Contrast and legibility**
- Text must meet 4.5:1 contrast, or 3:1 for large text, on every surface it appears on. Check translucent overlays, tinted containers and any third-party or starter components, not only the components defined in this file.
- Keep typography legible and links meaningful, with link text that describes the destination.

**Resizing**
- Text must scale to 200% without loss of content or function. Avoid fixed heights and fixed-size canvases that scale as a whole. If a fixed-canvas format such as slides is unavoidable, provide a reflowing alternative.

**Keyboard, focus and announcements**
- Every function is operable by keyboard, with no keyboard traps.
- Keyboard focus is always visible. Use the focus style defined in this file.
- Every control has an accessible name and role. When the view or content changes, such as a route change, a slide change or a status update, announce it to assistive technology with focus management or a live region.

**Verification**
- The linter checks component token contrast only. Before shipping, review against the WCAG 2.0 AA checklist with a screen reader and an automated checker.

<!-- Project-specific rules go beneath this line, for example the component library's built-in accessibility behavior. -->

---
