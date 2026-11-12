# Linting rules

The 8 rules the DESIGN.md linter enforces, what triggers each one, and how to resolve findings.

The `@google/design.md` linter runs rules against a parsed DESIGN.md file. Each rule produces findings at a fixed severity level: **error** (exit code 1), **warning**, or **info**.

## broken-ref

**Severity:** error

Detects token references (`{path.to.token}`) that do not resolve to any defined token in the YAML front matter. Also flags unknown component sub-token property names.

**Triggers when:**

*   A component references a token path that does not exist (e.g., `{colors.accent}` when no `accent` color is defined)
*   A component uses a property name not in the recognized set (`backgroundColor`, `textColor`, `typography`, `rounded`, `padding`, `size`, `height`, `width`)

**Example finding:**

```plaintext
error  components.button-primary  Reference {colors.accent} does not resolve to any defined token.
```

**Resolution:** Define the missing token in the YAML front matter, or correct the reference path. For unknown properties, use one of the recognized component sub-token names.

**Note:** `spec.md` describes unknown component properties as "accept with warning", but this linter treats them as errors. Follow the linter.

## missing-primary

**Severity:** warning

Warns when colors are defined in the front matter but no token named `primary` exists. Without a primary color, agents will auto-generate one, reducing your control over the palette.

**Triggers when:** The `colors` section has one or more entries, but none is named `primary`.

**Example finding:**

```plaintext
warning  colors  No 'primary' color defined. The agent will auto-generate key colors, reducing your control over the palette.
```

**Resolution:** Add a `primary` entry to the `colors` section.

## contrast-ratio

**Severity:** warning

Checks WCAG contrast ratios for component `backgroundColor` and `textColor` pairs. Warns when the ratio falls below the AA minimum of 4.5:1.

**Triggers when:** A component defines both `backgroundColor` and `textColor`, and the resolved color values produce a contrast ratio below 4.5:1.

**Example finding:**

```plaintext
warning  components.card-dark  textColor (#999999) on backgroundColor (#333333) has contrast ratio 3.48:1, below WCAG AA minimum of 4.5:1.
```

**Resolution:** Adjust either the background or text color to meet the 4.5:1 minimum ratio.

## orphaned-tokens

**Severity:** warning

Identifies color tokens that are defined but never referenced by any component. Orphaned tokens add noise and may indicate an incomplete design system.

**Triggers when:** A color token exists in the `colors` section but is not referenced by any component’s properties. Only fires when at least one component is defined.

**Example finding:**

```plaintext
warning  colors.tertiary  'tertiary' is defined but never referenced by any component.
```

**Resolution:** Reference the token in a component, or remove it if it is no longer needed.

## missing-typography

**Severity:** warning

Warns when colors are defined but no typography tokens exist. Without typography tokens, agents will fall back to their own font choices.

**Triggers when:** The `colors` section has entries but the `typography` section is empty.

**Example finding:**

```plaintext
warning  typography  No typography tokens defined. Agents will use default font choices, reducing your control over the design system's typographic identity.
```

**Resolution:** Add at least one typography token (e.g., `body-md`) to the front matter.

## section-order

**Severity:** warning

Warns when markdown sections appear out of the canonical order defined by the spec. The expected sequence is: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do’s and Don’ts.

**Triggers when:** A recognized section heading appears before another recognized section that should precede it. Section aliases (e.g., “Elevation” for “Elevation & Depth”) are resolved before checking.

**Example finding:**

```plaintext
warning  Section 'Components' appears before 'Typography', which is out of order. Expected order: Overview, Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and Don'ts
```

**Resolution:** Reorder the sections in the markdown body to match the canonical sequence.

## missing-sections

**Severity:** info

Notes when optional token sections (`spacing`, `rounded`) are absent from a file that already defines other tokens. These sections are not required, but their absence means agents will fall back to defaults.

**Triggers when:** The `colors` section has entries but `spacing` or `rounded` has no entries.

**Example finding:**

```plaintext
info  spacing  No 'spacing' section defined. Layout spacing will fall back to agent defaults.
```

**Resolution:** Add a `spacing` or `rounded` section to the front matter if you want explicit control over those values.

## token-summary

**Severity:** info

Emits a summary diagnostic reporting how many tokens are defined in each section. This is purely informational.

**Example finding:**

```plaintext
info  Design system defines 4 colors, 3 typography scales, 2 rounding levels, 6 spacing tokens, 3 components.
```

---

## Summary

| Rule | Severity | What it checks |
| :--- | :--- | :--- |
| `broken-ref` | error | Token references that don’t resolve; unknown component sub-tokens |
| `missing-primary` | warning | Colors defined but no `primary` exists |
| `contrast-ratio` | warning | Component backgroundColor/textColor below WCAG AA 4.5:1 |
| `orphaned-tokens` | warning | Color tokens defined but never referenced by a component |
| `missing-typography` | warning | Colors defined but no typography tokens exist |
| `section-order` | warning | Sections out of canonical order |
| `missing-sections` | info | Optional sections (spacing, rounded) absent |
| `token-summary` | info | Count of tokens defined per section |