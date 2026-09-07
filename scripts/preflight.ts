/**
 * The checks that have to pass before a branch is pushed.
 *
 * Every check below exists because it actually went wrong on 2026-09-07, when
 * four sessions worked in one shared checkout and four separate things broke.
 * None of them was a hard failure at the time — each was silent, and each was
 * found hours later by reading git rather than by anything shouting.
 *
 *   npm run preflight              # full, including the remote credential probe
 *   npm run preflight -- --local   # skip anything that talks to the network
 *   npm run preflight -- --expect chore/my-branch
 *
 * Exit code is 0 only if every check passed. Warnings do not fail the run: a
 * warning here means "a human should look", not "this is broken".
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

import { readEnvValue } from "./lib/env";
import { createPgSession } from "./lib/pg";

type Level = "pass" | "warn" | "fail";

const results: { level: Level; name: string; detail: string }[] = [];

function record(level: Level, name: string, detail: string) {
  results.push({ level, name, detail });
}

/** Run a git command and return stdout, or null if it failed. */
function git(...args: string[]) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

const argv = process.argv.slice(2);
const localOnly = argv.includes("--local") || Boolean(process.env.CI);
const expectIndex = argv.indexOf("--expect");
const expectedBranch = expectIndex >= 0 ? argv[expectIndex + 1] : undefined;

/**
 * 1. Which branch is this, really?
 *
 * Four sessions shared one working tree, so they shared one HEAD. One of them
 * checked out a different branch and every commit after that landed there
 * silently — five commits, including a security fix, never reached the PR that
 * was supposed to carry them. Nothing warned anybody; both refs pointed at the
 * same commit at the moment of the switch, so it looked like nothing had
 * happened.
 */
function checkBranch() {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (!branch) return record("fail", "branch", "Not inside a git repository.");

  if (branch === "main") {
    return record(
      "fail",
      "branch",
      "HEAD is on main. CLAUDE.md forbids committing or pushing to main directly — " +
        "branch first.",
    );
  }
  if (branch === "HEAD") {
    return record("fail", "branch", "Detached HEAD. Check out a branch before pushing.");
  }
  if (expectedBranch && branch !== expectedBranch) {
    return record(
      "fail",
      "branch",
      `HEAD is on '${branch}' but '${expectedBranch}' was expected. ` +
        "Someone may have moved HEAD in a shared checkout.",
    );
  }
  record("pass", "branch", `on '${branch}'${expectedBranch ? " (as expected)" : ""}`);
}

/**
 * 2. Does git know who this is?
 *
 * CLAUDE.md: both maintainers are called Giorgos, so a first name settles
 * nothing, and an unset identity produces commits attributed to a machine-local
 * address that GitHub cannot link to either account.
 */
function checkIdentity() {
  const email = git("config", "user.email");
  if (!email) {
    return record(
      "fail",
      "identity",
      "git config user.email is unset. Commits would be attributed to a machine-local " +
        "address. Set it to whichever maintainer this session is for.",
    );
  }
  record("pass", "identity", email);
}

/**
 * 3. Is anything secret about to be committed?
 *
 * `npm run check:secrets` scans committed content. This is the cheaper,
 * earlier question: is a credential file sitting staged or untracked right now,
 * one `git add` away from being included?
 */
function checkNoSecretsStaged() {
  const status = git("status", "--porcelain");
  if (status === null) return record("fail", "secrets", "Could not read git status.");

  const suspicious = status
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter((path) =>
      /(^|\/)\.env($|\.)|\.pem$|(^|\/)(id_rsa|id_ed25519)$|service[_-]?role/i.test(path),
    );

  if (suspicious.length) {
    return record(
      "fail",
      "secrets",
      `Credential-looking paths in the working tree: ${suspicious.join(", ")}. ` +
        "Do not stage these.",
    );
  }
  record("pass", "secrets", "no credential-looking paths in the working tree");
}

/**
 * 4. Can this account actually push?
 *
 * The GitHub credential changed mid-session and nothing noticed for four hours.
 * Five commits piled up on a branch that could not be pushed, and the work only
 * stopped when somebody tried. A dry run costs one round trip and answers it
 * before any other effort is spent.
 */
function checkPushCredential() {
  if (localOnly) {
    return record("warn", "push", "skipped (--local or CI) — remote credential not verified");
  }
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (!branch || branch === "HEAD" || branch === "main") return;

  try {
    execFileSync("git", ["push", "--dry-run", "origin", `HEAD:refs/heads/${branch}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    record("pass", "push", "credential accepted by origin");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const denied = /denied to ([\w-]+)/.exec(message);
    record(
      "fail",
      "push",
      denied
        ? `origin rejected the push: the active account is '${denied[1]}' and it has no write ` +
            "access. Run `gh auth status` — if the account with write access is already " +
            "logged in, `gh auth switch` to it; if it is not listed at all, `gh auth login`. " +
            "Do this before any more work: commits made now cannot be pushed."
        : `origin rejected a dry-run push: ${message.split("\n").find((l) => l.includes("fatal")) ?? message}`,
    );
  }
}

/** `20260907140000_name.sql` -> `20260907140000` */
function migrationVersion(path: string) {
  return /(\d{14})/.exec(path)?.[1] ?? null;
}

function migrationsOn(ref: string) {
  const out = git("ls-tree", "--name-only", ref, "supabase/migrations/");
  if (!out) return [];
  return out
    .split("\n")
    .filter((line) => line.endsWith(".sql"))
    .map((line) => ({ path: line, version: migrationVersion(line) }))
    .filter((m): m is { path: string; version: string } => Boolean(m.version));
}

/**
 * 5. Would these migrations apply in order?
 *
 * Supabase tracks applied migrations by their 14-digit version. Applying an
 * older-numbered migration after a newer one leaves a history that no longer
 * matches what actually ran, and rebuilding the database from migrations stops
 * being reliable.
 *
 * Two different problems, so two different verdicts:
 *
 *   FAIL  this branch adds a migration numbered at or below the newest one
 *         already on main. That is broken now, not later.
 *   FAIL  another unmerged branch claims the SAME version with a different
 *         filename. Whichever merges second gets renumbered under pressure or,
 *         worse, applied out of order. This happened on 2026-09-07: both
 *         `20260907140000_audit_log_survives_actor_deletion.sql` and
 *         `20260907140000_enforce_story_expiry_rls.sql` existed on separate
 *         branches, and it was caught by hand rather than by anything here.
 *   WARN  another unmerged branch is sitting on a migration numbered below
 *         ours. Merging in the wrong order creates the same mess — 130000
 *         pending on one branch while 160000 and 170000 were pending on another.
 *
 * The branch's own remote-tracking ref is skipped throughout: our own pushed
 * commits are not a competing branch.
 */
function checkMigrationOrder() {
  const mainMigrations = migrationsOn("origin/main");
  if (!mainMigrations.length) {
    return record("warn", "migrations", "could not read origin/main — is the fetch stale?");
  }

  const mainVersions = new Set(mainMigrations.map((m) => m.version));
  const newestOnMain = mainMigrations
    .map((m) => m.version)
    .sort()
    .at(-1)!;
  const ours = migrationsOn("HEAD").filter((m) => !mainVersions.has(m.version));

  if (!ours.length) {
    return record("pass", "migrations", "this branch adds none");
  }

  const belowMain = ours.filter((m) => m.version <= newestOnMain);
  if (belowMain.length) {
    return record(
      "fail",
      "migrations",
      `${belowMain.map((m) => m.version).join(", ")} sort at or below ${newestOnMain}, ` +
        "which is already on main. Renumber above it.",
    );
  }

  const oldestOfOurs = ours.map((m) => m.version).sort()[0];
  const ourPaths = new Map(ours.map((m) => [m.version, m.path]));
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  const ownUpstream = `refs/remotes/origin/${branch}`;

  const collisions: string[] = [];
  const earlier: string[] = [];
  // Local heads as well as remote ones. A branch committed here but never
  // pushed is invisible under refs/remotes, and that is not hypothetical:
  // chore/admin-audit-trail carried two unpushed migrations for a day while a
  // bad credential blocked every push.
  const refs =
    git("for-each-ref", "--format=%(refname)", "refs/remotes/origin", "refs/heads") ?? "";
  const ownHead = `refs/heads/${branch}`;

  for (const ref of refs.split("\n").filter(Boolean)) {
    if (
      ref === "refs/remotes/origin/main" ||
      ref === "refs/heads/main" ||
      ref === ownUpstream ||
      ref === ownHead ||
      ref.endsWith("/HEAD")
    ) {
      continue;
    }
    const short = ref.replace("refs/remotes/", "");
    const pending = migrationsOn(ref).filter((m) => !mainVersions.has(m.version));

    for (const theirs of pending) {
      const ourPath = ourPaths.get(theirs.version);
      if (ourPath && ourPath !== theirs.path) {
        collisions.push(`${theirs.version} is claimed by both this branch and ${short}`);
      }
    }

    const below = pending.filter((m) => m.version < oldestOfOurs && !ourPaths.has(m.version));
    if (below.length) {
      earlier.push(`${short} has ${below.map((m) => m.version).join(", ")}`);
    }
  }

  if (collisions.length) {
    return record(
      "fail",
      "migrations",
      `${collisions.join("; ")}. Two migrations cannot share a version — renumber this ` +
        "branch's above everything pending anywhere.",
    );
  }

  if (earlier.length) {
    return record(
      "warn",
      "migrations",
      `this branch adds ${ours.map((m) => m.version).join(", ")}, but ${earlier.join("; ")} — ` +
        "merge those first, or the applied order will not match the numbering. " +
        "If that version is already applied to the database, the db-applied check below is " +
        "the authority, not this one.",
    );
  }

  record(
    "pass",
    "migrations",
    `${ours.map((m) => m.version).join(", ")} sort after ${newestOnMain}`,
  );
}

/**
 * 6. Would `supabase db push` actually run our pending migrations — or silently
 *    decide they are already applied?
 *
 * This is the one failure in this file that is completely silent, and it is why
 * the git-based check above is not enough on its own.
 *
 * Supabase records applied migrations in supabase_migrations.schema_migrations
 * BY VERSION — the 14-digit prefix — not by filename. If some other migration
 * already took your version number, `db push` matches your file to that row,
 * skips it, and reports success. Nothing fails. Everybody believes the fix
 * shipped.
 *
 * That happened on 2026-09-07. `20260907140000_audit_log_survives_actor_deletion.sql`
 * sat on an unpushed branch while `20260907140000_enforce_story_expiry_rls` was
 * applied to production from a different branch. Pushing would have skipped the
 * audit fix in silence: the foreign key would stay, both `actor := null` guards
 * would keep running, and the audit trail would keep recording "nobody".
 *
 * Note what the git-based check cannot do here. The colliding migration was
 * applied to production from a branch that was never merged — so comparing
 * against origin refs can miss it entirely. The remote's applied list is the
 * only authority. Same lesson as the rest of this repo's test suite: assert
 * against the layer that actually decides, not the one that looks like it does.
 */
async function checkAppliedMigrations() {
  if (!existsSync("supabase/migrations")) {
    return record("pass", "db-applied", "no migrations directory");
  }
  if (localOnly) {
    return record("warn", "db-applied", "skipped (--local or CI) — applied list not consulted");
  }
  if (!readEnvValue("SUPABASE_DB_PASSWORD")) {
    return record(
      "warn",
      "db-applied",
      "skipped — no SUPABASE_DB_PASSWORD, so the remote applied list could not be read. " +
        "A version collision would not be caught.",
    );
  }

  const db = createPgSession("session", "preflight");
  let applied: Map<string, string>;
  try {
    const rows = await db.withPg((client) =>
      client.query<{ version: string; name: string | null }>(
        "select version, name from supabase_migrations.schema_migrations",
      ),
    );
    applied = new Map(rows.rows.map((r) => [r.version, r.name ?? ""]));
  } catch (error) {
    return record(
      "warn",
      "db-applied",
      `could not read the applied list: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    await db.close();
  }

  const local = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();

  // Same version + different name = a different migration owns that number, and
  // ours would be skipped without a word. Same version + same name = already
  // applied, which is entirely normal.
  const collisions = local
    .map((file) => ({
      file,
      version: file.slice(0, 14),
      name: file.slice(15).replace(/\.sql$/, ""),
    }))
    .filter((m) => {
      const appliedName = applied.get(m.version);
      return appliedName !== undefined && appliedName !== m.name;
    });

  if (collisions.length) {
    // The next free number has to clear every source that can claim one:
    //
    //   the applied list      what the database has already run
    //   this working tree     migrations sitting in supabase/migrations here
    //   every git ref         local branches included, not just remote ones —
    //                         a branch committed but never pushed still owns
    //                         its numbers
    //
    // Suggesting "highest applied + 1" proposed 20260907160000, which this
    // repo's own pending route_stops migration already held.
    //
    // ONE SOURCE REMAINS UNCHECKABLE: a migration file written in another
    // worktree and not committed to any branch is in none of the three above,
    // so this suggestion is safe against everything recorded, not against
    // everything that exists. That case surfaces as an add/add conflict at
    // merge — annoying but loud, unlike the silent skip this check exists for.
    // There are two worktrees on this machine as of 2026-09-08, so it is worth
    // knowing rather than assuming.
    const fromRefs = (
      git("for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes") ?? ""
    )
      .split("\n")
      .filter(Boolean)
      .flatMap((ref) => migrationsOn(ref).map((m) => m.version));

    const highest =
      [...applied.keys(), ...local.map((f) => f.slice(0, 14)), ...fromRefs].sort().at(-1) ??
      "00000000000000";
    const next = String(BigInt(highest) + 10000n);
    return record(
      "fail",
      "db-applied",
      collisions
        .map(
          (c) =>
            `${c.file} would be SKIPPED: version ${c.version} is already applied as ` +
            `'${applied.get(c.version)}'. db push matches by version, not name, so it would ` +
            `report success and change nothing. Rename it to ${next}_${c.name}.sql`,
        )
        .join(" | "),
    );
  }

  // Cheaper, louder companion: a pending migration numbered below something
  // already applied is out of order. Not silent, but still wasteful.
  const highestApplied = [...applied.keys()].sort().at(-1);
  const pending = local.map((f) => f.slice(0, 14)).filter((v) => !applied.has(v));
  const outOfOrder = highestApplied ? pending.filter((v) => v < highestApplied) : [];

  if (outOfOrder.length) {
    return record(
      "fail",
      "db-applied",
      `${outOfOrder.join(", ")} are unapplied but sort below ${highestApplied}, which is ` +
        "already applied. Renumber them above it.",
    );
  }

  record(
    "pass",
    "db-applied",
    pending.length
      ? `${pending.length} pending (${pending.join(", ")}), no version collisions`
      : "nothing pending",
  );
}

checkBranch();
checkIdentity();
checkNoSecretsStaged();
checkPushCredential();
checkMigrationOrder();
await checkAppliedMigrations();

const icon: Record<Level, string> = { pass: "ok  ", warn: "WARN", fail: "FAIL" };
for (const { level, name, detail } of results) {
  console.log(`${icon[level]}  ${name.padEnd(11)} ${detail}`);
}

const failed = results.filter((r) => r.level === "fail");
if (failed.length) {
  console.error(`\npreflight failed: ${failed.map((r) => r.name).join(", ")}`);
  process.exit(1);
}
console.log("\npreflight passed.");
