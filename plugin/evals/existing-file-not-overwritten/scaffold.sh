#!/bin/sh
# Seed a DESIGN.md that the skill must not clobber without asking.
cat > DESIGN.md <<'EOF'
---
name: Existing System
colors:
  primary: "#112233"
---

# Existing System
EOF
