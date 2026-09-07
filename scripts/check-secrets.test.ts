/**
 * Tests for the secret-scanning rules.
 *
 * These exist because of a specific mistake. The `postgres-url-with-password`
 * rule was narrowed so that a connection string built from environment
 * variables in a CI step — `postgres://user:${SUPABASE_DB_PASSWORD}@host` —
 * would stop being reported as a hardcoded credential. The narrowing excluded
 * `$ { }` from the WHOLE password segment rather than just its first character,
 * which quietly also exempted every real password containing one of those
 * characters anywhere. Supabase-generated passwords routinely contain `$`.
 *
 * It was verified at the time with "a real literal URL is still flagged", which
 * was true of the one example tried and false in general. One example is not a
 * test. These are.
 *
 *   npm run test:secrets
 */
import assert from "node:assert/strict";
import test from "node:test";

import { RULES } from "./check-secrets";

function rule(name: string) {
  const found = RULES.find((r) => r.name === name);
  assert.ok(found, `no rule named '${name}'`);
  return found.pattern;
}

/** A rule must FLAG this. Failing here means a real secret would slip through. */
function flags(pattern: RegExp, sample: string) {
  assert.ok(pattern.test(sample), `expected to FLAG: ${sample}`);
}

/** A rule must ALLOW this. Failing here is a false positive. */
function allows(pattern: RegExp, sample: string) {
  assert.ok(!pattern.test(sample), `expected to ALLOW: ${sample}`);
}

test("postgres-url-with-password flags real credentials", () => {
  const pattern = rule("postgres-url-with-password");

  flags(pattern, "postgresql://postgres.abc:hunter2supersecret@db.example.com:5432/postgres");
  flags(pattern, "postgres://u:hunter2supersecret@h");

  // The three that a whole-segment exclusion silently stopped flagging. Each is
  // a literal password that merely contains one of the characters a variable
  // reference starts with.
  flags(pattern, "postgres://u:p$ssw0rdLeaked@h");
  flags(pattern, "postgres://u:Ab{3}xyzLeaked@h");
  flags(pattern, "postgres://u:realSecret$@h");
});

test("postgres-url-with-password allows a variable reference", () => {
  const pattern = rule("postgres-url-with-password");

  // What the CI migration step actually builds. The secret is in the secret
  // store; only its name appears in the file.
  allows(pattern, "postgres://u:${SUPABASE_DB_PASSWORD}@h");
  allows(pattern, "postgres://u:$SUPABASE_DB_PASSWORD@h");
  allows(
    pattern,
    "postgresql://postgres.${SUPABASE_PROJECT_REF}:${SUPABASE_DB_PASSWORD}@${SUPABASE_DB_HOST}:5432/postgres",
  );

  // A URL with no password at all is not this rule's business.
  allows(pattern, "postgresql://postgres@db.example.com:5432/postgres");
});

test("db-password rule draws the same line, at the first character", () => {
  const pattern = rule("db-password");

  flags(pattern, 'SUPABASE_DB_PASSWORD="hunter2supersecret"');
  flags(pattern, "SUPABASE_DB_PASSWORD=hunter2supersecret");
  // Contains $ but does not start with it — still a literal.
  flags(pattern, "SUPABASE_DB_PASSWORD=p$ssw0rdLeaked");

  allows(pattern, "SUPABASE_DB_PASSWORD=${{ secrets.SUPABASE_DB_PASSWORD }}");
  allows(pattern, "SUPABASE_DB_PASSWORD=$SUPABASE_DB_PASSWORD");
});

test("every rule is usable: named, hinted, and not accidentally global", () => {
  assert.ok(RULES.length > 0, "no rules defined");
  for (const r of RULES) {
    assert.ok(r.name.length > 0, "a rule has no name");
    assert.ok(r.hint.length > 0, `rule '${r.name}' has no hint`);
    // A /g pattern carries lastIndex between .test() calls, so the same rule
    // would alternate between matching and not across files.
    assert.ok(!r.pattern.global, `rule '${r.name}' is global; .test() would be stateful`);
  }
});
