# Hleias Pulse Codex Workflow

These instructions apply to every Codex session in this repository.

## Session startup

- Read `CLAUDE.md` and `ROADMAP.md` completely before planning project work.
- Read `SECURITY.md` before work involving application code, data, authentication,
  database changes, privacy, deployment, or external services.
- Treat those files as the project handbook. If instructions conflict, follow the
  higher-priority system/developer/user instruction and call out the conflict.

## Two-layer change workflow

This workflow applies to any request that would change repository files, Git
state, a database, a deployment, or another external system. Explanations,
status questions, and read-only investigation can be answered directly.

### Layer 1: plan and human decision

1. Explore with read-only actions first and challenge unsafe or incorrect
   assumptions.
2. Present a decision-complete implementation plan covering scope, behavior,
   interfaces, risks, validation, and rollout where relevant.
3. Stop without making changes until the user explicitly approves that plan or
   explicitly says to implement it.
4. Treat approval as authorization only for the agreed scope. Ask for a new
   decision if implementation requires a material scope change or crosses a
   human-only guardrail in `CLAUDE.md`.

### Layer 2: implementation and engineering-manager gate

1. Implement approved work in a dedicated worktree and feature branch.
2. Run the relevant checks and inspect the complete proposed commit.
3. Before **every** commit, spawn exactly one custom `engineering_manager`
   subagent. Do not substitute a generic reviewer or add a reviewer swarm.
4. Give the manager the approved plan, base branch/ref, complete proposed diff,
   affected-file list, validation results, and any known limitations. Wait for
   its final verdict.
5. A `NEEDS WORK` verdict blocks the commit when it identifies a requirement
   mismatch, probable bug or regression, security/privacy/data-loss risk,
   authentication or RLS problem, unsafe migration, exposed secret, missing
   essential validation, or unrelated change. Fix blockers within the approved
   scope, rerun relevant checks, and request another manager review.
6. Advisory findings do not block the commit, but preserve them for the final
   report. Never invent changes merely to obtain a clean review.
7. If a required fix expands the approved scope or crosses a human-only
   guardrail, stop and ask the user instead of fixing it automatically.
8. Only after a `PASS` verdict: commit with explicit pathspecs, verify the
   immutable commit, push the feature branch, and open or update its pull
   request. Never merge, deploy, force-push, rewrite history, delete branches,
   or push directly to `main` without the separate approval required by
   `CLAUDE.md`.

## Final report

After approved implementation work, report in plain English:

- what changed;
- the engineering manager's `PASS` or `NEEDS WORK` verdict;
- blocking problems found and corrected;
- remaining non-blocking risks or limitations;
- checks run and their outcomes;
- the commit and pull-request link, when created.

Do not describe work as finished if the manager gate, required checks, commit,
push, or pull request is still outstanding.
