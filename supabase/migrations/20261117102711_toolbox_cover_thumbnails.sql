-- Keep the full-size image untouched; thumbnails are optional, replaceable derivatives.
alter table public.toolbox_items add column if not exists cover_thumbnail text;

-- A thumbnail is publicly readable only when referenced by a published item.
create policy toolbox_published_thumbnail_read
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'ministry-toolbox'
  and exists (
    select 1 from public.toolbox_items as item
    where item.published = true
      and item.cover_thumbnail = objects.name
  )
);
