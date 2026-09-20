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

**The Order column is scoped to the comment type, not to the item.** Despite
its header, `Order (w/i item)` ties constantly: 64 times across the template,
in 38 of the 69 items. `Exterior > Exterior Doors` has two comments both at
Order 0.

That looked like corrupt data until a second template was imported and
Spectora's own editor was visible beside it. Spectora groups comments under
INFORMATIONAL, LIMITATIONS and DEFECTS headings, and the Order column restarts
inside each group. Re-scoping the check settles it:

| Scope | Items with duplicate Order values |
|---|---|
| Within the item | 38 of 69 |
| Within (item, comment type) | 1 of 69 |

The single exception is a genuine duplicate in the customer's own template:
`Heating > General` has two informational comments both at Order 0,
"Homeowner's Responsibility" and "AFUE Rating".

So sorting on `Order` alone would interleave three separate sequences and
scramble the template. Two further facts make the choice easy. The export does
not write rows grouped by type either: in 25 of the 69 items the types
interleave, and `Exterior > Exterior Doors` runs defect, info, then six more
defects. And `Order` skips values in four items, so it is not even dense.

Physical row order is therefore the sort key, and `comment_type` and
`order_in_item` are both stored as data. That preserves the file exactly as
written while keeping everything needed to reconstruct Spectora's own grouped
view. Neither reading is lost.

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

## How Hive Inspect imports the same template

The same InterNACHI Residential export was imported into a Hive Inspect trial,
which is both a check on this importer and the source of the feedback below.

**The two readings of the file agree.** Hive shows the same 13 sections in the
same order, Exterior expands to the same 7 subsections in the same order, and
Exterior &rarr; General holds one comment in both. Hive also decodes the escaped
ampersands, so "Attic, Insulation &amp; Ventilation" reads correctly there too.
Hive's "Subsection" is the level this schema calls an item. That is independent
confirmation that the parser landed on the same reading as the product the
customer would be importing into.

**Where the two differ.**

| | This app | Hive Inspect |
|---|---|---|
| Comment order inside an item | Physical spreadsheet order | Grouped into Information, Limitations and Defects |
| Saving | Per field, immediately | Batched behind an unsaved-changes bar |
| Structure editing | Not built | Drag to reorder, add, duplicate, delete |
| Fields beyond the export | None | Section and subsection descriptions, private notes, a visible toggle |
| After import | Fidelity report and warnings | The editor, with an unsaved-changes bar |

The ordering difference is the interesting one, and it is not a defect on
Hive's side. Spectora groups comments by type in its own editor, and its Order
column restarts inside each group, so Hive's buckets mirror the source model
more closely than physical row order does.

This app keeps row order instead, for one reason: it is what the file says,
and it is the only reading that survives a file whose types interleave, which
25 of the 69 items do. Because `comment_type` and `order_in_item` are both
stored, the grouped view is derivable from what is saved, so the choice costs
nothing. Going the other way is not true: grouping on import would discard the
file's own sequence.

**What this app has that the import flow did not.** Importing into Hive ends on
an editor already showing "You have unsaved changes", before the inspector has
touched anything.

That was tested rather than assumed. Import, touch nothing, do not save, close
the tab and reopen: the template is intact, 13 sections, 7 subsections under
Exterior, "Inspection Method" under Exterior and General, and the bar is still
there. Pressing Save once clears it permanently, after which it appears only on
a real edit. So it is a per-template flag set at import and cleared by the first
save, not a dirty-on-load editor.

**It is not data loss, and should not be described as such.** The content is
safe. The message is what is wrong: there are no unsaved changes, nothing is at
risk, and the product says otherwise at the one moment a switching customer is
deciding whether to trust the move. They finish an import and meet an alarm
that never says what is unsaved or what would be lost. A warning that is always
on the first visit also trains people to click through it, which spends the
credibility of a genuine one later.

The generous reading is that this is a deliberate review-then-confirm gate on
imports, in which case the mechanism is fine and only the wording is wrong.
"You have unsaved changes" describes something that did not happen; "Review
this import and save to confirm" describes what is actually happening.

Either way the import ends in ambiguity rather than confirmation, and that is
exactly the gap the Import Fidelity Report was built to fill.

## How Binsr imports the same template

The same export was also run through Binsr, which turns the comparison into
three independent readings of one file.

**All three agree.** Binsr reports 392 rows, 13 sections and 69 line items
before importing, and after importing its section list matches this app row for
row: same thirteen names in the same order, same item count and same comment
count in every one, 392 in total. It decodes the escaped ampersands correctly
too. When three separate implementations read a file the same way, a claim that
the parse is right stops being self-assessment.

**They ask different questions.** Hive asks which product you are leaving, from
a list of four. Binsr asks only whether the file is CSV or Excel, then shows
every column, its guessed target and a real sample value, and lets you remap or
skip before it acts.

| | Hive | Binsr | This app |
|---|---|---|---|
| What the user declares | The vendor | The column mapping | Nothing |
| How the file is read | Vendor-specific parser | Generic, user-confirmed | Detected from the header row |
| If the case is not covered | Chat support, "if it is possible" | Email it, "we'll convert it for you" | Refused, with what to upload instead |

Both approaches cost something real. Knowing the vendor lets Hive apply
knowledge the customer should never have to supply, such as the fact that
Spectora's Order column restarts inside each comment-type group. Binsr cannot
know that, which is why it maps Category to Tags and then has to rebuild defect
levels in a later step. But Hive's list is four products long and everyone else
reaches a support queue, while Binsr will take a spreadsheet from software
nobody has heard of.

**What Binsr does that both others could learn from.** It shows its guesses
before acting, with a sample value beside each column so a wrong guess is
obvious. It shows provenance on anything derived, labelling a comment type
"Matched from: info". And it shows per-type counts before you commit: 78
informational, 12 limitations, 302 deficiencies, which is exactly the split in
the file. That is the same instinct as the fidelity report here, applied to the
mapping rather than to the values.

**What it does not do is tell you the content survived.** Counts confirm that
rows were recognised, not that comment bodies, links or escaping came through
intact. Nothing in that flow would surface the video embed Spectora dropped.
Binsr also adds content of its own during import: the type descriptions and all
four tags, Safety Hazard, Recommendation, Maintenance Item and Other, are its
defaults rather than anything in the export. It is upfront about it and they can
be removed, but this importer adds nothing that was not in the file.

**On using a model.** Binsr offers AI-Powered Import as its recommended path and
labels the alternative "no AI, fully deterministic". This importer is the
deterministic kind. The mapping is fully specified by the header row, so a model
would add latency and unpredictability and still need exactly the validation
that is already here.

**Not verified.** Whether Binsr preserves comment HTML and its links through the
round trip, and which of the two Order 0 comments under `Exterior > Exterior
Doors` it lists first, which would show whether it keeps file order or groups by
type. Both were left unchecked rather than guessed at.

## What was left out, and why

- **Editing anything beyond names and comment text.** Severity, answer type,
  choice options, estimates and photo defaults are imported, stored and shown,
  but read-only. The brief asks for section, item and comment editing; the rest
  is preserved rather than half-built.
- **Reordering, adding and deleting sections, items or comments.** Preservation
  and safe editing were the priority. The schema supports it: `position` is
  already the sort key.
- **A rich text editor.** Opening a comment shows its text the way it will
  read, links and all. The markup underneath appears only after the inspector
  presses Edit text, and then beside a preview that updates as they type. A
  home inspector browsing their template never meets a tag, and the one who
  chooses to edit sees the real thing rather than an approximation.

  The objection to a WYSIWYG editor is narrower than "it reformats things".
  Editing is user-initiated, so tidying a comment somebody deliberately changed
  is not the same as rewriting 282 cells at import time. The real problem is
  that a rich editor works against a fixed schema and silently discards
  whatever falls outside it, and this template contains exactly such a case.
  `Doors, Windows & Interior > Walls > Doorknob Hole` holds this:

  ```html
  <div class="youtube-embed-wrapper" style="position:relative;padding-bottom:56.25%;...">&nbsp;</div>
  ```

  A div carrying a class and an inline style is not something a rich text
  editor models. An inspector opening that comment to fix a typo would destroy
  the very placeholder this importer detects and reports as a video Spectora
  dropped. The same risk applies to `target="_blank"`, which is on all 86 links
  in the template and is routinely stripped.

  Worth keeping the scale in mind: 194 of the 392 comments have no markup at
  all, 83 empty and 111 plain prose. Tags only appear on the 198 that genuinely
  contain formatting or links.

  **The next step, if this were to go further.** A constrained editor whose
  schema is a superset of what the file actually contains, paired with a
  save-time guard: render the body before and after, compare, and refuse to
  write if anything outside the inspector's edit moved. That is the fidelity
  report's idea applied to editing rather than importing, and it would give a
  non-technical inspector a safe rich editor without trading away the
  guarantee. It is a real feature rather than an evening's work, which is why
  it is written down here instead of half-built.
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
- The editor renders every section on one page, collapsed by default. At 392
  comments it is fine. A much larger template would want virtualisation.
- Structure search matches section, item and comment names, not comment text,
  and filters the rendered tree rather than querying the database. That keeps
  the hierarchy server-rendered and every save wired exactly as it was.

---

## Reusable pieces in the repo

Small things written along the way that are useful beyond this assignment, kept
because the brief asks to see how the work was done.

| Path | What it is for |
|---|---|
| `scripts/report.mts` | Parses any Spectora export and prints the counts, the full fidelity report and every warning. No database, no browser, no app. This is the fastest way to check whether a new file imports cleanly, and it is what was used to diagnose the entity bug. |
| `scripts/seed.mts` | Imports the committed sample into whichever database `.env.local` points at. Safe to re-run; `--force` imports another copy. |
| `.claude/launch.json` | Dev server definition, so an AI coding tool can start and drive the app rather than asking for a screenshot. |
| `tests/persistence.test.ts` | Opt-in database tests behind `RUN_DB_TESTS=1`, so the same suite runs offline by default and against a real project on demand. |

The database layer was also exercised locally against Postgres 14 with
PostgREST in front of it, which is the pair Supabase runs. That harness was
throwaway and is not in the repo; the opt-in tests above are the part worth
keeping.

## Time spent

About two days of focused work, in the shape the brief suggested.

| Phase | Roughly |
|---|---|
| Exploring Spectora and Hive Inspect, analysing the real export | 2.5 hours |
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
