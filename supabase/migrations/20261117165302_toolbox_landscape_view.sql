-- Existing items stay unchanged until an administrator enables landscape viewing.
alter table public.toolbox_items
  add column if not exists landscape_enabled boolean not null default false;
