# Spectora template importer

Import a Spectora inspection template into a real database, review exactly what
survived the import, edit it, and duplicate it without the copy and the original
ever touching each other.

Built for the Hive Inspect Forward Deployed Engineer assignment. The design
notes, the comparison with how Hive Inspect imports the same file, known
limitations and what was deliberately left out are in [NOTES.md](NOTES.md).

**Live app:** https://hive-inspect-template-importer-topaz.vercel.app

**Reviewer access:** there is no login. The link above opens on an
already-imported template. Nothing is gated, and no account or credential is
needed to import, edit or duplicate.

---

## What it does

1. **Import.** Upload a Spectora `Export to spreadsheet -> Export HTML Text`
   file. You get a preview with counts, a structure outline, warnings and an
   import fidelity report. Nothing is written until you confirm.
2. **Review.** The fidelity report re-walks the spreadsheet and compares it
   against what is about to be stored, across eleven dimensions, naming the
   source row and column of anything that differs.
3. **Edit.** Change section names, item names, comment names and comment text.
   Each change is written to Postgres when you press Save. Sections and items
   are collapsed by default, and a search box filters the tree by name.
4. **Duplicate.** One SQL function deep-copies every level with fresh ids. Edit
   the copy and the original does not move.

---

## Requirements

- Node 20 or newer (developed on Node 24)
- A free Supabase project
- A Vercel account, if you want to deploy it

---

## Quick start

```bash
git clone <this repo>
cd hive-inspect-template-importer
npm install
```

### 1. Create the database

In the Supabase dashboard, create a project, then open **SQL Editor** and run
these two files in order:

```
supabase/migrations/0001_init.sql
supabase/migrations/0002_duplicate_template.sql
```

Each is plain SQL and safe to paste whole. The first creates the seven tables
and their row level security policies; the second creates the
`duplicate_template` function.

If you prefer the CLI and have `psql`:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql
psql "$SUPABASE_DB_URL" -f supabase/migrations/0002_duplicate_template.sql
```

### 2. Set the environment variables

```bash
cp .env.example .env.local
```

Fill in the three values from **Project Settings -> API** in Supabase:

| Variable | Where it comes from | Exposed to the browser |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` public key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` secret key | **no** |

Reads use the anon key, which row level security limits to `SELECT`. Writes go
through server routes using the service role key, which never reaches the
browser. There is no login, so this is what keeps write access off the client.

### 3. Seed the sample template

```bash
npm run seed
```

This imports the committed export at
`sample-data/InterNACHI Residential -2026-09-17.xls` so the app opens on
something real. It is safe to re-run; pass `--force` to import a second copy.

### 4. Run it

```bash
npm run dev
```

Open http://localhost:3000.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build, including a full type check |
| `npm test` | Parser and fidelity tests. No database needed |
| `RUN_DB_TESTS=1 npm test` | Also runs the database tests against `.env.local` |
| `npm run typecheck` | Type check on its own |
| `npm run seed` | Import the committed sample export |
| `npm run report -- <file>` | Print the parse summary, fidelity report and warnings for any export, without a database |

`npm run report` is the fastest way to check whether a new Spectora file
parses. It needs no database and no browser, and it is what was used to
diagnose the entity bug described in NOTES.md:

```bash
npm run report -- "sample-data/InterNACHI Residential -2026-09-17.xls"
```

The other tooling written along the way is listed under "Reusable pieces in the
repo" in [NOTES.md](NOTES.md).

---

## Deploying to Vercel

1. Push the repository to GitHub.
2. In Vercel, **Add New -> Project** and import it. The framework is detected
   as Next.js; no build settings need changing.
3. Add the same three environment variables under **Settings -> Environment
   Variables**, for Production and Preview.
4. Deploy.
5. Seed the deployed database once, from your machine, with `.env.local`
   pointing at the same Supabase project:

   ```bash
   npm run seed
   ```

   The app and the seed script talk to the same Supabase instance, so seeding
   locally populates the deployed site.

Everything used here is on a free tier: Supabase free Postgres and Vercel
hobby. There are no paid services and no background workers.

---

## How it is put together

```
src/lib/spectora/     the importer. No React, Next or Supabase imports.
  sniff.ts            identify the file by its bytes, not its extension
  reader.ts           SheetReader interface + the exceljs implementation
  entity-fix.ts       repair double-decoded XML entities (see NOTES.md)
  columns.ts          map Spectora headers to fields this app models
  parse.ts            grid -> normalised tree + import issues
  fidelity.ts         source vs normalised comparison, the fidelity report
  html.ts             entity decoding and HTML inspection helpers

src/lib/db/           Supabase clients and every query
src/lib/sanitize.ts   render-time HTML sanitising, never on write
src/app/              pages, server actions, import API routes
src/components/       shared UI
supabase/migrations/  schema and the deep-copy function
tests/                parser, fidelity and database tests
scripts/              seed and report command line tools
```

The importer is deliberately isolated. It has no framework imports, so the
tests run it headless against the committed sample file, and `exceljs` sits
behind a one-method `SheetReader` interface so it can be replaced without
touching parsing, validation or the fidelity report.

### The data model

```
templates
└── sections        name_raw + name, position
    └── items       name_raw + name, position       (scoped to a section)
        └── comments  body_html, comment_type, category, answer_type,
            │         recommendation, position, order_in_item, source_row,
            │         extra (jsonb)
            └── comment_options    kind = choice | unit

import_runs   counts, headers and the fidelity report for one import
import_issues every warning, with its source row and column
```

Four decisions worth knowing, all forced by the real export:

- **`name_raw` beside `name`.** Spectora HTML-escapes Section and Item names
  but not Comment Names or choice options. One decode rule for all of them
  would corrupt one of them, so the exact source string is kept alongside the
  editable display string.
- **`position` is the sort key, not Spectora's `Order`.** Despite its header,
  `Order (w/i item)` is scoped to the comment type: it restarts inside each of
  Spectora's Informational, Limitations and Defects groups, so it ties in 38 of
  the 69 items and skips values in 4. Physical spreadsheet row order is the
  truth, and `order_in_item` and `comment_type` are both stored so the grouped
  view stays derivable. See NOTES.md.
- **Surrogate keys everywhere.** Comment names repeat inside a single item.
- **`extra` jsonb.** Every column the app does not model, including ones it has
  never seen, is stored keyed by its exact header and reported as an issue.
  Nothing from the export is discarded.
