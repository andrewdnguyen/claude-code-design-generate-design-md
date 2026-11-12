---
name: ship-branch
description: Push the current branch, open a PR into claude-design-features on the fork, merge it, and delete the remote branch. Use when the user says "merge it", "ship this branch", "push and merge", or "get this into main".
---

# ship-branch

Gets a finished branch into `claude-design-features` (the fork's default branch, what the user calls "main") inside the limits of `.claude/hooks/guard-bash.sh`.

## Steps

1. `git branch --show-current` and `git status --short`. If the current branch is `claude-design-features`, stop and ask for a branch name (`git checkout -b <name>` is the only branch switch the guard allows).
2. `git log --oneline --no-color claude-design-features..HEAD` and say what will ship. If it's empty, there's nothing to merge.
3. Committing, if needed: the guard reads the `<...>` around a co-author email as a redirect. Write the message with the Write tool to `artifacts/commit-msg.txt` (gitignored), then `git commit -F artifacts/commit-msg.txt`.
4. `git push -u origin <branch>`
5. `gh pr create --repo crywolfe/claude-code-design --base claude-design-features --head <branch> --title "..." --body "..."`
   - Always pass `--repo` explicitly (otherwise gh may pick `upstream`).
   - No URLs in the body (guard blocks them), and no body file outside the project. End the body with `🤖 Generated with Claude Code`.
   - Don't use the word "open" as a bare argument (for example `--state open`), because the guard parses it as the `open` command.
6. `gh pr merge <n> --repo crywolfe/claude-code-design --merge`. Use a merge commit so the branch's commits keep their SHAs and `git branch -d` works locally later. Don't pass `--delete-branch` (it checks out locally).
7. Confirm with `gh pr view <n> --repo crywolfe/claude-code-design --json state,mergedAt,mergeCommit`.
8. `git push origin --delete <branch>`

## What the user has to run

The guard blocks `git checkout <existing>` and `git pull`. Tell the user to run:

```
! git checkout claude-design-features
! git pull
! git branch -d <branch>
```
