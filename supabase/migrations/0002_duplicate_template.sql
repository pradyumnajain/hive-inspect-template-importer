-- Deep, independent copy of a template.
--
-- Done in SQL rather than in application code for three reasons:
--   1. It is atomic. A partially copied template can never be observed.
--   2. New ids are generated for every row at every level, so the copy shares
--      no rows with the original. Editing one cannot affect the other.
--   3. It is one round trip instead of several thousand.
--
-- Note the copy deliberately carries over `extra`, `*_raw`, `source_row` and
-- the options. A duplicate that quietly lost the unmodelled source fields
-- would defeat the whole point of preserving them.

create or replace function duplicate_template(p_template_id uuid, p_new_name text default null)
returns uuid
language plpgsql
as $$
declare
  v_new_id uuid;
begin
  insert into templates (name, source_filename, source_format, duplicated_from)
  select coalesce(p_new_name, name || ' (copy)'), source_filename, source_format, id
  from templates
  where id = p_template_id
  returning id into v_new_id;

  if v_new_id is null then
    raise exception 'template % not found', p_template_id;
  end if;

  -- sections, remembering old id -> new id
  create temporary table _sec_map (old_id uuid primary key, new_id uuid not null)
    on commit drop;

  with ins as (
    insert into sections (template_id, name_raw, name, position, source_row)
    select v_new_id, s.name_raw, s.name, s.position, s.source_row
    from sections s
    where s.template_id = p_template_id
    order by s.position
    returning id, position
  )
  insert into _sec_map (old_id, new_id)
  select s.id, ins.id
  from ins
  join sections s on s.template_id = p_template_id and s.position = ins.position;

  create temporary table _item_map (old_id uuid primary key, new_id uuid not null)
    on commit drop;

  with ins as (
    insert into items (section_id, name_raw, name, position, source_row)
    select m.new_id, i.name_raw, i.name, i.position, i.source_row
    from items i
    join _sec_map m on m.old_id = i.section_id
    order by m.new_id, i.position
    returning id, section_id, position
  )
  insert into _item_map (old_id, new_id)
  select i.id, ins.id
  from ins
  join _sec_map m on m.new_id = ins.section_id
  join items i on i.section_id = m.old_id and i.position = ins.position;

  create temporary table _cmt_map (old_id uuid primary key, new_id uuid not null)
    on commit drop;

  with ins as (
    insert into comments (
      item_id, name_raw, name, body_html, comment_type, category, answer_type,
      recommendation, position, order_in_item, source_row, extra
    )
    select m.new_id, c.name_raw, c.name, c.body_html, c.comment_type, c.category,
           c.answer_type, c.recommendation, c.position, c.order_in_item,
           c.source_row, c.extra
    from comments c
    join _item_map m on m.old_id = c.item_id
    order by m.new_id, c.position
    returning id, item_id, position
  )
  insert into _cmt_map (old_id, new_id)
  select c.id, ins.id
  from ins
  join _item_map m on m.new_id = ins.item_id
  join comments c on c.item_id = m.old_id and c.position = ins.position;

  insert into comment_options (comment_id, kind, label, position)
  select m.new_id, o.kind, o.label, o.position
  from comment_options o
  join _cmt_map m on m.old_id = o.comment_id;

  return v_new_id;
end;
$$;
