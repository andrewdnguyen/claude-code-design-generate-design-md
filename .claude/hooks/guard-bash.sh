#!/usr/bin/env bash
# PreToolUse guard for the Bash tool.
# Blocks commands that could exfiltrate data, run arbitrary code, or write
# outside the project's scratch areas — independent of permission-pattern
# semantics. The command word of every pipeline segment must be on the
# allowlist below; on top of that, every command the workflow needs in a
# restricted form (curl, node, python3, open, rm, gh, git, zip/unzip,
# cp/mv/mkdir, readers) has its own positive rule.
#
#   exit 0  -> allow
#   exit 2  -> block, message on stderr is shown to Claude
#
# The guard inspects the unparsed command string, per pipeline segment. It
# cannot tell a command from prose, so a quoted string that contains `curl`,
# a backtick, `$(`, `..`, `>` or an absolute path outside the project is
# blocked too. Use the Read/Grep/Edit tools for such text instead of
# echo/rg/sed.
#
# Adding a command the workflow needs: append it to re_cmd_ok, add a
# test-guard.sh case for the exact documented form, and rerun the self-test.
#
# Fails closed: any internal error blocks the command.
# Self-test: bash .claude/hooks/test-guard.sh
set -euo pipefail
trap 'echo "blocked by guard-bash: internal error while inspecting command" >&2; exit 2' ERR

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')"

# Best-effort audit trail: one JSON line per decision in .claude/audit/bash-guard.jsonl. It never
# changes the decision, logs a SHA-256 of the command rather than the command, and logs the rule
# text only up to its first quote (the quoted part can echo user content).
audit_dir=""
if [[ -n "${CLAUDE_PROJECT_DIR:-}" && "${CLAUDE_PROJECT_DIR}" == /* && -d "${CLAUDE_PROJECT_DIR}/.claude" ]]; then audit_dir="${CLAUDE_PROJECT_DIR}/.claude/audit"; fi
audit() {
  [[ -n "$audit_dir" ]] || return 0
  local rule="$2"; rule="${rule%%"'"*}"
  { mkdir -p "$audit_dir" && python3 -c 'import hashlib,json,sys,time; print(json.dumps({"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "tool": "Bash", "decision": sys.argv[1], "rule": sys.argv[2].strip(), "input_sha256": hashlib.sha256(sys.argv[3].encode()).hexdigest()}))' "$1" "$rule" "${cmd:-}" >> "$audit_dir/bash-guard.jsonl"; } 2>/dev/null || true
}

deny() { audit deny "$1"; echo "blocked by guard-bash: $1" >&2; exit 2; }

if (( ${#cmd} > 20000 )); then deny "command longer than 20000 characters"; fi

# ---------------------------------------------------------------- 0. normalise
# ANSI-C quoting ($'\x2e\x2e') would hide '..' and absolute paths behind escapes that only
# bash expands; nothing in the workflow uses it.
if [[ "$cmd" == *\$\'* ]]; then deny "ANSI-C quoting (\$'...') is not allowed"; fi
# Mask the project dir so absolute in-project paths (what `realpath` prints) read as PROJECT_DIR/...
proj="${CLAUDE_PROJECT_DIR:-}"
if [[ -n "$proj" && "$proj" == /* ]]; then cmd="${cmd//"$proj"/PROJECT_DIR}"; fi
# \curl, \rm and friends bypass shell aliases, not this guard: bash still runs the real
# curl/rm binary, so a leading backslash is normalised away before command-word matching.
# This must stay narrow. A blanket strip of every backslash (the previous form of this line)
# is a critical bypass: bash treats an unquoted \" as a literal " that does NOT open a quoted
# region, but erasing the backslash here made this guard's quote-tracking (below) believe a
# quoted region HAD opened -- hiding real ; & | separators, and the commands after them,
# inside what then looked like one harmless quoted segment (e.g. `echo \"; cp x
# ~/Library/LaunchAgents/evil.plist ; echo \"` traced as a single allowed `echo` segment while
# bash actually ran the unchecked `cp`). So: only a backslash immediately followed by a letter,
# at the start of the command or right after whitespace/;/&/|/(/), is stripped (the \cmd alias
# form). Any other backslash anywhere in the command is an outright deny.
stripped="$cmd"
while [[ "$stripped" =~ (^|[[:space:]\;\&\|\(\)])\\([A-Za-z][A-Za-z0-9_]*) ]]; do
  stripped="${stripped/"${BASH_REMATCH[0]}"/${BASH_REMATCH[1]}${BASH_REMATCH[2]}}"
done
if [[ "$stripped" == *'\'* ]]; then deny "backslash escape sequence not allowed (only a leading \\cmd alias form, e.g. \\curl, is permitted)"; fi
cmd="$stripped"

# ---------------------------------------------------------------- 1. whole-command rules
re_subst='\$\(|`|<\(|>\('
if [[ "$cmd" =~ $re_subst ]]; then deny "command / process substitution"; fi

re_traverse='(^|[^A-Za-z0-9.])\.\.(/|[[:space:]"'"'"']|$)'
if [[ "$cmd" =~ $re_traverse ]]; then deny "'..' path traversal"; fi

# Paths that hold credentials or shell startup state — never readable or writable from here.
re_secret='(~|\$HOME|/Users/[^/[:space:]"'"'"']+|/home/[^/[:space:]"'"'"']+|/root|/var/root)/(\.(ssh|aws|gnupg|gpg|config|claude|netrc|npmrc|pypirc|docker|kube|zsh|bash|profile|zprofile|zshenv|gitconfig|git-credentials|env|local)|Library/(Keychains|Cookies|Application Support|Mail|Messages|Safari|Group Containers|Containers))'
re_secret2='(^|[[:space:]/"'"'"'=])(\.env([./"'"'"'[:space:]]|$)|\.git-credentials|id_(rsa|ed25519|ecdsa|dsa)|credentials|[^[:space:]/]+\.(pem|p12|pfx|key)([[:space:]"'"'"']|$))|/proc/|/dev/(tcp|udp)/'
if [[ "$cmd" =~ $re_secret ]] || [[ "$cmd" =~ $re_secret2 ]]; then deny "credential / dotfile path"; fi

# rm: only the ingest scratch dir, as the whole command (never combined with anything else)
re_rm='(^|[[:space:];&|(/])rm([[:space:]]|$)'
if [[ "$cmd" =~ $re_rm ]]; then
  re_rm_ok='^[[:space:]]*rm[[:space:]]+-rf?[[:space:]]+/tmp/cd-ingest-[A-Za-z0-9._-]+/?[[:space:]]*$'
  if ! [[ "$cmd" =~ $re_rm_ok ]]; then deny "rm outside /tmp/cd-ingest-* (or combined with other commands)"; fi
fi

# ---------------------------------------------------------------- 2. split into segments
# Separators inside quotes are neutralised first so "?ids=1:2&depth=2" does not become a segment.
# The '&' of a descriptor redirect (2>&1, >&2, &>/dev/null) is replaced by BEL so it survives the
# split on '&'; the redirect rule below recognises the BEL form.
BEL=$'\a'
neutralised=""
in_sq=0; in_dq=0
for ((i = 0; i < ${#cmd}; i++)); do
  c="${cmd:i:1}"
  if (( in_sq )); then
    if [[ "$c" == "'" ]]; then in_sq=0; fi
    case "$c" in ';'|'&'|'|'|'('|')'|$'\n') c='_' ;; esac
  elif (( in_dq )); then
    if [[ "$c" == '"' ]]; then in_dq=0; fi
    case "$c" in ';'|'&'|'|'|'('|')'|$'\n') c='_' ;; esac
  else
    if [[ "$c" == "'" ]]; then in_sq=1; elif [[ "$c" == '"' ]]; then in_dq=1; fi
    if [[ "$c" == '&' ]]; then
      prev="${neutralised: -1}"; next="${cmd:i+1:1}"
      if [[ "$prev" == '>' || "$next" == '>' ]]; then c="$BEL"; fi
    fi
  fi
  neutralised+="$c"
done
segs="${neutralised//&&/$'\n'}"
segs="${segs//||/$'\n'}"
segs="${segs//[;&|()]/$'\n'}"

# "start of a command word" inside a segment: segment start, whitespace, or a path separator
W='(^|[[:space:]/=])'

# Commands allowed at command position. Everything else is blocked before any other rule runs.
re_cmd_ok='^(curl|node|python3|python|open|xdg-open|rm|cp|mv|mkdir|touch|ls|cat|head|tail|wc|stat|file|basename|dirname|realpath|date|test|\[|which|sleep|lsof|pkill|zip|unzip|gh|git|claude|monolith|rg|grep|fd|find|sort|uniq|cut|tr|diff|cmp|du|tree|echo|printf|pwd|true|false|shasum|md5|md5sum|uname|sw_vers|seq|expr|bash|:)$'

# Path arguments (see the mode selection at the end of the segment loop):
#   writers (cp mv mkdir touch zip monolith node gh) stay inside the project and off protected files;
#   readers (cat head … git) stay inside the project or /tmp/cd-ingest-*.
# `test`, `file`, `realpath`, `basename` and `unzip` are unchecked: the ingest skills point them at a
# user-supplied file, and none of them prints file contents. `cd` is not on the allowlist at all,
# because a relative path is only checkable while the working directory is the project.
path_ok() {
  # $1 = token, $2 = command name (or READ for read-only commands)
  # relative path without a leading / ~ $ or -, or an absolute in-project / ingest-scratch path
  local t="$1" p="" sl='/'
  t="${t//[\"\']/}"
  [[ -z "$t" ]] && return 0
  case "$t" in
    PROJECT_DIR/*|/tmp/cd-ingest-*) ;;
    /*|~*|\$*) return 1 ;;
  esac
  [[ "$2" == READ ]] && return 0
  t="${t#PROJECT_DIR/}"
  # normalise ./x, a//b, a/./b so the protected-file check cannot be dodged with a different spelling
  while [[ "$t" != "$p" ]]; do
    p="$t"
    t="${t//\/\//$sl}"; t="${t//\/.\//$sl}"; t="${t#./}"; t="${t#/}"
  done
  # the macOS filesystem is case-insensitive: Claude.md and .Claude/Hooks are the same files
  t="$(printf '%s' "$t" | tr '[:upper:]' '[:lower:]')"
  case "$t" in
    .claude/hooks*|.claude/settings*|.mcp.json*|.git/*|.git) return 1 ;;
    # policy-as-code and the audit trail: change these with the Edit tool (which asks) or by hand
    claude.md|.claude/skills*|.claude/commands*|.claude/audit*|starters|starters/*|plugin|plugin/*|.github|.github/*|tools|tools/*|package.json|package-lock.json) return 1 ;;
    scripts/*) [[ "$2" == node ]] || return 1 ;;   # node may run them; nothing may write them
  esac
  return 0
}

segidx=-1
while IFS= read -r seg || [[ -n "$seg" ]]; do
  [[ "$seg" =~ ^[[:space:]]*$ ]] && continue
  segidx=$((segidx + 1))
  # Name-anchored rules match against a quote-stripped copy: "perl" and pe'r'l are perl to bash.
  bare="${seg//[\"\']/}"
  first="${bare#"${bare%%[![:space:]]*}"}"   # ltrim
  first="${first%%[[:space:]]*}"             # first word

  # ---- command position
  case "$first" in
    \$*) deny "variable as command" ;;
    .|*/*|~*) deny "path as command (only bare command names are allowed)" ;;
  esac
  re_assign='^[A-Za-z_][A-Za-z0-9_]*='
  if [[ "$first" =~ $re_assign ]]; then deny "assignment at command position"; fi
  if ! [[ "$first" =~ $re_cmd_ok ]]; then deny "command '$first' is not on the allowlist (see the header of .claude/hooks/guard-bash.sh)"; fi

  # ---- wrappers that run another command (none are on the allowlist; kept as a second layer)
  re_wrap='^(xargs|time|nohup|nice|ionice|command|builtin|sudo|doas|su|env|timeout|watch|caffeinate|script|expect|exec|eval|source|chroot|strace|dtruss|ltrace)$'
  if [[ "$first" =~ $re_wrap ]]; then deny "command wrapper: $first"; fi
  re_find_exec='(^|[[:space:]])-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)([[:space:]]|$)'
  if [[ "$bare" =~ $re_find_exec ]]; then deny "find -exec / -delete / -fprint / -fls"; fi

  # ---- reader commands with options that write a file or run another program. The path check
  # below skips option tokens, so these forms must be refused by name. getopt_long and git accept
  # unique prefixes of long options (--outp=, --open=) and bundled short options (-iO), so the
  # patterns match prefixes and short-option clusters, not only the canonical spelling.
  case "$first" in
    fd)
      re_fd_exec='(^|[[:space:]])(-[A-Za-z0-9]*[xX][A-Za-z0-9]*|--exec|--exec-batch)([[:space:]=]|$)'
      if [[ "$bare" =~ $re_fd_exec ]]; then deny "fd -x / -X / --exec / --exec-batch (runs a command per result)"; fi ;;
    rg)
      re_rg_pre='(^|[[:space:]])--pre([[:space:]=]|$)'
      if [[ "$bare" =~ $re_rg_pre ]]; then deny "rg --pre (runs a program per file)"; fi ;;
    sort)
      re_sort_out='(^|[[:space:]])(-[A-Za-z]*o|--o[a-z-]*|--co[a-z-]*)'
      if [[ "$bare" =~ $re_sort_out ]]; then deny "sort -o / --output / --compress-program"; fi ;;
    uniq)
      read -r -a utoks <<< "$bare"; npos=0; skip=0
      for ut in "${utoks[@]:1}"; do
        if (( skip )); then skip=0; continue; fi
        case "$ut" in
          -f|-s|-w) skip=1 ;;
          -*) ;;
          *) npos=$((npos + 1)) ;;
        esac
      done
      if (( npos > 1 )); then deny "uniq with an output file (second file argument)"; fi ;;
    tree)
      re_tree_out='(^|[[:space:]])(-[A-Za-z]*[oR]|--o[a-z-]*)'
      if [[ "$bare" =~ $re_tree_out ]]; then deny "tree -o / -R (write files)"; fi ;;
    git)
      re_git_out='(^|[[:space:]])(--ou[a-z-]*|--op[a-z-]*|-[A-Za-z0-9]*O)'
      re_git_writecmd='^[[:space:]]*git[[:space:]]+(format-patch|bundle|archive|fast-export|fast-import)([[:space:]]|$)'
      if [[ "$bare" =~ $re_git_out ]] || [[ "$bare" =~ $re_git_writecmd ]]; then deny "git --output / -O / format-patch / bundle / archive (write files or run a pager command)"; fi ;;
    zip)
      re_zip_tt='(^|[[:space:]])(-TT[^[:space:]]*|--un[a-z-]*)'
      if [[ "$bare" =~ $re_zip_tt ]]; then deny "zip -TT / --unzip-command (runs a program)"; fi ;;
    file)
      re_file_c='(^|[[:space:]])-[A-Za-z]*C'
      if [[ "$bare" =~ $re_file_c ]]; then deny "file -C (writes a compiled magic file)"; fi ;;
    cp|mv)
      re_cp_t='(^|[[:space:]])(-[A-Za-z]*t|--t[a-z-]*)'
      if [[ "$bare" =~ $re_cp_t ]]; then deny "cp / mv -t / --target-directory (give the destination as the last argument)"; fi ;;
  esac

  # ---- `which <name>` is a pure existence check; exempt it before the interpreter rules
  re_which='^[[:space:]]*which[[:space:]]+(-a[[:space:]]+)?[A-Za-z0-9_.-]+([[:space:]]+2>/dev/null)?[[:space:]]*$'
  if [[ "$bare" =~ $re_which ]]; then continue; fi

  # ---- interpreters: node and python3 only for the documented invocations
  re_node="${W}(node|nodejs)([[:space:]]|$)"
  if [[ "$bare" =~ $re_node ]]; then
    re_node_ok='^[[:space:]]*node[[:space:]]+(scripts/(export-pdf|export-pptx|make-assets-index|validate-pending|prepare-publish)\.mjs([[:space:]]|$)|--check[[:space:]]+[^[:space:]-][^[:space:]]*[[:space:]]*$|(--version|-v)[[:space:]]*$)'
    if ! [[ "$bare" =~ $re_node_ok ]]; then deny "node: only scripts/export-pdf.mjs, scripts/export-pptx.mjs, scripts/make-assets-index.mjs, scripts/validate-pending.mjs, scripts/prepare-publish.mjs, --check <file>, --version"; fi
  fi
  re_py="${W}python[0-9.]*([[:space:]]|$)"
  if [[ "$bare" =~ $re_py ]]; then
    re_py_ok='^[[:space:]]*python3?[0-9.]*[[:space:]]+(-m[[:space:]]+http\.server[[:space:]]+[0-9]+[[:space:]]+--bind[[:space:]]+127\.0\.0\.1[[:space:]]+--directory[[:space:]]+artifacts/?[[:space:]]*$|(--version|-V)[[:space:]]*$)'
    if ! [[ "$bare" =~ $re_py_ok ]]; then deny "python: only 'python3 -m http.server <port> --bind 127.0.0.1 --directory artifacts' or --version"; fi
  fi
  re_shell="${W}(sh|bash|zsh|dash|ksh|fish|csh|tcsh|osascript|perl|ruby|php|deno|bun|tclsh|lua|swift|Rscript|awk|gawk|nawk|mawk|jq)([[:space:]]|$)"
  if [[ "$bare" =~ $re_shell ]]; then
    re_selftest='^[[:space:]]*bash[[:space:]]+(PROJECT_DIR/)?\.claude/hooks/test-guard\.sh[[:space:]]*$'
    if ! [[ "$cmd" =~ $re_selftest ]]; then deny "shell / script interpreter (only 'bash .claude/hooks/test-guard.sh' is allowed)"; fi
  fi

  # ---- package managers, build tools, nested agents
  re_pkg="${W}(npm|npx|yarn|pnpm|bun|pip|pip3|pipx|uv|brew|port|gem|cargo|go|make|cmake|docker|podman|nix)([[:space:]]|$)"
  if [[ "$bare" =~ $re_pkg ]]; then deny "package manager / build tool"; fi
  re_claude="${W}claude([[:space:]]|$)"
  if [[ "$bare" =~ $re_claude ]]; then
    re_claude_ok='^[[:space:]]*claude[[:space:]]+(mcp[[:space:]]+list|--version|-v)[[:space:]]*$'
    if ! [[ "$bare" =~ $re_claude_ok ]]; then deny "claude: only 'claude mcp list' and --version"; fi
  fi

  # ---- network / remote tools
  re_net="${W}(wget|nc|ncat|netcat|socat|ssh|scp|sftp|rsync|telnet|ftp|tftp|openssl|dig|nslookup|host|ping|traceroute|networksetup|scutil|aria2c|http|https|httpie|lynx|w3m|links)([[:space:]]|$)"
  if [[ "$bare" =~ $re_net ]]; then deny "network tool"; fi

  # ---- system state, clipboard, keychain, in-place editors
  re_sys="${W}(dd|truncate|install|ln|chmod|chown|chflags|xattr|crontab|launchctl|defaults|shred|mkfifo|mount|umount|diskutil|hdiutil|security|pbcopy|pbpaste|screencapture|tee|kill|killall|reboot|shutdown|halt|systemctl|service|automator|plutil|sqlite3|patch|ed|ex|vi|vim|nano|emacs)([[:space:]]|$)"
  if [[ "$bare" =~ $re_sys ]]; then deny "system / clipboard / keychain / editor command"; fi
  re_sed_i="${W}sed[[:space:]]+([^[:space:]]+[[:space:]]+)*(-[a-zA-Z]*i|--in-place)"
  if [[ "$bare" =~ $re_sed_i ]]; then deny "sed -i"; fi
  re_pkill="${W}pkill([[:space:]]|$)"
  if [[ "$bare" =~ $re_pkill ]]; then
    re_pkill_ok='^[[:space:]]*pkill[[:space:]]+-f[[:space:]]+http\.server\.[0-9]+[[:space:]]*$'
    if ! [[ "$bare" =~ $re_pkill_ok ]]; then deny "pkill: only 'pkill -f http.server.<port>'"; fi
  fi

  # ---- secrets to stdout
  re_env="${W}(printenv|env|set|export|declare|typeset|compgen)([[:space:]]|$)"
  if [[ "$bare" =~ $re_env ]]; then deny "environment dump"; fi
  re_echo_tok='(echo|printf).*\$\{?[A-Z_]*(TOKEN|SECRET|KEY|PASS|PWD|HOME)'
  if [[ "$bare" =~ $re_echo_tok ]]; then deny "printing a secret-looking variable"; fi
  re_b64='base64[[:space:]]+(-d|-D|--decode)|xxd[[:space:]]+-r'
  if [[ "$bare" =~ $re_b64 ]]; then deny "base64 / hex decode"; fi

  # ---- redirects: the only allowed targets are /dev/null and other descriptors (BEL = the '&' of 2>&1, &>)
  redir="$seg"
  re_redir_ok="[0-9]?${BEL}?>>?[[:space:]]*(/dev/null|${BEL}[0-9]+)"
  while [[ "$redir" =~ $re_redir_ok ]]; do redir="${redir/"${BASH_REMATCH[0]}"/ }"; done
  if [[ "$redir" == *'>'* ]]; then deny "redirect to a file (use the Write tool)"; fi

  # ---- URLs only in curl / open / xdg-open segments (checked below)
  re_url='[A-Za-z][A-Za-z0-9+.-]*://'
  re_url_cmd="${W}(curl|open|xdg-open)([[:space:]]|$)"
  if [[ "$bare" =~ $re_url ]] && ! [[ "$bare" =~ $re_url_cmd ]]; then deny "URL in a command that does not take one"; fi

  # ---- curl: one allowlisted URL, GET only, output only under artifacts/ingested/
  re_curl="${W}curl([[:space:]]|$)"
  if [[ "$bare" =~ $re_curl ]]; then
    re_curl_pos='^[[:space:]]*curl[[:space:]]'
    if ! [[ "$seg" =~ $re_curl_pos ]] || (( segidx > 0 )); then deny "curl must be the first command (nothing piped into it)"; fi
    c="$seg"
    re_figma='https://api\.figma\.com/[^[:space:]]*'
    re_local='http://127\.0\.0\.1(:[0-9]+)?(/[^[:space:]]*)?'
    while [[ "$c" =~ $re_figma ]]; do c="${c/"${BASH_REMATCH[0]}"/ ALLOWED_URL }"; done
    while [[ "$c" =~ $re_local ]]; do c="${c/"${BASH_REMATCH[0]}"/ ALLOWED_URL }"; done
    re_q='"[^"]*"|'"'"'[^'"'"']*'"'"
    while [[ "$c" =~ $re_q ]]; do c="${c/"${BASH_REMATCH[0]}"/ QSTR }"; done
    urls=0; outs=0; expect=""; hdr=0; loc=0
    read -r -a toks <<< "$c"
    for t in "${toks[@]:1}"; do
      if [[ -n "$expect" ]]; then
        case "$expect" in
          H) [[ "$t" == QSTR || "$t" != -* ]] || deny "curl -H value";;
          o) [[ "$t" == artifacts/ingested/* ]] || deny "curl -o: output must be under artifacts/ingested/";;
        esac
        expect=""; continue
      fi
      case "$t" in
        ALLOWED_URL) urls=$((urls + 1)) ;;
        -H) expect=H; hdr=1 ;;
        -o) expect=o; outs=$((outs + 1)) ;;
        -L|-sSL|-sSfL|-sL|--location) loc=1 ;;
        -s|-S|-sS|-Ss|-I|-sI|-f|-sSf|-sf|--silent|--show-error|--head|--fail) ;;
        *) deny "curl: argument '$t' is not allowed (allowed: one https://api.figma.com/ or http://127.0.0.1:<port>/ URL, -s -S -I -L -f, -H <quoted>, -o artifacts/ingested/<file>)" ;;
      esac
    done
    if (( urls != 1 )); then deny "curl: exactly one allowlisted URL required"; fi
    if (( outs > 1 )); then deny "curl: more than one -o"; fi
    if (( hdr && loc )); then deny "curl: -L together with -H (a redirect re-sends the header, such as the Figma token, to the new host)"; fi
  fi

  # ---- open / xdg-open: only .html inside the project, or the local server
  re_open="${W}(open|xdg-open)([[:space:]]|$)"
  if [[ "$bare" =~ $re_open ]]; then
    re_open_ok='^[[:space:]]*(open|xdg-open)[[:space:]]+(file://"PROJECT_DIR/[^"]*\.html?([?#][^"]*)?"|"file://PROJECT_DIR/[^"]*\.html?([?#][^"]*)?"|file://PROJECT_DIR/[^[:space:]"'"'"']*\.html?([?#][^[:space:]"'"'"']*)?|"?http://127\.0\.0\.1:[0-9]+(/[^[:space:]"]*)?"?)[[:space:]]*$'
    if ! [[ "$seg" =~ $re_open_ok ]]; then deny "open: only file://<project>/…/*.html or http://127.0.0.1:<port>/… (one URL, nothing else)"; fi
  fi

  # ---- gh / git
  re_gh="${W}gh([[:space:]]|$)"
  if [[ "$bare" =~ $re_gh ]]; then
    # No comment, close, edit or review, and no --admin / --auto: those change shared state or carry
    # free text to a public repo. pr / issue commands must name this repo's fork explicitly.
    re_gh_ok='^[[:space:]]*gh[[:space:]]+(repo[[:space:]]+clone[[:space:]]|auth[[:space:]]+status([[:space:]]|$)|(--version|-v)[[:space:]]*$|pr[[:space:]]+(create|view|list|checks|diff|status|merge)([[:space:]]|$)|issue[[:space:]]+(view|list|create)([[:space:]]|$))'
    if ! [[ "$bare" =~ $re_gh_ok ]]; then deny "gh: only repo clone, auth status, pr create|view|list|checks|diff|status|merge, issue view|list|create, --version"; fi
    re_gh_admin='(^|[[:space:]])(--admin|--auto)([[:space:]=]|$)'
    if [[ "$bare" =~ $re_gh_admin ]]; then deny "gh --admin / --auto"; fi
    re_gh_prissue='^[[:space:]]*gh[[:space:]]+(pr|issue)[[:space:]]'
    if [[ "$bare" =~ $re_gh_prissue ]]; then
      # exactly the fork, as '--repo X' / '--repo=X' / '-R X'; after removing those, any other
      # repo flag (attached '-Rowner/repo', bundled '-dR', a second --repo) is refused
      re_gh_fork='(^|[[:space:]])(--repo|-R)([[:space:]]+|=)crywolfe/claude-code-design([[:space:]]|$)'
      re_gh_anyrepo='(^|[[:space:]])(--repo|-[A-Za-z]*R)'
      g="$bare"; nfork=0
      while [[ "$g" =~ $re_gh_fork ]]; do g="${g/"${BASH_REMATCH[0]}"/ }"; nfork=$((nfork + 1)); done
      if (( nfork == 0 )) || [[ "$g" =~ $re_gh_anyrepo ]]; then deny "gh pr / issue: pass --repo crywolfe/claude-code-design (and no other repo)"; fi
    fi
  fi
  re_git="${W}git([[:space:]]|$)"
  if [[ "$bare" =~ $re_git ]]; then
    re_git_cfg='^[[:space:]]*git[[:space:]]+config[[:space:]]'
    re_git_cfg_ok='^[[:space:]]*git[[:space:]]+config[[:space:]]+(--get|--list|-l|--show-origin)([[:space:]]|$)'
    # Anything that rewrites the working tree could swap in an older hook or settings file
    # (they are tracked in this repo), so only branch creation at HEAD is allowed from here,
    # plus returning to claude-design-features and fast-forwarding it from origin: that branch
    # only holds merged, CI-checked work, and hooks.sha256 moves together with the hooks.
    re_git_newbranch='^[[:space:]]*git[[:space:]]+(checkout[[:space:]]+-b|switch[[:space:]]+-c)[[:space:]]+[A-Za-z0-9._/-]+[[:space:]]*$'
    re_git_sync='^[[:space:]]*git[[:space:]]+((checkout|switch)[[:space:]]+claude-design-features|pull[[:space:]]+--ff-only[[:space:]]+origin[[:space:]]+claude-design-features)[[:space:]]*$'
    re_git_tree='^[[:space:]]*git[[:space:]]+(checkout|switch|restore|reset|stash|merge|rebase|revert|cherry-pick|apply|am|pull|clean|worktree|read-tree|update-index|update-ref|mv|rm|gc|prune)([[:space:]]|$)'
    re_git_bad='^[[:space:]]*git[[:space:]]+(-c[[:space:]]|-C[[:space:]]|--git-dir|--work-tree|--exec-path|clone|daemon|send-email|svn|instaweb|filter-branch|filter-repo|submodule|difftool|mergetool|bisect|credential|remote[[:space:]]+(add|set-url|rename)|(push|fetch|pull)[[:space:]]+.*(://|@))'
    if [[ "$bare" =~ $re_git_bad ]]; then deny "git: remote URLs, config writes, clone, submodules and external tools are not allowed"; fi
    if [[ "$bare" =~ $re_git_tree ]] && ! [[ "$bare" =~ $re_git_newbranch ]] && ! [[ "$bare" =~ $re_git_sync ]]; then deny "git: commands that rewrite the working tree (checkout, restore, reset, stash, merge, rebase, pull, apply, …) are not allowed here; only 'git checkout -b <name>' / 'git switch -c <name>', 'git checkout claude-design-features' and 'git pull --ff-only origin claude-design-features'. Switch branches or restore files in your own shell."; fi
    if [[ "$bare" =~ $re_git_cfg ]] && ! [[ "$bare" =~ $re_git_cfg_ok ]]; then deny "git config: read-only (--get, --list)"; fi
  fi

  # ---- zip / unzip
  re_zip="${W}zip([[:space:]]|$)"
  if [[ "$bare" =~ $re_zip ]]; then
    re_zip_ok='^[[:space:]]*zip[[:space:]]+(-[a-zA-Z0-9]+[[:space:]]+)*(handoff/|artifacts/)[^[:space:]]+([[:space:]]+(handoff/|artifacts/)[^[:space:]]+)*[[:space:]]*$'
    if ! [[ "$bare" =~ $re_zip_ok ]]; then deny "zip: archive and inputs must all be under handoff/ or artifacts/"; fi
  fi
  re_unzip="${W}unzip([[:space:]]|$)"
  if [[ "$bare" =~ $re_unzip ]]; then
    re_unzip_ok='^[[:space:]]*unzip[[:space:]]+(-p|-l|-Z)[[:space:]]'
    re_unzip_d='(^|[[:space:]])-[a-zA-Z]*d([[:space:]]|$)'
    if ! [[ "$bare" =~ $re_unzip_ok ]] || [[ "$bare" =~ $re_unzip_d ]]; then deny "unzip: only -p (to stdout) or -l (list) are allowed"; fi
  fi

  # ---- path arguments: writers stay inside the project and off protected files; readers stay inside the project.
  # Selected on $first (the allowlist above guarantees it is the real command word), so a command name
  # that appears as an argument ("rg git file") does not change the mode.
  mode=""
  case "$first" in
    cp|mv|mkdir|touch|zip|monolith|node) mode="$first" ;;
    # gh only writes local files when cloning; PR / issue text may name protected files freely
    gh) re_gh_clone='^[[:space:]]*gh[[:space:]]+repo[[:space:]]+clone[[:space:]]'
        if [[ "$bare" =~ $re_gh_clone ]]; then mode=gh; else mode=READ; fi ;;
    git|cat|head|tail|ls|rg|grep|fd|find|sort|uniq|cut|tr|wc|stat|diff|cmp|du|tree|shasum|md5|md5sum) mode=READ ;;
  esac
  if [[ -n "$mode" ]]; then
    read -r -a toks <<< "$seg"
    nonopt=(); skipnext=0
    re_redir_tok="^[0-9]?[&${BEL}]?>>?(/dev/null|[&${BEL}][0-9]+)?$"
    re_redir_bare="^[0-9]?[&${BEL}]?>>?$"
    for ((ti = 1; ti < ${#toks[@]}; ti++)); do
      t="${toks[$ti]}"
      if (( skipnext )); then skipnext=0; continue; fi
      # Output redirects are not arguments (the redirect rule above already limited them to
      # /dev/null and descriptors). They must not count as cp's last argument, or the real
      # destination would be checked as a source.
      if [[ "$t" =~ $re_redir_tok ]]; then
        if [[ "$t" =~ $re_redir_bare ]]; then skipnext=1; fi
        continue
      fi
      # Input redirects: a writer has no reason to read stdin from a file; a reader's '<file' is a read path
      if [[ "$t" == *'<'* ]]; then
        if [[ "$mode" != READ ]]; then deny "input redirect '<' in a command that writes files"; fi
        if ! path_ok "${t##*<}" READ; then deny "path argument '${t##*<}' is outside the project"; fi
        continue
      fi
      if [[ "$t" == -* ]]; then
        # an option's attached value (--out=path) is still a path for a writer
        if [[ "$mode" != READ && "$t" == --*=* ]]; then
          if ! path_ok "${t#*=}" "$mode"; then deny "option value '${t#*=}' is outside the project (or a protected file)"; fi
        fi
        continue
      fi
      nonopt+=("$t")
    done
    last=$(( ${#nonopt[@]} - 1 ))
    for ((ti = 0; ti < ${#nonopt[@]}; ti++)); do
      t="${nonopt[$ti]}"; m="$mode"
      if [[ "$mode" == cp || "$mode" == mv ]] && (( ti < last )); then
        # a source. cp may read from starters/ (write-protected); every other source is still
        # checked as a writer path, and mv removes its source, so it is always one.
        if [[ "$mode" == cp ]]; then
          case "${t//[\"\']/}" in starters/*|./starters/*) m=READ ;; esac
        fi
        # a directory destination (".", ".claude/", "scripts") receives <dest>/<basename of source>
        d="${nonopt[$last]//[\"\']/}"; d="${d%/}"; s="${t//[\"\']/}"; s="${s%/}"
        if ! path_ok "${d:-.}/${s##*/}" "$mode"; then deny "copying '$t' into '${nonopt[$last]}' would write a protected file"; fi
      fi
      if ! path_ok "$t" "$m"; then deny "path argument '$t' is outside the project (or a protected file)"; fi
    done
  fi
done <<< "$segs"

audit allow ""
exit 0
