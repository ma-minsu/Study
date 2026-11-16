create table public.toolbox_category_order (
  id boolean primary key default true check (id),
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.toolbox_category_order enable row level security;
revoke all on public.toolbox_category_order from public, anon, authenticated;
grant select on public.toolbox_category_order to anon, authenticated;
grant update on public.toolbox_category_order to authenticated;
create policy toolbox_category_order_public_read on public.toolbox_category_order for select to anon, authenticated using (true);
create policy toolbox_category_order_admin_update on public.toolbox_category_order for update to authenticated
using (exists (select 1 from public.toolbox_admins where user_id = (select auth.uid())))
with check (exists (select 1 from public.toolbox_admins where user_id = (select auth.uid())));
insert into public.toolbox_category_order (id) values (true);
