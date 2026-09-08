---
description: Automate the CLAUDE.md git workflow — start a branch off main, or finish by committing, pushing, and opening a PR. Never merges.
argument-hint: start <feat|fix|chore|docs>/<short-name>  |  finish ["commit message"]
allowed-tools: Bash(git:*), Bash(gh:*), Bash(npm:*)
---

You are running `/ship` for this repo. Follow the workflow in `CLAUDE.md` under
"Git Automation" exactly. Hard rules for every mode below:

- `main` is the only long-lived branch. **Never commit or push directly to it.**
- **Never merge, approve, or close a PR.** This command's job ends at `gh pr create`.
  Merging into `main` is Mavroeidis's call and a human clicks it — see CLAUDE.md
  "Git Automation".
- Never force-push. Never rewrite history.
- Never stage or commit `.env`, credentials, service-role keys, or API tokens.
- If `git config user.email` is unset, stop and ask which maintainer this session is
  for — both are called Giorgos, so the name settles nothing (CLAUDE.md "Team Notes").
  An unset identity produces commits GitHub cannot link to either account.

Arguments passed to this command: $ARGUMENTS

Read the first word of `$ARGUMENTS` as the mode. If it is neither `start` nor
`finish`, print this usage and stop:

```
/ship start <feat|fix|chore|docs>/<short-name>
/ship finish ["optional commit message"]
```

---

## Step 0 — preflight, in BOTH modes, before anything else

Run it first and read every line:

```
npm run preflight
```

It exits non-zero on: HEAD on `main` or detached, unset git identity, a
credential-looking file in the tree, **a push credential that no longer works**,
and migrations that would apply out of order or collide with another branch.

If it fails, **stop and report** — do not work around it. Two of its checks exist
because working around them cost a day:

- **push** — the credential silently changed mid-session on 2026-09-07 and nobody
  noticed for four hours. Six commits piled up on a branch that could not be
  pushed. This check answers that in one round trip, before any other effort.
- **migrations** — two branches independently claimed version `20260907140000`.
  Whichever merged second would have been renumbered under pressure or applied out
  of order.

A `WARN` line does not stop you, but say it out loud to the user before continuing.

---

## Mode: start

Expected form: `start <feat|fix|chore|docs>/<short-name>`

1. Validate the name after `start` against `^(feat|fix|chore|docs)/[a-z0-9-]+$`. If it
   does not match, say how to fix it and stop — do not silently rewrite it.
2. `git status --porcelain`. If it shows changes, stop and tell the user to commit,
   stash, or discard them. Never stash or discard automatically — in a shared
   checkout those changes may belong to another session.
3. Branch off the remote, which works even when `main` is checked out in another
   worktree:
   ```
   git fetch origin
   git switch -c <type>/<short-name> origin/main
   ```
4. Confirm the new branch and stop.

**If other sessions share this checkout**, say so: `git switch` moves HEAD for all of
them, and every commit they make afterwards lands on your branch. On 2026-09-07 that
stranded five commits off the PR that was supposed to carry them. Offer
`git worktree add` instead.

---

## Mode: finish

Expected form: `finish ["optional commit message"]`

1. `git branch --show-current`. If it is `main`, refuse.
2. `git status --porcelain` and `git diff` (plus `git diff --staged`) to see what
   changed. Nothing to commit → say so and stop.
3. Decide which files belong to this task **by name**. Never `git add -A` or
   `git add .`.

   **In a shared checkout, assume some changed files are not yours.** Check
   `git log --oneline -3` and ask the user if a path looks unrelated.

4. Determine the commit message: use the user's if supplied, else draft a concise
   imperative one from the diff, matching recent `git log --oneline` style.

5. **Commit with an explicit pathspec.**

   New files first, if there are any — a pathspec commit can only include paths git
   already tracks, so an untracked file must be added by name. Never `-A`, never `.`:

   ```
   git add <new-path> [<new-path>...]
   ```

   Then commit by pathspec, listing every path this commit should contain:

   ```
   git commit -- <path> [<path>...] -m "$(cat <<'EOF'
   <commit message>

   Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
   EOF
   )"
   ```

   Why this form, and why it matters more than it looks: the index is **shared
   mutable state**. On 2026-09-07 two sessions staged the same path, one ran
   `git restore --staged` on "its own" files, and that silently dropped the other
   session's staged blob — which shipped a commit missing a file, failing the very CI
   gate it introduced. **A per-path index command cannot tell whose content it is
   dropping.** `git commit -- <pathspec>` builds the commit from the pathspec and
   never consults ambient index state.

   **Never run `git restore --staged` here.** If the index looks wrong, commit by
   pathspec and ignore it.

6. **Verify the commit's tree, not the index:**

   ```
   git show --stat HEAD
   ```

   Confirm it contains exactly the intended files and nothing else. A tree is
   immutable; the index is not. If an unexpected file is in there, stop and tell the
   user before pushing.

7. **Run the gate before pushing, not after:**

   ```
   npm run lint && npm run check:secrets && npm run typecheck && npm run build
   ```

   A commit that fails the gate it introduces is exactly what reached `main` on
   2026-09-07 in `48a9190`. If any step fails, stop — do not push.

8. Push: `git push -u origin <current-branch>`.

9. Open the PR into `main`:

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

   **Put merge constraints in the body where the merger will see them**, not only in
   chat. If any commit on the branch is individually broken and repaired by a later
   one, say **squash-merge, not rebase-merge**, and why. If two commits must land
   together, say so. On 2026-09-07 that warning existed only in chat and the PR was
   merged six minutes after opening, putting two commits on `main` that each fail
   their own typecheck gate.

10. Report the PR URL. **Do not merge, approve, or enable auto-merge.**
