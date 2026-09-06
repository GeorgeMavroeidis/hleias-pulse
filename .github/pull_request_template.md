## Summary

What changed and why.

## Validation

- [ ] `npm run lint` passes (0 errors)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` passes
- [ ] The three test suites pass
- [ ] I tested the affected user flow, not just the build

## Safety

- [ ] No `.env`, credentials, service-role keys, database passwords or tokens included
- [ ] No service-role key in frontend code
- [ ] No change to `.gitignore`
- [ ] No production deployment was performed

## Extra eyes

Both maintainers own the whole repo, so nothing here *requires* the other's sign-off.
Tick what applies — it just tells the reviewer where to look hardest:

- [ ] Changes Supabase migrations
- [ ] Changes auth, payments, or security (RLS, tokens, session handling)
- [ ] Changes build or deploy config — `vite*.config.ts`, `wrangler.toml`,
      `package.json`, `.github/`, `ios/`, `capacitor.config.ts`
- [ ] Changes a user-facing screen or copy

### If this PR creates or drops an RLS policy

State the policy count per command, per table you touched. Permissive policies OR together
and a mistyped `drop policy if exists` is a silent no-op — this line is what catches it.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
|  |  |  |  |  |
