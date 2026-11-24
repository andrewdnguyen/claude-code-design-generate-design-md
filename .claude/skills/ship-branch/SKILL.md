---
name: ship-branch
description: Push the current branch, open a PR into claude-design-features on the fork, wait for CI, and merge it only after the user approves. Use when the user says "merge it", "ship this branch", "push and merge", or "get this into main".
---

# ship-branch

Gets a finished branch into `claude-design-features` (the fork's default branch, what the user calls "main") inside the limits of `.claude/hooks/guard-bash.sh`.

The merge is a human decision. This skill never merges without an explicit yes from the user in this turn, never passes `--admin` or `--auto`, and never merges with failing or pending checks. Branch protection on GitHub (required `checks` status check from the `security` workflow) is the backstop if any of this is skipped.

## Sandbox

By default the Bash sandbox refuses writes inside `.git/` and hides `gh`'s login, so `git checkout -b`, `git add`, `git commit`, `git push` and every `gh` command fail with `Operation not permitted` (or `failed to read configuration`). That is expected in a fresh checkout or fork. When a step fails that way:
- Don't retry it, change its form, or look for another route.
- Prepare everything it needs (message and body files under `artifacts/`), then give the user the exact command as `! <command>` and wait for its output before the next step.
- Steps that only read (`git status`, `git log`, `git diff`, the self-test) still run here.

A maintainer can let these exact commands run outside the sandbox on their own machine with `sandbox.excludedCommands` in the gitignored `.claude/settings.local.json` (see CLAUDE.md, "Maintainer settings"). The guard and the ask rules still apply to them. Never suggest that file to anyone as a fix for a single failed step.

## Steps

1. `git branch --show-current` and `git status --short`. If the current branch is `claude-design-features`, stop and ask for a branch name (`git checkout -b <name>` is the only branch switch the guard allows).
2. `git log --oneline --no-color claude-design-features..HEAD` and say what will ship. If it's empty, there's nothing to merge.
3. `bash .claude/hooks/test-guard.sh`. If it reports any failure, stop and show the failing lines. Do not push a branch that breaks the guard.
4. Committing, if needed: the guard reads the `<...>` around a co-author email as a redirect. Write the message with the Write tool to `artifacts/commit-msg.txt` (gitignored), then `git commit -F artifacts/commit-msg.txt`.
5. `git push origin <branch>` (settings.json asks the user before every push). Don't pass `-u`: it writes `.git/config`, which the sandbox denies. If the user wants upstream tracking, they run `! git branch --set-upstream-to=origin/<branch>`.
6. Write the PR description with the Write tool to `artifacts/pr-body.md` (gitignored), then `gh pr create --repo crywolfe/claude-code-design --base claude-design-features --head <branch> --title "..." --body-file artifacts/pr-body.md`
   - Always pass `--repo crywolfe/claude-code-design`; the guard refuses `gh pr` / `gh issue` without it.
   - No body file outside the project. End the body with `🤖 Generated with Claude Code`.
   - The guard reads the whole command line, so a title containing a blocked command name as a word (`security`, `open`, `kill`, `install`, `patch`, …) is refused. Reword the title; keep such words in the body file.
   - Don't use the word "open" as a bare argument (for example `--state open`), because the guard parses it as the `open` command.
7. `gh pr checks <n> --repo crywolfe/claude-code-design`. If any check failed, stop and report it. If checks are still pending, tell the user and stop; they can say "merge it" again once CI finishes.
8. Review gate. Run `git diff --stat claude-design-features...HEAD` and `git diff --name-only claude-design-features...HEAD`. List any changed file under these policy paths separately and first:
   `CLAUDE.md`, `.claude/hooks/`, `.claude/settings*.json`, `.claude/skills/`, `.claude/commands/`, `.mcp.json`, `scripts/`, `starters/`, `plugin/`, `tools/`, `.github/`, `package.json`, `package-lock.json`.
   Then ask with `AskUserQuestion`: "Merge PR #<n> into claude-design-features?" with options "Merge" and "Don't merge". If policy paths changed, put "Policy files changed: review the PR diff on GitHub before merging" in the question text. Anything other than an explicit "Merge" means stop.
9. `gh pr merge <n> --repo crywolfe/claude-code-design --merge`. Use a merge commit so the branch's commits keep their SHAs and `git branch -d` works locally later. Don't pass `--delete-branch` (it checks out locally), `--admin` or `--auto` (the guard refuses both).
10. Confirm with `gh pr view <n> --repo crywolfe/claude-code-design --json state,mergedAt,mergeCommit`.
11. `git push origin --delete <branch>`

## What the user has to run

The guard blocks `git checkout <existing>` and `git pull`. Tell the user to run:

```
! git checkout claude-design-features
! git pull
! git branch -d <branch>
```
