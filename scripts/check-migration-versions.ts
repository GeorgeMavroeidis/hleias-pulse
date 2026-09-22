import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8" }).trim();
const refs = git("for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes")
  .split("\n")
  .filter(Boolean);
const entries = new Map<string, Map<string, Set<string>>>();
function record(path: string, source: string) {
  const name = basename(path);
  assert.match(name, /^\d{14}_.+\.sql$/, `Invalid migration: ${name}`);
  const version = name.slice(0, 14);
  const names = entries.get(version) ?? new Map<string, Set<string>>();
  const sources = names.get(name) ?? new Set<string>();
  sources.add(source);
  names.set(name, sources);
  entries.set(version, names);
}
for (const ref of refs) {
  for (const path of git("ls-tree", "-r", "--name-only", ref, "--", "supabase/migrations")
    .split("\n")
    .filter(Boolean)) {
    record(path, ref);
  }
}
const worktrees = git("worktree", "list", "--porcelain")
  .split("\n")
  .filter((line) => line.startsWith("worktree "))
  .map((line) => line.slice(9));
for (const worktree of worktrees) {
  const dir = join(worktree, "supabase/migrations");
  if (!existsSync(dir)) continue;
  for (const path of readdirSync(dir).filter((name) => name.endsWith(".sql")))
    record(path, worktree);
}
const collisions = [...entries].filter(([, names]) => names.size > 1);
for (const [version, names] of collisions) {
  console.error(
    `Collision ${version}:`,
    [...names].map(([name, sources]) => ({ name, sources: [...sources] })),
  );
}
assert.equal(collisions.length, 0, "Migration timestamps collide across active refs/worktrees");
console.log(
  `[migrations] ${refs.length} refs, ${worktrees.length} worktrees: no collisions; latest ${[...entries.keys()].sort().at(-1)}.`,
);
console.log("Refresh remote refs with git fetch origin --prune before allocating a new timestamp.");
