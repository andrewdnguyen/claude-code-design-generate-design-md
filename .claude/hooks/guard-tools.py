#!/usr/bin/env python3
"""PreToolUse guard for every tool call in this project (matcher "*"), plus a SessionStart mode.

1. Integrity. guard-bash.sh and guard-browser.py must match the SHA-256 values pinned in
   hooks.sha256 next to this file. A mismatch blocks every tool call until a person re-runs
   the self-test and re-pins:
       bash .claude/hooks/test-guard.sh
       (cd .claude/hooks && shasum -a 256 guard-bash.sh guard-browser.py > hooks.sha256)
2. MCP allowlist. An mcp__* tool is allowed only if it belongs to this project's own Chrome
   DevTools server (which guard-browser.py checks further) or is the IDE diagnostics tool.
   Every other MCP server or connector (shell runners, logged-in browser drivers, mail, file
   sharing, payments) is refused, because CLAUDE.md's browser-scope and untrusted-content
   rules are not enforced on them. To allow one, a person edits ALLOWED_MCP below.
3. WebFetch and WebSearch are refused (they are also denied in settings.json).
4. Audit. One JSON line per call in .claude/audit/tool-calls.jsonl: time, session, tool,
   SHA-256 of the input (never the input itself), decision. Best-effort: a logging failure
   never changes the decision.

SessionStart mode (--session-start) records the skill-set revision in the same log and warns
when the pins do not match. A SessionStart hook cannot block a session, so blocking happens
here on the first tool call.

  exit 0 -> allow
  exit 2 -> block, message on stderr is shown to Claude
Registered with "onFailure": "block", so a crash or a missing python3 also blocks.
"""
import hashlib
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.realpath(__file__))
PINNED = ("guard-bash.sh", "guard-browser.py")
ALLOWED_MCP = re.compile(
    r"^mcp__(chrome-devtools"
    r"|plugin_claude-code-design_chrome-devtools"
    r"|plugin_chrome-devtools-mcp_chrome-devtools)__[A-Za-z0-9_]+$"
    r"|^mcp__ide__getDiagnostics$"
)
DENIED_BUILTIN = {"WebFetch", "WebSearch"}


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def audit(record):
    proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not proj or not os.path.isabs(proj) or not os.path.isdir(os.path.join(proj, ".claude")):
        return
    try:
        d = os.path.join(proj, ".claude", "audit")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "tool-calls.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record, sort_keys=True) + "\n")
    except Exception:
        pass


def call_record(data, decision, reason):
    raw = json.dumps(data.get("tool_input"), sort_keys=True, default=str).encode("utf-8")
    return {
        "ts": now(),
        "event": "tool_call",
        "session_id": data.get("session_id"),
        "tool": data.get("tool_name"),
        "tool_use_id": data.get("tool_use_id"),
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "decision": decision,
        "reason": reason,
    }


def verify_pins():
    """Return None when every pinned hook matches, else a short description of the problem."""
    pins = {}
    try:
        with open(os.path.join(HERE, "hooks.sha256"), encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2:
                    pins[parts[1].lstrip("*")] = parts[0].lower()
    except OSError:
        return "hooks.sha256 is missing"
    for name in PINNED:
        if name not in pins:
            return "%s has no pinned hash" % name
        try:
            with open(os.path.join(HERE, name), "rb") as f:
                digest = hashlib.sha256(f.read()).hexdigest()
        except OSError:
            return "%s is missing" % name
        if digest != pins[name]:
            return "%s does not match its pinned hash" % name
    return None


def git_head(proj):
    """Current commit, read from .git without running git."""
    try:
        gitdir = os.path.join(proj, ".git")
        with open(os.path.join(gitdir, "HEAD"), encoding="utf-8") as f:
            head = f.read().strip()
        if not head.startswith("ref: "):
            return head
        ref = head[5:]
        ref_path = os.path.join(gitdir, *ref.split("/"))
        if os.path.isfile(ref_path):
            with open(ref_path, encoding="utf-8") as f:
                return f.read().strip()
        with open(os.path.join(gitdir, "packed-refs"), encoding="utf-8") as f:
            for line in f:
                parts = line.split()
                if len(parts) == 2 and parts[1] == ref:
                    return parts[0]
    except OSError:
        pass
    return None


def session_start(data):
    problem = verify_pins()
    proj = os.environ.get("CLAUDE_PROJECT_DIR", "")
    audit({
        "ts": now(),
        "event": "session_start",
        "session_id": data.get("session_id"),
        "git_head": git_head(proj) if proj else None,
        "hooks_pinned": problem is None,
        "problem": problem,
    })
    if problem:
        msg = ("WARNING: hook integrity check failed (%s). Every tool call will be blocked until a "
               "person re-runs bash .claude/hooks/test-guard.sh and re-pins hooks.sha256. Tell the user." % problem)
        print(msg)
        sys.stderr.write(msg + "\n")
    sys.exit(0)


def block(data, reason):
    audit(call_record(data, "deny", reason))
    sys.stderr.write("blocked by guard-tools: %s\n" % reason)
    sys.exit(2)


def main():
    try:
        data = json.load(sys.stdin)
        if not isinstance(data, dict):
            raise ValueError("hook input is not an object")
    except Exception:
        sys.stderr.write("blocked by guard-tools: could not parse hook input\n")
        sys.exit(2)

    if "--session-start" in sys.argv[1:]:
        session_start(data)

    name = str(data.get("tool_name", ""))
    problem = verify_pins()
    if problem:
        block(data, "hook integrity check failed: %s. A person must re-run bash .claude/hooks/test-guard.sh "
                    "and re-pin .claude/hooks/hooks.sha256 (see SECURITY.md)" % problem)
    if name in DENIED_BUILTIN:
        block(data, "%s is not used in this project (it would bypass the ingest gate and the browser scope)" % name)
    if name.startswith("mcp__") and not ALLOWED_MCP.match(name):
        block(data, "MCP tool %s is not on this project's allowlist (ALLOWED_MCP in .claude/hooks/guard-tools.py; "
                    "a person edits it)" % name)
    audit(call_record(data, "allow", ""))
    sys.exit(0)


if __name__ == "__main__":
    main()
