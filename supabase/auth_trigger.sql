-- Run this AFTER schema.sql. It keeps your `users` table in sync with
-- Supabase's built-in `auth.users` table automatically whenever someone
-- signs up — without this, registering an account won't create the
-- matching row the app expects.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
