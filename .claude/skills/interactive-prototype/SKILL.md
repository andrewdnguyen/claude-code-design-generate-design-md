---
name: interactive-prototype
description: Build a hi-fi clickable React prototype with realistic device chrome. Triggered by "prototype", "clickable", "app mockup", "interactive demo".
argument-hint: <feature or app description>
allowed-tools: Read Write Edit Glob Grep Bash(cp starters/:*) Bash(cp artifacts/:*) Bash(mkdir -p artifacts:*) Bash(ls design-systems:*) Bash(open file://:*) Bash(open http://127.0.0.1:*) Bash(xdg-open file://:*) Bash(xdg-open http://127.0.0.1:*) mcp__chrome-devtools__navigate_page mcp__chrome-devtools__take_screenshot mcp__chrome-devtools__take_snapshot mcp__chrome-devtools__list_console_messages
---

# Interactive Prototype

Build a working clickable prototype — not a static mockup. Uses React + Babel inline with pinned versions, wrapped in a DeviceFrame.

## Phase 0 — Context pre-flight (auto-detect, ONE question max)

Before design questions, silently check for context:
1. `Read .claude/design-tokens.json` if exists
2. `Bash(ls design-systems/ 2>/dev/null)` — project-local registry (gitignored). If the brief names a registered brand, say
   "Found design system <name> in the registry. Apply it?" and wait. Never auto-apply.
3. `Glob` for codebase tokens: `**/tailwind.config.*`, `**/theme.{ts,js,json}`, `**/tokens.{css,scss}`, `**/_variables.*`
4. Scan brief/attachments for external references: github URL → `ingest-github`, Figma URL → `ingest-figma`,
   image path → `ingest-screenshot`, `.pptx` / `.docx` / `.xlsx` / `.pdf` path → `ingest-document`, `.md` / `.txt` → `Read`.
   Do NOT invoke any ingest skill automatically. List what was found and ask one
   AskUserQuestion: "Ingest <X>? (yes / no)". Only invoke the matching ingest skill on an explicit yes.

If nothing found, ask ONE `AskUserQuestion`: design system from registry / codebase / screenshot / Figma / none (use frontend-design) / Claude decides. Report "Using <context>. Proceeding."

## Phase 1 — Ambiguity gate

Check brief for: platform (iOS/Android/desktop/web), app category (food delivery, social, productivity, etc.), feature count, design context (brand/codebase).

If platform + category present → max 2 clarifying questions. Otherwise `AskUserQuestion`:
- Platform
- Screens needed (list)
- Transitions between screens (instant / slide / fade / custom)
- Does it need "live data" mocking (fake API returns)
- How interactive — taps only, or scroll/swipe/drag
- Variations wanted

**Do not** ask about brand context — Phase 0 already handled it.

## Phase 2 — Visual system

Using context from Phase 0, commit to a mobile-aware system:
- Min 44px hit targets on mobile
- Consistent spacing / type scale from loaded tokens
- If no tokens → invoke `Skill: frontend-design` if it is installed; otherwise proceed with the taste rules in `CLAUDE.md`

## Phase 3 — Build

1. `artifacts/<slug>.html` with shell:
   ```html
   <!doctype html>
   <html>
   <head>
     <meta charset="utf-8"/>
     <title>{{name}}</title>
     <link rel="icon" href="data:,"/>
     <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L" crossorigin="anonymous"></script>
     <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm" crossorigin="anonymous"></script>
     <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js" integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y" crossorigin="anonymous"></script>
     <script src="./device_frame.jsx" type="text/babel"></script>
     <script src="./animations.jsx" type="text/babel"></script>
     <style>body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f4f4f6; }</style>
   </head>
   <body>
     <div id="root"></div>
     <script type="text/babel">
       const { useState } = React;
       // your components here
       function App() {
         const [screen, setScreen] = useState('home');
         return <DeviceFrame kind="ios">
           {screen === 'home' && <HomeScreen onNav={setScreen}/>}
           {screen === 'detail' && <DetailScreen onBack={() => setScreen('home')}/>}
         </DeviceFrame>;
       }
       ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
     </script>
   </body>
   </html>
   ```
2. `Bash(cp starters/device_frame.jsx artifacts/<dir-of-html>/)` + `Bash(cp starters/animations.jsx artifacts/<dir-of-html>/)` — copy into the same dir as the HTML, spelling the directory out literally (no `$(dirname …)`)
3. Navigation pattern: `useState` for current screen. For transitions use `<Transition>` from animations.jsx.
4. **Critical React rule:** never `const styles = {...}`. Use component-prefixed names: `const headerStyles`, `const cardStyles`. Inline styles also OK.
5. Mock data inline; no external fetch.

## Phase 4 — Verify

**Important:** because this artifact loads external `.jsx` starters, `file://` will hit CORS errors. Run `/serve` first (one-time), then preview via http. Keep the `<link rel="icon" href="data:,"/>` from the shell: over http Chrome otherwise requests `/favicon.ico`, the server answers 404, and that lands in the console as an `error` that `/done` would report against a clean artifact.

```
/serve
/done http://127.0.0.1:4567/<slug>.html
```

Fix errors → `Skill: verify-artifact` in background.

## Phase 5 — Next steps

- `/make-tweakable` to expose knobs (primaryColor, fontSize, density variants)
- `/export-standalone` for offline deliverable
- `/handoff` to produce component files for the dev team
- `/register-asset` to add to overview
