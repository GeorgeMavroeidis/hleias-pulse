/**
 * Fail the build if a secret is about to be committed.
 *
 * CLAUDE.md's hard rule is "Never commit .env, passwords, service-role keys, or
 * API tokens", and until now nothing enforced it. CI ran lint, typecheck, tests
 * and build — none of which look at what is in the files.
 *
 * This is deliberately narrow and dependency-free rather than a general secret
 * scanner. It knows the shapes this specific project's secrets actually take,
 * so it can be strict without drowning the build in false positives, and it can
 * be verified by running it. A general scanner is worth adding later; an
 * unverified one that red-lights `main` on day one is worth less than nothing.
 *
 * Scans git-tracked files only. Anything untracked is not about to be
 * committed, and node_modules is not ours to police.
 *
 *   npm run check:secrets
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

type Rule = { hint: string; name: string; pattern: RegExp };

const RULES: Rule[] = [
  {
    hint: "Supabase secret (service-role) key. It bypasses RLS entirely — read it from the CLI session or .env at runtime, as the smoke scripts do.",
    name: "supabase-secret-key",
    pattern: /\bsb_secret_[A-Za-z0-9_-]{20,}/,
  },
  {
    hint: "JWT. The publishable/anon key is fine in source, but a service_role JWT is not — and they look identical here, so neither belongs in a committed file.",
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  },
  {
    hint: "Database password with an inline value. Keep it in .env, which is gitignored.",
    name: "db-password",
    pattern:
      /\b(?:SUPABASE_DB_PASSWORD|POSTGRES_PASSWORD|PGPASSWORD)\s*[:=]\s*["']?[^\s"'{}$][^\s"']{3,}/,
  },
  {
    hint: "Postgres connection string with credentials in it.",
    name: "postgres-url-with-password",
    pattern: /\bpostgres(?:ql)?:\/\/[^\s:@/]+:[^\s:@/]+@/,
  },
  {
    hint: "Private key block.",
    name: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    hint: "AWS access key id.",
    name: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    hint: "GitHub token.",
    name: "github-token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  },
];

/**
 * `sb_publishable_` is the browser key and belongs in source — it is in
 * src/lib/supabase/client.ts by design and is safe there precisely because RLS
 * is the boundary. This file itself carries every pattern above as source code,
 * so it has to exempt itself or it would always fail.
 */
const ALLOWED_PATH = /^scripts\/check-secrets\.ts$/;
const ALLOWED_VALUE = /\bsb_publishable_[A-Za-z0-9_-]+/g;

/** Never allow these to be tracked at all, whatever is inside them. */
const FORBIDDEN_PATHS = [/^\.env(\.|$)/, /(^|\/)\.env$/, /(^|\/)\.env\.local$/];

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\0")
    .filter(Boolean);
}

function isProbablyText(path: string) {
  if (/\.(png|jpe?g|gif|webp|ico|icns|pdf|zip|woff2?|ttf|otf|mp4|mov|car)$/i.test(path))
    return false;
  try {
    // A 2 MB source file is a generated bundle, not something a human put a key in.
    return statSync(path).size <= 2 * 1024 * 1024;
  } catch {
    return false;
  }
}

function main() {
  const findings: string[] = [];

  for (const path of trackedFiles()) {
    if (FORBIDDEN_PATHS.some((rule) => rule.test(path))) {
      findings.push(`${path}: env file is tracked by git. It must never be committed.`);
      continue;
    }
    if (ALLOWED_PATH.test(path) || !isProbablyText(path)) continue;

    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      continue;
    }
    const scrubbed = content.replace(ALLOWED_VALUE, "sb_publishable_REDACTED");

    scrubbed.split("\n").forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push(`${path}:${index + 1}  [${rule.name}] ${rule.hint}`);
        }
      }
    });
  }

  if (findings.length) {
    console.error("Secret scan FAILED:\n");
    for (const finding of findings) console.error(`  ${finding}`);
    console.error(
      "\nIf one of these is a false positive, narrow the rule in scripts/check-secrets.ts " +
        "rather than deleting it.",
    );
    process.exit(1);
  }

  console.log("Secret scan clean.");
}

main();
