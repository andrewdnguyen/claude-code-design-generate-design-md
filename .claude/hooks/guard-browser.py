#!/usr/bin/env python3
"""PreToolUse guard for Chrome DevTools MCP navigation and script tools.

Enforces the CLAUDE.md "Browser scope" rule mechanically:
  - navigate_page / new_page may only load file:// pages inside this project
    or http://127.0.0.1:<port>/... (the /serve server).
  - navigate_page may not inject an initScript.
  - evaluate_script may not save its output to a file (filePath) and its
    function may not open network connections, navigate, or inject elements.
  - Every other tool that takes a filePath (take_screenshot, take_snapshot,
    take_heapsnapshot, performance_stop_trace, ...) may only write the fixed
    preview files in .claude/ (last-preview.png, last-snapshot.txt,
    verify-*) or a path under artifacts/.
  - upload_file is refused: it sends a local file into the page.

  exit 0 -> allow
  exit 2 -> block, message on stderr is shown to Claude

Trust boundary: the URL check is sound (real path under the project, or the
loopback server). The evaluate_script check is best-effort source-text
matching. It stops the obvious forms (fetch(, new WebSocket(, location.href =,
window["fe"+"tch"], eval(atob(...)), .click()), but JavaScript has unbounded
ways to spell a call, so a determined prompt injection can get past it.
Treat evaluate_script as unfiltered when deciding what a page may contain:
the pages it runs on must themselves be trusted, i.e. artifacts this repo
generated, not arbitrary captured sites.

Fails closed: any parse error or missing CLAUDE_PROJECT_DIR blocks the call.
"""
import json
import os
import re
import sys
from urllib.parse import unquote, urlsplit

NET_RE = re.compile(
    r"\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts|Worker|"
    r"SharedWorker|serviceWorker|RTCPeerConnection|Image)\s*\(|"
    r"\bnew\s+(Image|Worker|WebSocket|EventSource|XMLHttpRequest|RTCPeerConnection)\b|"
    r"\bimport\s*\(|"
    r"\bwindow\s*\.\s*open\s*\(|"
    r"\blocation\s*\.\s*(href|assign|replace|host|hostname|protocol|pathname|search)\b|"
    r"\blocation\s*=(?!=)|"
    r"\bdocument\s*\.\s*(location|write|writeln|cookie)\b|"
    r"\.(src|srcset|href|action|srcdoc)\s*=|"
    r"\bcreateElement\s*\(\s*['\"](script|iframe|img|link|object|embed|form|video|audio|source)['\"]|"
    r"\b(insertAdjacentHTML|outerHTML|innerHTML)\s*[=(]|"
    r"\bnavigator\s*\.\s*(clipboard|credentials|geolocation|mediaDevices|share)\b|"
    r"\b(localStorage|sessionStorage|indexedDB|caches)\b|"
    r"\bsubmit\s*\(|"
    # indirection: computed property access on the globals, eval-likes, string timers
    r"\b(window|self|globalThis|top|parent|frames|navigator|document|location)\s*\[|"
    r"(?-i:\b(eval|Function|atob|execScript|fromCharCode)\s*\()|"
    r"\b(setTimeout|setInterval)\s*\(\s*['\"`]|"
    r"\bReflect\s*\.|"
    r"\.click\s*\(",
    re.IGNORECASE,
)


def deny(msg):
    sys.stderr.write("blocked by guard-browser: %s\n" % msg)
    sys.exit(2)


def project_dir():
    p = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if not p or not os.path.isabs(p):
        deny("CLAUDE_PROJECT_DIR is not set; refusing to navigate")
    return os.path.realpath(p)


def check_url(url):
    if not isinstance(url, str) or not url:
        deny("url is required")
    if url == "about:blank":
        return
    parts = urlsplit(url)
    if parts.scheme == "file":
        if parts.netloc not in ("", "localhost"):
            deny("file:// URL with a host")
        path = os.path.realpath(unquote(parts.path))
        root = project_dir()
        if path != root and not path.startswith(root + os.sep):
            deny("file:// path is outside the project: %s" % path)
        if "/.claude/" in path + "/" or "/.git/" in path + "/" or "/node_modules/" in path + "/":
            deny("file:// path inside a protected directory")
        return
    if parts.scheme == "http" and parts.hostname == "127.0.0.1":
        return
    deny("only file://<project>/... and http://127.0.0.1:<port>/... may be opened (got %s)" % url)


PREVIEW_FILE_RE = re.compile(
    r"^(last-preview\.png|last-snapshot\.txt|verify-[A-Za-z0-9._-]+\.(png|jpe?g|webp|json|txt))$"
)


def check_output_path(fp, key="filePath", is_dir=False):
    """A path argument on a tool that writes its result to disk (filePath, outputDirPath, ...)."""
    if fp is None or fp == "":
        return  # no file requested; the tool returns its result inline
    if not isinstance(fp, str):
        deny("%s is not a string" % key)
    root = project_dir()
    # The MCP writes the literal string (no URL-decoding), so check the literal string. Relative
    # paths resolve against the project, which is the MCP server's working directory when Claude
    # Code starts it from this project; realpath also resolves symlinks and '..'.
    path = os.path.realpath(os.path.join(root, fp))
    if (not is_dir and os.path.dirname(path) == os.path.join(root, ".claude")
            and PREVIEW_FILE_RE.match(os.path.basename(path))):
        return
    if path.startswith(os.path.join(root, "artifacts") + os.sep):
        return
    if is_dir:
        deny("%s must be a directory under artifacts/ (got %s)" % (key, fp))
    deny(
        "%s must be .claude/last-preview.png, .claude/last-snapshot.txt, "
        ".claude/verify-*.(png|jpg|webp|json|txt) or a path under artifacts/ (got %s)" % (key, fp)
    )


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        deny("could not parse hook input")
    name = str(data.get("tool_name", ""))
    inp = data.get("tool_input") or {}
    if not isinstance(inp, dict):
        deny("tool_input is not an object")

    short = name.rsplit("__", 1)[-1]
    if short == "upload_file":
        deny("upload_file (sends a local file into the page)")
    if short != "evaluate_script":
        # every path-like argument: filePath (screenshots, snapshots, traces, heap snapshots),
        # outputDirPath (lighthouse_audit reports) and any future *Path / *Dir argument
        for key, val in inp.items():
            if key == "filePath" or key.endswith(("Path", "Dir", "Directory")):
                check_output_path(val, key, is_dir=key.endswith(("Dir", "DirPath", "Directory")))

    if name.endswith("navigate_page"):
        if inp.get("initScript"):
            deny("navigate_page with initScript")
        kind = inp.get("type", "url")
        if kind in ("back", "forward", "reload") and not inp.get("url"):
            return
        check_url(inp.get("url"))
        return

    if name.endswith("new_page"):
        check_url(inp.get("url"))
        return

    if name.endswith("evaluate_script"):
        if inp.get("filePath"):
            deny("evaluate_script filePath (writes a file outside the Write tool)")
        fn = inp.get("function", "")
        if not isinstance(fn, str):
            deny("function is not a string")
        m = NET_RE.search(fn)
        if m:
            deny("evaluate_script function uses '%s' (network, navigation, storage or DOM injection)" % m.group(0).strip())
        return

    # Any other chrome-devtools tool (click, fill, take_screenshot without a file, ...): allow.
    return


if __name__ == "__main__":
    main()
