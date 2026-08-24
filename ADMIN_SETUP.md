# Admin workspace setup

The admin dashboard lives at `/admin`. Its access is enforced by Supabase Row
Level Security, so a profile must be explicitly assigned a team role before it
can open the workspace.

## First owner setup

1. Merge and deploy the migration `20260824090000_add_admin_dashboard.sql`.
2. Sign in to the app once with the account that should become the first Owner.
   This creates its `profiles` row automatically.
3. In Supabase Dashboard, open **Authentication → Users** and copy that user's
   UUID (the value in the `id` column).
4. In **SQL Editor**, run this once with the copied UUID:

```sql
insert into public.admin_members (user_id, role)
values ('PASTE-USER-UUID-HERE', 'owner');
```

5. Visit `/admin`, then use **Team access** to assign the other team members as
   Owner, Editor, or Moderator.

Do not use a service-role key in the frontend and do not put database passwords
or keys in this file.

## Roles

- **Owner:** manages team roles and every content workflow.
- **Editor:** creates, edits, publishes, or hides editorial content.
- **Moderator:** reviews user submissions and can publish or hide them.

All new user posts, comments, places, stories, and Meet events start as
`pending`. Only published content is visible to ordinary users of the app.
