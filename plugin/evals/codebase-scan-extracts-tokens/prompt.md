---
name: codebase-scan-extracts-tokens
tags: [generate, path-b]
runs: 3
max_turns: 25
allowed_tools: [Write, Read, Glob, Grep, Skill]
---
Use the generate-design-md skill, Path B: scan this codebase for the existing colors, fonts and spacing and write DESIGN.md. Skip the linter and recommended-fixes steps.
