## What is DESIGN.md?

A design system document that AI agents read to generate consistent UI across your project.

Every project has a visual identity: colors, fonts, spacing, component styles. Traditionally, this lives in a Figma file, a brand PDF, or a designer’s head. None of these are readable by an AI agent.

**`DESIGN.md` changes that.** It’s a plain-text design system document that both humans and agents can read, edit, and enforce. Think of it as the design counterpart to `AGENTS.md`:

| File | Who reads it | What it defines |
| :--- | :--- | :--- |
| `README.md` | Humans | What the project is |
| `AGENTS.md` | Coding agents | How to build the project |
| `DESIGN.md` | Design agents | How the project should look and feel |

## What it gives you

When a design agent reads your `DESIGN.md`, every screen it generates follows the same visual rules: your color palette, your typography, your component patterns. Without it, each screen stands alone. With it, they look like they belong together.

`DESIGN.md` is a **living artifact**, not a static config file. It evolves as your design evolves. The agent generates it, you refine it, and it’s re-applied to screens as you iterate.

Under the hood, every `DESIGN.md` has two layers: **YAML front matter** containing machine-readable design tokens (exact hex values, font properties, spacing scales) and a **markdown body** providing human-readable design rationale. Tokens give agents precise values. Prose tells them *why* those values exist.
## The philosophy

The DESIGN.md spec is a **foundation, not a prescription**. It provides a common ground that agents, tools, and teams can rely on — a shared vocabulary for colors, typography, layout, and components — while preserving the freedom to extend the format for domain-specific needs. Unknown sections and custom tokens are accepted, not rejected.

## How they’re created

There are three paths to a `DESIGN.md`, from effortless to precise.

### Let the agent generate it

Describe the vibe. The agent translates your aesthetic intent into tokens and guidelines.

### Derive from branding

If you already have a brand, provide a URL or image. The agent extracts your palette, typography, and style patterns to build the `DESIGN.md` from what already exists.

### Write it by hand

Advanced users can author a `DESIGN.md` directly, encoding exact design preferences. Every section is just markdown with optional YAML front matter for design tokens. No special syntax beyond standard markdown and YAML.