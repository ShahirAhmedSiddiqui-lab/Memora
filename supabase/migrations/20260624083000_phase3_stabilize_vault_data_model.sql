create table if not exists public.vault_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid unique references public.knowledge_items(id) on delete cascade,
  storage_path text not null unique,
  mime_type text,
  file_name text,
  byte_size bigint,
  preview_metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.vault_files enable row level security;

grant select, insert, update, delete on public.vault_files to authenticated;

drop policy if exists "vault_files_select_own" on public.vault_files;
create policy "vault_files_select_own"
on public.vault_files
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "vault_files_insert_own" on public.vault_files;
create policy "vault_files_insert_own"
on public.vault_files
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "vault_files_update_own" on public.vault_files;
create policy "vault_files_update_own"
on public.vault_files
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "vault_files_delete_own" on public.vault_files;
create policy "vault_files_delete_own"
on public.vault_files
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists vault_files_user_created_at_idx
  on public.vault_files (user_id, created_at desc);

alter table public.knowledge_items
  add column if not exists processing_status text,
  add column if not exists extracted_text text,
  add column if not exists failure_reason text,
  add column if not exists deleted_at timestamptz,
  add column if not exists preview_metadata jsonb not null default '{}'::jsonb;

update public.knowledge_items
set
  processing_status = case
    when deleted_at is not null then 'trashed'
    else 'ready'
  end
where processing_status is null;

update public.knowledge_items
set preview_metadata = coalesce(preview_metadata, '{}'::jsonb)
where preview_metadata is null;

alter table public.knowledge_items
  alter column processing_status set default 'pending',
  alter column processing_status set not null;

alter table public.knowledge_items
  drop constraint if exists knowledge_items_processing_status_check;

alter table public.knowledge_items
  add constraint knowledge_items_processing_status_check
  check (processing_status in ('pending', 'ready', 'failed', 'trashed'));

insert into public.vault_files (
  user_id,
  item_id,
  storage_path,
  mime_type,
  file_name,
  byte_size,
  preview_metadata
)
select
  user_id,
  id,
  file_path,
  file_mime,
  file_name,
  null,
  coalesce(preview_metadata, '{}'::jsonb)
from public.knowledge_items
where file_path is not null
on conflict (storage_path) do update
set
  item_id = excluded.item_id,
  mime_type = excluded.mime_type,
  file_name = excluded.file_name,
  preview_metadata = excluded.preview_metadata;

alter table public.chat_messages
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

drop trigger if exists vault_files_set_updated_at on public.vault_files;
create trigger vault_files_set_updated_at
before update on public.vault_files
for each row execute function public.set_updated_at();

drop trigger if exists chat_messages_set_updated_at on public.chat_messages;
create trigger chat_messages_set_updated_at
before update on public.chat_messages
for each row execute function public.set_updated_at();
