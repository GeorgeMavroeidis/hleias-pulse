/**
 * Approval-gated production provisioning for the push worker's internal secret.
 *
 * This script never prints secret values. It deliberately updates the Edge
 * Function first and Vault second, producing a safe delivery pause during a
 * rotation instead of accepting calls authenticated with an old secret.
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PRODUCTION_PROJECT_REF, projectRef, readEnvValue } from "./lib/env";
import { createPgSession } from "./lib/pg";

const WORKER_URL = "https://kfxfnqryfmuxiwlswyyn.supabase.co/functions/v1/send-push";

async function upsertVaultSecret(client: import("pg").default.Client, name: string, value: string) {
  await client.query(
    `with existing as (
       select id from vault.secrets where name = $2
     ), updated as (
       select vault.update_secret(id, $1, $2, $3) from existing
     )
     select vault.create_secret($1, $2, $3)
     where not exists (select 1 from existing)`,
    [value, name, "Phase 0 scheduled push worker"],
  );
}

async function main() {
  if (!process.argv.includes("--apply")) {
    throw new Error("Dry by default. After explicit production approval, rerun with `--apply`.");
  }
  if (projectRef !== PRODUCTION_PROJECT_REF) {
    throw new Error(`Refusing to provision unexpected project ${projectRef}.`);
  }

  const apikey = readEnvValue("PUSH_WORKER_APIKEY");
  if (!apikey?.startsWith("sb_publishable_")) {
    throw new Error("PUSH_WORKER_APIKEY must contain the project's publishable key.");
  }

  const internalSecret = randomBytes(32).toString("base64url");
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "pulse-push-secret-"));
  const secretFile = join(temporaryDirectory, "function.env");
  const db = createPgSession("session", "push-provisioning");

  try {
    writeFileSync(secretFile, `PUSH_INTERNAL_SECRET=${internalSecret}\n`, { mode: 0o600 });
    execFileSync(
      "npx",
      [
        "supabase",
        "secrets",
        "set",
        "--env-file",
        secretFile,
        "--project-ref",
        PRODUCTION_PROJECT_REF,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );

    await db.once(async (client) => {
      await client.query("begin");
      try {
        await upsertVaultSecret(client, "push_worker_url", WORKER_URL);
        await upsertVaultSecret(client, "push_worker_apikey", apikey);
        await upsertVaultSecret(client, "push_worker_secret", internalSecret);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });

    console.log(
      "Provisioned PUSH_INTERNAL_SECRET and the three named Vault values; no secret values were printed.",
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
    await db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Push provisioning failed.");
  process.exit(1);
});
