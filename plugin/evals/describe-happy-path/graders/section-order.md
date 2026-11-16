---
type: regex
target: {source: file, path: DESIGN.md}
pattern: '(?ims)^#+\s*Overview\b.*^#+\s*Colors\b.*^#+\s*Typography\b.*^#+\s*Layout\b.*^#+\s*Components\b.*^#+\s*Responsive Behaviou?r\b.*^#+\s*Accessibility\b.*^#+\s*Do.s and Don.ts'
match: contains
---
Canonical section order, with Responsive Behavior and Accessibility between Components and Do's and Don'ts. Elevation and Shapes may sit in their slots but are optional, so they are not asserted here.
