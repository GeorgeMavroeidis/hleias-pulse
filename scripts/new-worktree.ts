/**
 * Create a git worktree for a task, wired up so it can actually run.
 *
 *   npm run worktree:new -- fix/story-expiry     # new branch off origin/main
 *   npm run worktree:new -- chore/admin-audit-trail   # existing branch
 *
 * WHY WORKTREES. A git clone has one working directory, one HEAD and one
 * staging index (`.git/index`). Two agents in one clone therefore share all
 * three, and that is not a theoretical problem: on 2026-09-07 four sessions
 * worked in this repo at once and a `git restore --staged` scoped to one
 * session's own paths silently dropped another session's staged file, because
 * the index records content per path with no notion of who staged it. The
 * resulting commit went out missing a file and failed the CI gate it had just
 * introduced. A second session then checked out a new branch in the shared
 * tree, so every other session's next commit would have landed on a branch it
 * never chose.
 *
 * A worktree is a second working directory with its OWN HEAD and OWN index,
 * sharing the one object store. So the collisions above become impossible
 * rather than something people have to remember to avoid.
 *
 * WHY OUTSIDE THE REPO. Worktrees live in a sibling `worktrees/` directory, not
 * under the repo. `eslint .` would lint a worktree nested inside the repo, and
 * `npm run format` (`prettier --write .`) would rewrite files inside it.
 * Keeping them outside needs no ignore rules and cannot be committed by
 * accident.
 */
import { execFileSync } from "node:child_process";
import { existsSync, symlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";

function git(...args: string[]) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

/**
 * The main working directory, found from git rather than assumed.
 *
 * `--git-common-dir` is the shared `.git` every worktree points at, so this
 * resolves to the same place whether it is run from the main tree or from
 * inside another worktree.
 */
function mainWorktree() {
  return resolve(git("rev-parse", "--path-format=absolute", "--git-common-dir"), "..");
}

/** A branch name makes a poor directory name: `fix/story-expiry` is two levels. */
function directoryFor(branch: string) {
  return branch.replace(/^(feat|fix|chore|docs|perf|refactor|test)\//, "").replace(/\//g, "-");
}

function main() {
  const branch = process.argv[2];
  if (!branch) {
    console.error("usage: npm run worktree:new -- <branch-name>");
    console.error("  e.g. npm run worktree:new -- fix/story-expiry");
    process.exit(1);
  }

  const root = mainWorktree();
  const target = join(resolve(root, ".."), "worktrees", directoryFor(branch));

  if (existsSync(target)) {
    console.error(`${target} already exists. Remove it first:`);
    console.error(`  git worktree remove ${target}`);
    process.exit(1);
  }

  // Fetch so a new branch forks from what is actually on the remote, not from
  // however stale this clone's main happens to be.
  console.log("• fetching origin");
  git("fetch", "origin");

  const exists = (() => {
    try {
      git("rev-parse", "--verify", `refs/heads/${branch}`);
      return true;
    } catch {
      return false;
    }
  })();

  console.log(`• worktree ${target}`);
  if (exists) {
    git("worktree", "add", target, branch);
  } else {
    git("worktree", "add", target, "-b", branch, "origin/main");
  }

  // node_modules and .env are gitignored, so a fresh worktree has neither and
  // cannot run a single check without them. Symlinks rather than copies: one
  // dependency tree, one credentials file, no drift. A branch that changes
  // package.json needs its own `npm install` here -- it will say so loudly.
  for (const name of ["node_modules", ".env"]) {
    const source = join(root, name);
    if (existsSync(source) && !existsSync(join(target, name))) {
      symlinkSync(source, join(target, name));
      console.log(`• linked ${name}`);
    }
  }

  console.log(`\nReady. ${basename(target)} is on ${branch}.\n\n  cd ${target}\n`);
}

main();
