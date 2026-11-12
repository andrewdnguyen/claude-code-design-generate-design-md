# Validate with the CLI

Lint, diff, and export DESIGN.md files using the @google/design.md command-line tool.

The `@google/design.md` CLI validates your design system against the spec, catches broken token references, checks WCAG contrast ratios, and exports tokens to other formats — all as structured JSON that agents can act on.

## Install

```bash
npm install @google/design.md@0.4.0
```

Or run directly without installing:

```bash
npx @google/design.md@0.4.0 lint DESIGN.md
```

All commands accept a file path or `-` for stdin. Output defaults to JSON.

## Lint a DESIGN.md

Validate a DESIGN.md file for structural correctness. The linter parses the YAML front matter, resolves all token references, runs 8 lint rules, and reports findings.

```bash
npx @google/design.md@0.4.0 lint DESIGN.md
```

Example output:

```json
{
  "findings": [
    {
      "severity": "warning",
      "path": "colors",
      "message": "No 'primary' color defined. The agent will auto-generate key colors, reducing your control over the palette."
    },
    {
      "severity": "info",
      "message": "Design system defines 4 colors, 3 typography scales, 2 rounding levels."
    }
  ],
  "summary": { "errors": 0, "warnings": 1, "infos": 1 }
}
```

Pipe from stdin if you’re generating DESIGN.md files programmatically:

```bash
cat DESIGN.md | npx @google/design.md@0.4.0 lint -
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `file` | positional | required | Path to DESIGN.md (or `-` for stdin) |
| `--format` | `json` \| `text` | `json` | Output format |

Exit code `1` if errors are found, `0` otherwise.

## Compare two versions

Detect token-level changes between two DESIGN.md files. The `diff` command reports which tokens were added, removed, or modified, and flags regressions (more errors or warnings in the “after” file).

```bash
npx @google/design.md@0.4.0 diff DESIGN.md DESIGN-v2.md
```

Example output:

```json
{
  "tokens": {
    "colors": { "added": ["accent"], "removed": [], "modified": ["tertiary"] },
    "typography": { "added": [], "removed": [], "modified": [] }
  },
  "findings": {
    "before": { "errors": 0, "warnings": 1 },
    "after": { "errors": 0, "warnings": 2 },
    "delta": { "errors": 0, "warnings": 1 }
  },
  "regression": true
}
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `before` | positional | required | Path to the “before” DESIGN.md |
| `after` | positional | required | Path to the “after” DESIGN.md |
| `--format` | `json` \| `text` | `json` | Output format |

Exit code `1` if regressions are detected.

## Export tokens

Convert DESIGN.md tokens to other formats for use in your codebase.

### Tailwind CSS

Generate a `theme.extend` configuration object:

```bash
npx @google/design.md@0.4.0 export --format tailwind DESIGN.md
```

The output is a JSON object with `colors`, `fontFamily`, `fontSize`, `borderRadius`, and `spacing` mapped from your design tokens. Drop it into your `tailwind.config.js`.

### DTCG (W3C Design Tokens)

Generate a [W3C Design Tokens Format Module](https://tr.designtokens.org/format/) compliant `tokens.json`:

```bash
npx @google/design.md@0.4.0 export --format dtcg DESIGN.md
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `file` | positional | required | Path to DESIGN.md |
| `--format` | `tailwind` \| `dtcg` | required | Export target format |

## View the spec

Output the DESIGN.md format specification. This is useful for injecting spec context into agent prompts so the agent knows exactly what structure to produce.

```bash
npx @google/design.md@0.4.0 spec
npx @google/design.md@0.4.0 spec --rules
npx @google/design.md@0.4.0 spec --rules-only --format json
```

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--rules` | boolean | `false` | Append the active linting rules table |
| `--rules-only` | boolean | `false` | Output only the linting rules table |
| `--format` | `markdown` \| `json` | `markdown` | Output format |

## Programmatic API

The linter is also available as a TypeScript library:

```typescript
import { lint } from '@google/design.md/linter';

const report = lint(markdownString);

console.log(report.findings);      // Finding[]
console.log(report.summary);       // { errors, warnings, infos }
console.log(report.designSystem);  // Resolved DesignSystemState
console.log(report.tailwindConfig); // Generated Tailwind theme
```