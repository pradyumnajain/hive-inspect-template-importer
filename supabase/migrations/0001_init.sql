-- Hive Inspect template importer: initial schema.
--
-- Design rules this schema follows:
--   1. A template is never stored as one opaque blob. Hierarchy is relational.
--   2. Every level keeps the EXACT source string next to the display string.
--      Spectora HTML-escapes Section/Item names ("Roof Structure &amp; Attic")
--      but does not escape Comment Name or multiple choice options. We decode
--      for display and keep `*_raw` so an export is never lossy.
--   3. Physical row order from the spreadsheet is the authoritative ordering.
--      The Spectora "Order (w/i item)" column repeats and skips values, so it
--      is stored as data, not used as a sort key.
--   4. Anything the importer did not recognise is kept in `extra` jsonb and
--      reported as an import issue. Nothing is silently discarded.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- templates

create table templates (
  id               uuid primary key default gen_random_uuid(),
  name             text        not null,
  source_filename  text,
  -- 'spectora-html-text' today. Leaves room for another exporter later.
  source_format    text        not null default 'spectora-html-text',
  -- set when this template was produced by duplicating another one
  duplicated_from  uuid        references templates (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------- sections

create table sections (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references templates (id) on delete cascade,
  -- name_raw: bytes exactly as they appeared in the spreadsheet cell
  -- name:     entity-decoded, editable, what the inspector sees
  name_raw    text not null,
  name        text not null,
  -- 0-based, derived from first appearance in the file
  position    integer not null,
  -- first spreadsheet row (1-based, header is row 1) this section came from
  source_row  integer,
  unique (template_id, position)
);

create index sections_template_idx on sections (template_id, position);

-- -------------------------------------------------------------------- items

-- Items are scoped to a section on purpose: "General" appears under eight
-- different sections in the InterNACHI Residential template, and
-- "Normal Operating Controls" appears under two. Item name is not unique.

create table items (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections (id) on delete cascade,
  name_raw   text not null,
  name       text not null,
  position   integer not null,
  source_row integer,
  unique (section_id, position)
);

create index items_section_idx on items (section_id, position);

-- ----------------------------------------------------------------- comments

-- Comment Name is NOT unique within an item. The sample template contains
-- "Damper Inoperable" twice under Fireplace > Damper Doors. Surrogate key
-- plus `position` is the only safe identity.

create table comments (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references items (id) on delete cascade,

  name_raw       text not null,
  name           text not null,

  -- Comment Text, stored byte-exact. Sanitized at render time, never on write.
  body_html      text,

  -- first-class because the MVP reads, filters or edits these
  comment_type   text,               -- info | limit | defect (free text, not an enum:
                                     -- an unknown value must import and be flagged,
                                     -- not rejected by the database)
  category       integer,            -- -1 low, 0 medium, 1 high; null on non-defects
  answer_type    text,               -- boolean | checkbox | date | number | range | text
  recommendation text,               -- pro | monitor

  -- authoritative sort key, 0-based, from physical spreadsheet row order
  position       integer not null,
  -- the raw Spectora "Order (w/i item)" value, kept because it is customer data
  -- even though it is unreliable for sorting
  order_in_item  integer,

  -- spreadsheet row this comment came from, for tracing fidelity findings back
  source_row     integer,

  -- Everything else from the export that the MVP does not give its own column:
  -- Default Value, Default Value 2, Default Unit Type, Default Location,
  -- Default Estimate Min/Max, Locked, Simple Format, Disable Photos, Uses,
  -- Last Modified, the ten Default Photo slots and their captions, plus any
  -- column this importer has never seen. Keyed by the exact source header.
  extra          jsonb not null default '{}'::jsonb,

  unique (item_id, position)
);

create index comments_item_idx on comments (item_id, position);

-- --------------------------------------------------------- comment options

-- Multiple choice options and unit type options. Both arrive as one
-- comma-separated string. Split on comma only: the values are not CSV-quoted,
-- and one real option is literally `1 1/2"`, which a CSV parser would mangle.

create table comment_options (
  id         uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments (id) on delete cascade,
  kind       text    not null check (kind in ('choice', 'unit')),
  label      text    not null,
  position   integer not null,
  unique (comment_id, kind, position)
);

create index comment_options_comment_idx on comment_options (comment_id, kind, position);

-- ------------------------------------------------------------- import runs

create table import_runs (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid references templates (id) on delete cascade,
  filename     text,
  -- counts, fidelity check results, parser version
  stats        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index import_runs_template_idx on import_runs (template_id, created_at desc);

-- ----------------------------------------------------------- import issues

-- The visible record of everything the importer could not fully handle.
-- `origin` is the distinction the brief asks for:
--   'missing'     A. the information is absent from the Spectora export itself
--   'unsupported' B. the information is in the export but this importer does
--                    not model it as a first-class field (it is still stored
--                    in comments.extra, never dropped)
--   'source'      the export contains something odd or self-inconsistent

create table import_issues (
  id            uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references import_runs (id) on delete cascade,
  severity      text not null check (severity in ('info', 'warning', 'error')),
  origin        text not null check (origin in ('missing', 'unsupported', 'source')),
  code          text not null,
  message       text not null,
  source_row    integer,
  source_column text,
  raw_value     text,
  created_at    timestamptz not null default now()
);

create index import_issues_run_idx on import_issues (import_run_id, severity);

-- --------------------------------------------------------------------- RLS

-- This assignment has no login. The anon key gets read access so the UI can
-- render; all writes go through server routes using the service role key.
-- Turning RLS on with a read-only anon policy is safer than leaving it off.

alter table templates       enable row level security;
alter table sections        enable row level security;
alter table items           enable row level security;
alter table comments        enable row level security;
alter table comment_options enable row level security;
alter table import_runs     enable row level security;
alter table import_issues   enable row level security;

create policy anon_read on templates       for select using (true);
create policy anon_read on sections        for select using (true);
create policy anon_read on items           for select using (true);
create policy anon_read on comments        for select using (true);
create policy anon_read on comment_options for select using (true);
create policy anon_read on import_runs     for select using (true);
create policy anon_read on import_issues   for select using (true);
