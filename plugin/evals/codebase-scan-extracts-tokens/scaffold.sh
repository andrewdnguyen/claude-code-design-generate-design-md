#!/bin/sh
# Tiny project with unmistakable, easy-to-grep design signals.
mkdir -p src node_modules/ignored
cat > tailwind.config.js <<'EOF'
module.exports = {
  theme: {
    colors: { brand: '#7a1fa2', ink: '#1b1b1f', paper: '#fbf9f4' },
    fontFamily: { display: ['Sora', 'sans-serif'], body: ['Public Sans', 'sans-serif'] },
    borderRadius: { card: '14px' },
  },
};
EOF
cat > src/app.css <<'EOF'
:root { --color-accent: #e8590c; --spacing-unit: 6px; }
EOF
# Decoy: must be skipped per SKILL.md (node_modules).
echo ":root { --color-decoy: #00ff00; }" > node_modules/ignored/decoy.css
