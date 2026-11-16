---
type: regex
target: {source: file, path: DESIGN.md}
pattern: '(?s)\A---\n.*?^colors:.*?^\s+primary:.*?^typography:.*?^---\n'
flags: m
match: contains
---
YAML front matter must open the file and define colors (with a `primary`) before typography.
