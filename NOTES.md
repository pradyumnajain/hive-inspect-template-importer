# Notes

What was built, what was cut, what is known to be imperfect, and how any of it
was checked. Setup instructions are in [README.md](README.md).

---

## Source template

| | |
|---|---|
| Template | InterNACHI Residential, a stock Spectora template |
| Export path | Spectora → Export to spreadsheet → Export HTML Text |
| Exported | 17 September 2026 |
| Committed at | `sample-data/InterNACHI Residential -2026-09-17.xls` |
| Shape | 1 sheet, 42 columns, 392 data rows, 13 sections, 69 items, 392 comments |

No customer data. It is a stock template from a free Spectora trial.

---

## What the export actually contains

This drove nearly every design decision, so it is worth stating plainly.

**The file is not an XLS.** The extension says `.xls`; the bytes are an OOXML
zip. It also has no shared-strings table, so every value is an inline string.
The importer identifies files by magic number and refuses a genuine legacy
binary `.xls` with instructions for converting it.

**Ordering cannot come from the Order column.** `Order (w/i item)` is
non-decreasing but it ties and it skips.

| Fact about `Order (w/i item)` | Count |
|---|---|
| Items where row order disagrees with Order ascending | 0 |
| Tied Order values inside a single item | 64 |
| Items whose Order values have gaps | 4 |

`Exterior > Exterior Doors` has two comments both at Order 0. `Exterior >
Siding, Flashing & Trim` goes 0, 2, 3. Sorting on that column would silently
reshuffle a template the inspector spent years arranging, so physical row order
is the sort key and the Order value is kept as data.

**Three different escaping regimes in one file.**

```
Section Name  "Basement, Foundation, Crawlspace &amp; Structure"   HTML-escaped
Item Name     "Skylights, Chimneys &amp; Other Roof Penetrations"  HTML-escaped
Comment Name  "Damper Inoperable"                                  never escaped
MC Options    "Conduit, Knob & Tube, Not Visible, Romex"           raw, not escaped
Comment Text  "<p>Mast is not properly installed.</p>\r\n"         real HTML
```

Decoding everything would corrupt the options; decoding nothing would show the
inspector `&amp;` in their own section titles. Both forms are stored.

**Natural keys do not exist.** `Fireplace > Damper Doors` contains the comment
name `Damper Inoperable` twice. `General` is an item name in eight different
sections. Every level uses a surrogate key and is scoped to its parent.

**Whitespace is content until proven otherwise.** Eleven comment names carry a
trailing space, across six distinct names, including `Temperature ` and
`Corrosion `. Nothing is trimmed.

**Comma-separated does not mean CSV.** One real option is literally `1 1/2"`.
A CSV parser eats the quote. Splitting on comma is correct here and a
quote-aware parser is wrong.

---

## The hardest problem: the spreadsheet library was rewriting the data

`exceljs` 4.4.0 decodes XML entities twice.

The worksheet XML for cell A93 literally reads:

```xml
<c r="A93" t="str"><v>Basement, Foundation, Crawlspace &amp;amp; Structure</v></c>
```

Decoded once, which is correct, the cell value is
`Basement, Foundation, Crawlspace &amp; Structure`. `exceljs` returns
`Basement, Foundation, Crawlspace & Structure`.

It looks harmless because both render identically in a browser. It is not. A
comment body that deliberately showed escaped markup as literal text
(`&amp;lt;p&amp;gt;`) would come back as live markup, and silently rewriting
customer content is the one thing this importer must not do.

Rather than tolerate it, `src/lib/spectora/entity-fix.ts` re-reads the
worksheet XML with `jszip` (already present as an `exceljs` dependency),
decodes it exactly once, and restores the correct value. It only overrides a
cell when the correct value differs from what `exceljs` produced and the two
differ purely by entity decoding, so it becomes a no-op if the library is fixed
or another reader is swapped in. **282 cells in the sample export are
affected.** The repair is reported as an import issue and is visible in the app,
never silent.

This is also why `exceljs` sits behind a one-method `SheetReader` interface.

---

## Supported input

- Spectora `Export to spreadsheet -> Export HTML Text`, OOXML (`.xlsx` bytes,
  whatever the extension says).
- The first worksheet in the workbook.
- A header row in the first five rows, matched on a normalised form, so
  `Order (w/i item)` and `Order (within item)` both map to the same field.
- Columns in any order. Missing optional columns are reported, not fatal.
- The three required columns are Section Name, Item Name and Comment Name.
- Blank Section or Item cells inherit from the row above, the way a grouped
  spreadsheet reads, and the app says when it did that.
- A section or item split across non-adjacent blocks is merged, keeping file
  order, and flagged.

### Deliberate failures, all with an actionable message

| Input | Response |
|---|---|
| A PDF | `not_a_spreadsheet`, with what to upload instead |
| An empty file | `empty_file` |
| A genuine legacy binary `.xls` | `legacy_xls`, with how to convert it |
| A valid workbook with the wrong columns | `missing_required_columns`, listing the headers it did find |
| An unrecognised Comment Type or Answer Type | Imported, value kept verbatim, warning raised |
| An unknown column | Stored in `extra`, warning raised |
| A row with no hierarchy and no row above | Not imported, reported as an error with the row's contents |

---

## Missing versus unsupported

The brief asks for this distinction and the app keeps it in the data model, as
`import_issues.origin`, and groups the UI by it.

**A. Missing from the export.** Information Spectora did not write, which no
importer could recover. The sample template contains exactly one, and it is a
good one:

```html
<div class="youtube-embed-wrapper" style="position:relative;padding-bottom:56.25%;...">&nbsp;</div>
```

An inspector embedded a video. The HTML-text export wrote the wrapper and left
the `iframe` behind. The app preserves the placeholder exactly and tells the
user the video is gone from the file rather than rendering an invisible empty
box.

**B. In the export, unsupported by this app.** Received, stored, not editable
here. Five columns in the sample carry data of this kind: `Default Estimate
Min`, `Default Estimate Max`, `Uses`, `Last Modified` and `Default Value`. Every
value is on its comment in `extra` and visible in the editor under "Preserved
source fields". The ten `Default Photo` slots and their captions are empty in
this template but are handled the same way, with their own warning if a
template uses them.

Nothing in category B is dropped. The fidelity report has a dedicated check
that compares every unmodelled source cell against what was stored.

---

## The improvement: the Import Fidelity Report

**The customer problem.** Someone handing over a template they have tuned for
four years cannot eyeball 392 rows across 42 columns to confirm nothing was
lost. A green "Import successful" banner is worth nothing to them. They need
evidence, and if something did go wrong they need to know exactly which cell.

After parsing, the app walks the source grid a second time and compares it
against the tree that is about to be written, then shows the result before
anything is committed and keeps it on the template afterwards.

Eleven checks, on the sample export:

| Check | Values compared |
|---|---|
| Every source row imported | 392 |
| Sections preserved | 13 |
| Items preserved | 69 |
| Comment names preserved | 392 |
| Hierarchy preserved | 392 |
| Physical order preserved | 392 |
| Comment text preserved | 392 |
| Formatting and links preserved | 198 |
| Answer options preserved | 75 |
| Key source fields preserved | 1,960 |
| Unsupported columns retained | 1,569 |

Result: 11 of 11 checks, 5,844 of 5,844 values matched. Every discrepancy would
carry its source row and column.

A validator that always passes is worse than none, so the test suite corrupts
the parsed tree on purpose, seven different ways, and asserts the report catches
each one.

**What was cut from this feature.** The original proposal was to re-export an
XLS and diff it byte for byte against the source. That was too much scope for
two days and most of the work would have gone into writing a spreadsheet
writer, not into preservation. Source-to-normalised validation gives the
customer the same assurance for a fraction of the effort.

---

## What was left out, and why

- **Editing anything beyond names and comment text.** Severity, answer type,
  choice options, estimates and photo defaults are imported, stored and shown,
  but read-only. The brief asks for section, item and comment editing; the rest
  is preserved rather than half-built.
- **Reordering, adding and deleting sections, items or comments.** Preservation
  and safe editing were the priority. The schema supports it: `position` is
  already the sort key.
- **A rich text editor.** Comment text is edited as HTML in a textarea with a
  live rendered preview beside it. A WYSIWYG editor would have normalised the
  markup on every keystroke, which is exactly the silent rewriting this project
  is about avoiding.
- **Authentication.** Out of scope for the assignment. Row level security is
  enabled with a read-only anon policy, and all writes go through server routes
  holding the service role key, so the setup is not accidentally wide open.
- **Re-export back to Spectora format.** Not asked for. `name_raw` and `extra`
  exist so it stays possible.
- **A stored procedure for import.** Duplication is one atomic SQL function;
  import is level-by-level inserts with a compensating delete if any step
  fails. The cascade makes that cleanup complete. Marked in the code as a
  deliberate shortcut with the upgrade path.

---

## How it was checked

**56 tests, all passing.** 44 run with no database; 12 need one.

```bash
npm test                  # parser + fidelity, offline
RUN_DB_TESTS=1 npm test   # adds the database tests
```

The database tests are opt-in behind `RUN_DB_TESTS=1` so the suite is fast and
offline by default and can never write to a production project by accident.
Every template they create is deleted afterwards.

**Preservation** is asserted against the real file, with numbers taken from
inspecting the export rather than from whatever the parser produced: 392 rows
become 392 comments, 13 sections, 69 items; the two comments sharing Order 0
stay in file order; `Damper Inoperable` appears twice under one item; eleven
comment names keep a trailing space; `1 1/2"` and `Knob & Tube` survive option
splitting; comment text keeps its non-breaking spaces and CRLF line endings.

**Edits** were checked both ways. A test renames a section, an item and a
comment, then re-reads from the database and confirms the new values and that
`name_raw` was untouched. In the browser, a section was renamed, the page fully
reloaded, and the new name was still there.

**Independent copies** were checked three ways. In SQL directly, against
Postgres 14. In the test suite: the copy and the original share zero row ids,
and after editing the copy the original serialises byte-identically to a
snapshot taken before. And in the browser: duplicate the seeded template, rename
a section on the copy, reload the original, original unchanged.

**The database work was verified against a real Postgres**, not mocked. Local
Postgres 14 with PostgREST in front of it, which is what Supabase runs, so the
embedded selects, the `rpc` call and row level security all behaved as they will
in production.

**Failure cases** were driven through the running app's real API route, not
just unit tests. All four refusals returned the right code and a message that
says what to do next.

---

## Known limitations

- Only the first worksheet is read. A multi-sheet export would need a sheet
  picker.
- Legacy binary `.xls` is refused rather than parsed. `exceljs` cannot read it.
  Every Spectora HTML-text export seen so far is OOXML.
- The entity repair covers plain string cells. Shared-string cells are left to
  `exceljs`; the Spectora export does not use them.
- Import is not a single transaction. A failure mid-import deletes the partial
  template, so nothing broken is left behind, but the window exists.
- `npm audit` reports a moderate advisory in `uuid`, pulled in transitively by
  `exceljs`. It affects `uuid` v3/v5/v6 when a buffer is supplied, which
  `exceljs` does not do. Fixing it means downgrading `exceljs` to 3.4, which
  would be worse.
- The editor renders every section on one page. At 392 comments it is fine.
  A much larger template would want virtualisation.

---

## Time spent

About two days of focused work, in the shape the brief suggested.

| Phase | Roughly |
|---|---|
| Exploring Spectora and analysing the real export | 2 hours |
| Data model and import design | 1 hour |
| Schema, migrations, deep-copy function | 1.5 hours |
| Parser, entity repair, tests | 4 hours |
| Fidelity report and its tests | 2 hours |
| App, import flow, editor, duplication | 4 hours |
| Verification against a real database and browser | 1.5 hours |
| Deployment and documentation | 1.5 hours |

The single biggest unplanned cost was the `exceljs` entity bug. Finding it took
a while because the output looked correct.

---

## Tools and libraries

**AI tools.** Claude Code was used throughout: analysing the export, writing
the parser and tests, building the app, and reviewing its own output. Every
non-obvious expectation in the tests was traced back to the real file before
being written down, and two of the first test expectations were wrong in ways
the real data caught.

No model is used inside the product. Import mapping is deterministic. A model
in the import path would need exactly the validation this app already has, and
would be slower and less predictable for a mapping that is fully specified by
the header row.

**Libraries.** Next.js 16 with the App Router, React 19, TypeScript, Tailwind 4,
`@supabase/supabase-js`, `exceljs` for reading workbooks, `jszip` for the entity
repair, `isomorphic-dompurify` for render-time sanitising, Vitest, `tsx` for the
command line scripts. Scaffolded with `create-next-app`. No starter template or
boilerplate beyond that; the schema, importer, fidelity report and UI are all
written for this assignment.
