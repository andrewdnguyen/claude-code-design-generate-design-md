# WCAG 2.0 Level A + AA checklist for DESIGN.md

Read this before writing the Accessibility section and the Do's and Don'ts of a DESIGN.md. For each criterion that applies to the project, make sure the DESIGN.md contains a concrete, checkable rule that an agent can follow. Skip rows that cannot apply (for example, the audio and video rows when the project has no media), but never skip the rows marked **always**.

A DESIGN.md is guidance, not enforcement. The linter only checks contrast of component background/text token pairs. Everything else here must be verified by a review step (manual check, screen reader, automated checker).

## 1. Perceivable

| SC | Level | Rule to carry into DESIGN.md | How it is usually missed |
| :--- | :--- | :--- | :--- |
| 1.1.1 Non-text Content | A, **always** | Informative images, icons and graphics need text alternatives. This includes graphics built from CSS, SVG or divs. Diagrams, charts and flows need a text description of their structure and branches. Mark purely decorative elements (connectors, dividers, backdrops) as decorative. | A flowchart made of positioned divs and arrows has no text equivalent, because the rule only mentioned "imagery". |
| 1.2.1–1.2.5 Time-based media | A/AA | Prerecorded and live audio and video need captions, transcripts or audio description as applicable. | Only applies if the project has media. |
| 1.3.1 Info and Relationships | A, **always** | Use real semantic elements: `table` with header cells, `ol`/`ul`/`li`, `h1`–`h6`, `label` tied to inputs, landmarks. Do not imitate tables, lists or headings with generic divs. | Comparison tables and step lists built from divs. |
| 1.3.2 Meaningful Sequence | A, **always** | Source order must match the visual reading order. Do not use absolute positioning, grid order or CSS to reorder content in a way that changes meaning. | Boxes grouped by row in the markup, so a screen reader reads steps out of order. |
| 1.3.3 Sensory Characteristics | A | Instructions must not rely only on shape, size, position or sound ("the arrow on the right"). | |
| 1.4.1 Use of Color | A, **always** | Color is never the only way to convey information. Pair status colors with text, icons or patterns. | |
| 1.4.2 Audio Control | A | Audio that plays automatically for more than 3 seconds needs pause or volume control. | |
| 1.4.3 Contrast (Minimum) | AA, **always** | 4.5:1 for normal text, 3:1 for large text (at least 18pt, or 14pt bold). Check every surface text appears on, including translucent overlays, tinted containers, text on images, and third-party or starter widgets. | A starter-provided slide counter had translucent text on a translucent background, about 2:1 on a white slide. |
| 1.4.4 Resize text | AA, **always** | Text must scale to 200% without loss of content or function. Avoid fixed heights and fixed-size canvases that scale as a whole. If a fixed-canvas format such as slides is used, provide a reflowing alternative. | A scale-to-fit slide canvas does not enlarge text when the user zooms. |
| 1.4.5 Images of Text | AA | Use real text, not images of text, unless it is a logo or essential. | |

## 2. Operable

| SC | Level | Rule to carry into DESIGN.md | How it is usually missed |
| :--- | :--- | :--- | :--- |
| 2.1.1 Keyboard | A, **always** | Every function is operable by keyboard. Use native controls where possible. | |
| 2.1.2 No Keyboard Trap | A | Focus can always be moved away from any component with the keyboard. | |
| 2.2.1 Timing Adjustable | A | Time limits can be turned off, adjusted or extended. | |
| 2.2.2 Pause, Stop, Hide | A | Moving, blinking or auto-updating content lasting over 5 seconds can be paused, stopped or hidden. | |
| 2.3.1 Three Flashes | A | Nothing flashes more than three times per second. | |
| 2.4.1 Bypass Blocks | A | Provide a way to skip repeated blocks, such as a skip link. | |
| 2.4.2 Page Titled | A, **always** | Every page or view has a descriptive title. | |
| 2.4.3 Focus Order | A | Focus order follows a meaningful sequence. When the view changes, move focus or announce the change. | Slide changes were not announced. |
| 2.4.4 Link Purpose | A | Link text describes its destination. Do not use bare "click here". Show URLs as real links where they are meant to be followed. | A cited source URL was plain text. |
| 2.4.5 Multiple Ways | AA | Offer more than one way to find a page in a multi-page product. | |
| 2.4.6 Headings and Labels | AA, **always** | Headings and labels are descriptive. Every page or view has one h1, and heading levels never skip (h1, h2, h3). | Title slide had no heading, and headings jumped from h1 to h3 and h4. |
| 2.4.7 Focus Visible | AA, **always** | Keyboard focus is always visible. Define the focus style (outline or shadow, color, thickness) as a token or rule. | |

## 3. Understandable

| SC | Level | Rule to carry into DESIGN.md | How it is usually missed |
| :--- | :--- | :--- | :--- |
| 3.1.1 Language of Page | A, **always** | Set the page language (`lang`). | |
| 3.1.2 Language of Parts | AA | Mark passages in another language. | |
| 3.2.1 On Focus / 3.2.2 On Input | A | Focusing or entering input never triggers an unexpected change of context. | |
| 3.2.3 Consistent Navigation | AA | Repeated navigation appears in the same order on every page. | |
| 3.2.4 Consistent Identification | AA | The same function has the same label and icon everywhere. | |
| 3.3.1 Error Identification | A | Errors are identified in text and the field in error is named. | |
| 3.3.2 Labels or Instructions | A | Every input has a visible label or instructions. | |
| 3.3.3 Error Suggestion | AA | Suggest a fix when an input error is detected and a fix is known. | |
| 3.3.4 Error Prevention | AA | For legal, financial or data-changing submissions, allow review, confirmation or reversal. | |

## 4. Robust

| SC | Level | Rule to carry into DESIGN.md | How it is usually missed |
| :--- | :--- | :--- | :--- |
| 4.1.1 Parsing | A | Valid markup: no duplicate ids, correct nesting. | |
| 4.1.2 Name, Role, Value | A, **always** | Every control has an accessible name and role. Custom components expose state. Announce changes of view or content to assistive tech with focus management or live regions. | A slide deck swapped slides with no announcement and an unlabeled counter. |

## Not in WCAG 2.0, but worth stating

These appeared in WCAG 2.1 and are good practice: reflow at narrow widths (1.4.10), contrast of non-text UI such as borders and focus rings (1.4.11), text spacing overrides (1.4.12), status messages (4.1.3), and touch target size (2.5.5). State them as recommendations, not as the AA minimum.

## Process rules for the skill

- When scanning code, look for accessibility signals and record them in DESIGN.md: `alt` text, ARIA attributes, `lang`, semantic elements, focus styles, and the component library's built-in behavior. Record known gaps as well as strengths.
- Check the contrast of every base color pair (on-surface on surface, each status color on its container), not just component token pairs.
- Tell the user what the DESIGN.md cannot guarantee: it is context for agents, so the output still needs a review with a screen reader and an automated checker.
