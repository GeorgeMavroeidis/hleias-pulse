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

## Lanes

- [ ] I stayed inside my lane (see [CODEOWNERS](../.github/CODEOWNERS)), or the owner has
      approved the crossing

## Review flags

- [ ] Changes Supabase migrations — **needs Mavroeidis**
- [ ] Changes auth, payments or security — **needs Mavroeidis**
- [ ] Changes deployment or build configuration — **needs Mavroeidis**
- [ ] Changes a screen, component or user-facing copy — **needs Margaris**

### If this PR creates or drops an RLS policy

State the policy count per command, per table you touched. Permissive policies OR together
and a mistyped `drop policy if exists` is a silent no-op — this line is what catches it.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
|  |  |  |  |  |
