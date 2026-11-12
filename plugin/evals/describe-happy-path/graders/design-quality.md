---
type: llm
focus: {source: file, path: DESIGN.md}
criteria: |
  Pass only if ALL hold:
  1. The tokens reflect the brief: a deep green `primary`, warm off-white surface colors, a serif heading typography token and a sans body token.
  2. Every `{...}` token reference in `components` points at a token that is defined in the front matter.
  3. The Accessibility section contains no recommended fixes, remediation lists, or "TODO fix" items. It is rules only. Project-specific rules are allowed.
  4. The assumptions or design decisions the model made are noted somewhere in the document, as there were no follow-up questions.
  5. There is no placeholder text (TODO, lorem ipsum, TBD).
---
