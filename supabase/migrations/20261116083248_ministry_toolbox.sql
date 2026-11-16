-- The allowlist is deliberately empty until the two administrator accounts exist.
create table public.toolbox_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.toolbox_admins enable row level security;
revoke all on public.toolbox_admins from public, anon, authenticated;
grant select on public.toolbox_admins to authenticated;
create policy toolbox_admin_self on public.toolbox_admins for select to authenticated using (user_id = (select auth.uid()));

create table public.toolbox_items (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 1 and 120),
 description text not null default '' check (char_length(description) <= 5000),
 tags text[] not null default '{}',
 images text[] not null default '{}',
 cover text,
 reference_url text,
 published boolean not null default false,
 sort_order bigint not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.toolbox_items enable row level security;
revoke all on public.toolbox_items from public, anon, authenticated;
grant select on public.toolbox_items to anon, authenticated;
grant insert, update, delete on public.toolbox_items to authenticated;
create policy toolbox_public_items on public.toolbox_items for select to anon, authenticated using (published);
create policy toolbox_admin_read on public.toolbox_items for select to authenticated using (exists (select 1 from public.toolbox_admins where user_id = (select auth.uid())));
create policy toolbox_admin_insert on public.toolbox_items for insert to authenticated with check (exists (select 1 from public.toolbox_admins where user_id = (select auth.uid())));
create policy toolbox_admin_update on public.toolbox_items for update to authenticated using (exists (select 1 from public.toolbox_admins where user_id = (select auth.uid()))) with check (exists (select 1 from public.toolbox_admins where user_id = (select auth.uid())));
create policy toolbox_admin_delete on public.toolbox_items for delete to authenticated using (exists (select 1 from public.toolbox_admins where user_id = (select auth.uid())));

-- Private bucket: anonymous visitors can sign only images in published items.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ministry-toolbox','ministry-toolbox',false,10485760,array['image/jpeg','image/png','image/webp','image/gif']) on conflict (id) do nothing;
create policy toolbox_published_image_read on storage.objects for select to anon, authenticated using (
 bucket_id = 'ministry-toolbox' and exists (select 1 from public.toolbox_items i where i.published and name = any(i.images))
);
create policy toolbox_admin_image_read on storage.objects for select to authenticated using (
 bucket_id = 'ministry-toolbox' and exists (select 1 from public.toolbox_admins a where a.user_id = (select auth.uid()))
);
create policy toolbox_admin_image_insert on storage.objects for insert to authenticated with check (
 bucket_id = 'ministry-toolbox' and exists (select 1 from public.toolbox_admins a where a.user_id = (select auth.uid()))
);
create policy toolbox_admin_image_update on storage.objects for update to authenticated using (
 bucket_id = 'ministry-toolbox' and exists (select 1 from public.toolbox_admins a where a.user_id = (select auth.uid()))
) with check (bucket_id = 'ministry-toolbox' and exists (select 1 from public.toolbox_admins a where a.user_id = (select auth.uid())));
create policy toolbox_admin_image_delete on storage.objects for delete to authenticated using (
 bucket_id = 'ministry-toolbox' and exists (select 1 from public.toolbox_admins a where a.user_id = (select auth.uid()))
);
