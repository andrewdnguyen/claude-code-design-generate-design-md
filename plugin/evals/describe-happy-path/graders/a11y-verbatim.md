---
type: regex
target: {source: file, path: DESIGN.md}
pattern: 'Meet WCAG 2\.0 Level AA as the minimum\.[\s\S]*\*\*Structure and order\*\*[\s\S]*\*\*Text alternatives\*\*[\s\S]*\*\*Contrast and legibility\*\*[\s\S]*\*\*Resizing\*\*[\s\S]*\*\*Keyboard, focus and announcements\*\*[\s\S]*\*\*Verification\*\*[\s\S]*The linter checks component token contrast only\.'
match: contains
---
The Accessibility block is mandated verbatim: opening sentence, all six bold group headings in order, and the closing Verification line.
