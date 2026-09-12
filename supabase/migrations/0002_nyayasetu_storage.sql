-- NyayaSetu Prompt 15 — private document storage bucket + RLS.
--
-- The bucket is PRIVATE (public = false): there are no public URLs, only
-- short-lived signed URLs minted by the backend adapter after an ownership
-- check. Object keys follow private/<user_id>/<case_id>/<document_id> and
-- each storage.objects policy below pins the <user_id> segment to
-- auth.uid(), so a user can only ever touch their own folder.
-- Apply with: supabase db push  (see SUPABASE_SETUP.md)

-- ─── private bucket (never public) ──────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('nyayasetu-private', 'nyayasetu-private', false)
on conflict (id) do update set public = false;

-- ─── object policies: own folder only ───────────────────────────────────────
-- storage.foldername(name) splits the key on "/": [1] must be 'private' and
-- [2] must equal the caller's auth.uid(). Anything else is denied.

drop policy if exists nyayasetu_private_select on storage.objects;
create policy nyayasetu_private_select on storage.objects
  for select using (
    bucket_id = 'nyayasetu-private'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

drop policy if exists nyayasetu_private_insert on storage.objects;
create policy nyayasetu_private_insert on storage.objects
  for insert with check (
    bucket_id = 'nyayasetu-private'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

drop policy if exists nyayasetu_private_update on storage.objects;
create policy nyayasetu_private_update on storage.objects
  for update using (
    bucket_id = 'nyayasetu-private'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = (auth.uid())::text
  ) with check (
    bucket_id = 'nyayasetu-private'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );

drop policy if exists nyayasetu_private_delete on storage.objects;
create policy nyayasetu_private_delete on storage.objects
  for delete using (
    bucket_id = 'nyayasetu-private'
    and (storage.foldername(name))[1] = 'private'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );
