alter table public.places
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists places_user_id_idx on public.places (user_id);

grant insert, update, delete on public.places, public.place_avatars to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'places'
      and policyname = 'Authenticated users can create places'
  ) then
    create policy "Authenticated users can create places"
    on public.places for insert to authenticated
    with check (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'places'
      and policyname = 'Users can update own places'
  ) then
    create policy "Users can update own places"
    on public.places for update to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'places'
      and policyname = 'Users can delete own places'
  ) then
    create policy "Users can delete own places"
    on public.places for delete to authenticated
    using (user_id = (select auth.uid()));
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_avatars'
      and policyname = 'Users can create avatars for own places'
  ) then
    create policy "Users can create avatars for own places"
    on public.place_avatars for insert to authenticated
    with check (
      exists (
        select 1
        from public.places
        where places.id = place_avatars.place_id
          and places.user_id = (select auth.uid())
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_avatars'
      and policyname = 'Users can update avatars for own places'
  ) then
    create policy "Users can update avatars for own places"
    on public.place_avatars for update to authenticated
    using (
      exists (
        select 1
        from public.places
        where places.id = place_avatars.place_id
          and places.user_id = (select auth.uid())
      )
    )
    with check (
      exists (
        select 1
        from public.places
        where places.id = place_avatars.place_id
          and places.user_id = (select auth.uid())
      )
    );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_avatars'
      and policyname = 'Users can delete avatars for own places'
  ) then
    create policy "Users can delete avatars for own places"
    on public.place_avatars for delete to authenticated
    using (
      exists (
        select 1
        from public.places
        where places.id = place_avatars.place_id
          and places.user_id = (select auth.uid())
      )
    );
  end if;
end $$;
