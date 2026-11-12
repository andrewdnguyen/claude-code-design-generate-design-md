---
type: tool_used
tool: Write
input_match: 'DESIGN\.md'
min: 0
max: 0
---
SKILL.md: if a DESIGN.md exists, ask before overwriting, or use the edit path. A Write to DESIGN.md without asking is a failure. Edit-based updates are allowed because Edit is not in allowed_tools, so any compliant run ends by asking.
