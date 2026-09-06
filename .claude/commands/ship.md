---
description: Automate the CLAUDE.md git workflow — start a branch off main, or finish by committing, pushing, and opening a PR. Never merges.
argument-hint: start <feat|fix|chore|docs>/<short-name>  |  finish ["commit message"]
allowed-tools: Bash(git:*), Bash(gh:*)
---

You are running `/ship` for this repo. Follow the workflow documented in `CLAUDE.md` under
"Workflow — non-negotiable" exactly. Hard rules that apply to every mode below:

- `main` is the only long-lived branch. **Never commit or push directly to it.**
- **Never merge, approve, or close a PR.** This command's job ends at `gh pr create`.
- Never force-push.
- Never stage or commit `.env`, credentials, service-role keys, or API tokens — if
  `git status` shows one, stop and warn instead of adding it.
- If `git config user.email` is unset, stop and ask which of the two owners (see
  CLAUDE.md's "Which of the two of us are you working for?") this session is for —
  do not guess and do not commit under a machine-local identity.

Arguments passed to this command: $ARGUMENTS

Read the first word of `$ARGUMENTS` as the mode and act accordingly. If it is neither
`start` nor `finish`, print this usage and stop:

```
/ship start <feat|fix|chore|docs>/<short-name>
/ship finish ["optional commit message"]
```

## Mode: start

Expected form: `start <feat|fix|chore|docs>/<short-name>`

1. Validate the branch name after `start` matches `^(feat|fix|chore|docs)/[a-z0-9-]+$`
   (lowercase, hyphen-separated). If it doesn't, tell the user how to fix it and stop —
   do not silently rewrite it.
2. Run `git status --porcelain`. If it shows changes, stop and tell the user to commit,
   stash, or discard them first (never stash/discard automatically).
3. This may run inside a git worktree where the literal `main` branch is checked out
   elsewhere (`git worktree list` shows it), so `git switch main` would fail. Do the
   equivalent that always works:
   ```
   git fetch origin
   git switch -c <type>/<short-name> origin/main
   ```
   If a local `main` branch is safely switchable in this checkout instead (not checked
   out in another worktree), the plain documented form is also fine:
   ```
   git fetch origin && git switch main && git pull --ff-only origin main
   git switch -c <type>/<short-name>
   ```
4. Confirm the new branch to the user and stop. Do not make any other changes.

## Mode: finish

Expected form: `finish ["optional commit message"]`

1. Run `git branch --show-current`. If it is `main`, refuse — CLAUDE.md forbids
   committing to main directly. Tell the user to run `/ship start ...` first.
2. Run `git status --porcelain` and `git diff` (plus `git diff --staged`) to see what
   changed. If there is nothing to commit, say so and stop.
3. Review the changed/untracked file list. Stage the files that belong to this task by
   name — never a blanket `git add -A` or `git add .` without first checking the list,
   and never stage anything that looks like a secret (`.env`, `*.pem`, credentials,
   tokens).
4. Determine the commit message:
   - If the user supplied one after `finish`, use it as-is.
   - Otherwise draft a concise, imperative one from the staged diff, matching the style
     of recent `git log --oneline` entries in this repo.
5. Commit with the message via a heredoc so formatting survives, and credit this
   session:
   ```
   git commit -m "$(cat <<'EOF'
   <commit message>

   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   EOF
   )"
   ```
6. Push and set upstream: `git push -u origin <current-branch>`.
7. Open a PR into `main` with `gh pr create`, using a heredoc body with a `## Summary`
   and `## Test plan` section, e.g.:
   ```
   gh pr create --title "<short title, under 70 chars>" --body "$(cat <<'EOF'
   ## Summary
   - <what changed and why>

   ## Test plan
   - [ ] <how to verify>

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```
8. Report the PR URL back to the user. Do not merge it, approve it, or enable
   auto-merge — a human reviews and merges from here, and branch protection on `main`
   (1 review + code owner review + CI) requires that anyway.
