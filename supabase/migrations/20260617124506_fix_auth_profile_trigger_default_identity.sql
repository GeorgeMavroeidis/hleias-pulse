create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  display_name_value text;
  avatar_url_value text;
  default_identity_value text;
begin
  display_name_value := nullif(
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name'
    ),
    ''
  );

  avatar_url_value := nullif(
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture'
    ),
    ''
  );

  default_identity_value := upper(nullif(new.raw_user_meta_data->>'default_identity', ''));
  if default_identity_value is null
    or default_identity_value not in ('LOCAL', 'TOURIST', 'GUIDE', 'BUSINESS')
  then
    default_identity_value := 'LOCAL';
  end if;

  insert into public.profiles (id, display_name, avatar_url, default_identity)
  values (new.id, display_name_value, avatar_url_value, default_identity_value)
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.user_security_events (user_id, event_type, metadata)
  values (new.id, 'profile_created', jsonb_build_object('source', 'auth.users trigger'))
  on conflict do nothing;

  return new;
end;
$$;
