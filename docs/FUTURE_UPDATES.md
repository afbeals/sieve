# Future Updates

Deferred features, raised in discussion during development but intentionally out of scope for
the current build. Ordered roughly by how self-contained they are — earlier entries are closer
to "drop-in," later ones touch more of the existing architecture.

---

## Export listing/group/selection as CSV/JSON

**Problem**: right now the only way to get file data out of Sieve is looking at it on screen —
no way to hand a triage result to another tool or share a list with someone else.

**Approach**: a new IPC call (`export:rows`, say) taking the same `QueryListingParams`/row-set
shape already used everywhere else, writing to a user-chosen path via `dialog.showSaveDialog`.
CSV needs a column-escaping helper (commas/quotes/newlines in filenames are common — this repo
already treats filenames as fundamentally messy); JSON is a straight `JSON.stringify` of the
`FileRow[]`. Export scope should match whatever's currently in view: the full filtered listing,
just the current group, or just the current selection — three call sites, one shared writer
function.

**Complexity**: low. No new state, no schema changes, one new modal (destination + scope
picker) and one new main-process handler.

## Adjustable gallery tile-size zoom

**Problem**: the gallery view's tile size is currently fixed. A user with thousands of small
icons (screenshots, receipts) wants more per screen; someone reviewing photos wants them bigger.

**Approach**: a slider or +/- control in the toolbar, feeding a `gallerySize` value into
`GalleryListView`'s `itemContent` sizing (currently hardcoded aspect-ratio squares). Persist it
the same way `columnWidths` already persists — as a settings field, saved automatically on
change like the other layout settings, not gated behind an explicit Settings-panel Save.

**Complexity**: low-medium. `react-virtuoso`'s `VirtuosoGrid` needs the item size known up front
for its virtualization math to stay accurate — changing tile size means the grid's internal
measurements need to invalidate/reflow, not just a CSS change on already-rendered items.

## Recent-folders list

**Problem**: every session starts from "Choose folder…" with no memory of what you looked at
last time, even though the whole point of the app is repeated triage passes over the same few
directories.

**Approach**: append `rootPath` to a capped list (e.g. last 10) in `AppSettings` on every
successful `pickRoot()`/scan-start, surfaced as a dropdown or recent-list panel next to "Choose
folder…". Needs de-duplication (re-picking an already-recent folder moves it to the front,
doesn't add a second entry) and pruning entries that no longer exist on disk (check with
`fs.stat` lazily, when the list is opened — not proactively on every app start, which would slow
startup for no benefit).

**Complexity**: low. Purely additive to `AppSettings` + one new UI element; no interaction with
the DB schema or scanning logic.

## Per-file "why is this grouped here" explanation

**Problem**: word-frequency grouping puts a file in a group because one of its tokenized words
matched a selected group word — but for a file with a long or unusual name, it's not always
obvious *which* word triggered the match, especially once several words are selected at once.

**Approach**: `tokenizeFileName()` already produces the exact token list a file matched against
(`shared/tokenize.ts`) — surfacing which of the currently-selected `groupWords` actually appear
in a given row's tokens is a pure function of data already computed, no new backend work. Likely
a tooltip or inline badge in the row (Table/Grouped/Gallery views all show the name — this would
be a shared bit of UI, not per-view logic) highlighting the matched word(s) in place, e.g. bold
or underlined within the rendered filename.

**Complexity**: low. All the data needed already exists; this is a rendering-only feature.

## File age distribution

**Problem**: the storage breakdown (per-extension size) answers "what's taking up space" but not
"is this folder mostly old files I forgot about, or a mix of old and new" — a common triage
question ("what's safe to archive") that current filtering only answers one bucket at a time
(the "modified within" quick-filter presets).

**Approach**: a histogram (age buckets: <1 week, <1 month, <6 months, <1 year, older) computed
server-side the same way `getStorageBreakdown()` groups by extension — one new `db.ts` query
grouping by an age bucket instead of `ext`, reusing the existing scope/filter clause builders.
Rendered as a simple bar chart alongside (or replacing a tab in) the existing storage popover.

**Complexity**: low-medium. New DB query (straightforward, same pattern as the existing
aggregate queries), new small UI component; no new state-management concerns.

## Hash-based duplicate detection

**Problem**: two files with different names but identical content (a common outcome of repeated
downloads, camera re-imports, or manual copies) currently show up as unrelated rows — nothing in
the current filtering/grouping model catches "these are the same file twice."

**Approach**: hash every file's content (SHA-1 is already used elsewhere in this codebase for
the thumbnail cache key, so precedent exists) during or after a scan, store the hash in a new
`files.contentHash` column (nullable — computed lazily, not required for basic scanning), and
add a "show duplicates" view that groups rows by matching hash. The expensive part is entirely
the hashing itself, not the SQL — hashing every byte of every file in a "large" folder (the
plan's own working assumption: tens of thousands of files) is a real, potentially slow
background job, needing the same batched/worker-thread treatment `scanner-worker.ts` and
`thumbnail-worker.ts` already use, plus a way to show partial progress and let a user act on
duplicates found so far rather than waiting for the whole pass to finish.

**Complexity**: medium-high. Real I/O cost at scale, a new worker, a schema migration, and new
UI for a genuinely new triage mode (not just a new filter on existing data).

## Tagging/notes

**Problem**: no way to leave a note on a file ("keep, need for taxes" / "delete after Q1
backup") or apply a lightweight custom tag independent of the filesystem itself.

**Approach**: a new SQLite table (`file_notes` or `file_tags`, keyed by path) alongside `files`
and `thumbnails` — deliberately **not** stored in `appConfig.json`, since that file is meant to
be small and portable, while notes/tags could grow large and are really index-adjacent data, not
configuration. Needs its own UI surface (a notes field in the preview panel; a tag-chip row
similar to the existing quick-filter chips) and — trickier — a decision on what happens to a
tagged file's tag when the file is renamed or moved: keyed by path, a tag naively becomes
orphaned on any move/rename unless the existing `PathMapping`-based undo/rename plumbing is
extended to also re-key tag rows, the same way a real rename should carry metadata forward.

**Complexity**: medium. New schema, new UI, and a real design decision about tag/path binding
that the rename/move code doesn't currently need to think about at all.

## Dual independent pane view (compare two folders)

**Problem**: comparing two separate folders side by side (e.g. "old backup" vs "current") isn't
possible — the app is single-root by design throughout (scope/filter/sort state is all singular
in `App.tsx`).

**Approach**: the more disruptive end of this list. Every piece of `App.tsx`'s orchestrator
state (`rootPath`, `pathStack`, `rows`/`total`/`scanning`, `sortField`/`sortDir`, `filterRules`,
quick-filter presets, `contextMenu`) — and most of the extracted hooks — currently assume exactly
one active root. Two real implementation shapes: (a) parameterize the existing hooks/state to
take a "pane id" and render `<App>`'s content-area twice with independent state per pane, sharing
only the outer window/settings, or (b) mount two fully independent instances of the *content*
component tree with a thin shared shell. (a) reuses more code but means threading a pane
identifier through nearly everything built in the Phase H decomposition; (b) duplicates less
logic conceptually but risks two copies of subtle behavior drifting apart over time.

**Complexity**: high. Touches almost every hook and a large fraction of `App.tsx`'s remaining
orchestrator state — this is the one item on this list that's a genuine architecture change, not
an additive feature.

## Multi-root tabs

**Problem**: closely related to the dual-pane idea above, but N roots instead of exactly 2, each
in its own tab rather than a fixed split view.

**Approach**: shares the same core problem as dual-pane (today's single-root state assumption)
but a different UI shape — a tab strip above the toolbar, one full `App` content-tree instance
per open tab, with the watcher/scan/thumbnail-worker main-process machinery already capable of
running against multiple roots concurrently (nothing in `main/index.ts`'s worker-spawning code
assumes a single root globally — `activeScan`, `activeWatcher` etc. are the actual current
limits, being singletons). Worth doing *after* dual-pane if both are ever pursued, since
whichever state-scoping approach dual-pane settles on (per-pane parameterization vs. duplicated
component trees) directly informs how tabs should be structured, rather than solving the
same "more than one root" problem twice in two different shapes.

**Complexity**: high, and overlapping enough with dual-pane that these two should be scoped
together rather than built independently — see that entry for the harder half of the work
(making `App.tsx`'s state per-root instead of global) that this would also require.

## OS-native trash integration

**Problem**: "delete" currently moves files to a same-volume `.dir-explorer-trash` folder under
the scanned root (see [ARCHITECTURE.md](ARCHITECTURE.md)), not the OS's own Trash/Recycle Bin —
so a deleted file doesn't show up in Finder's Trash or Windows' Recycle Bin, and doesn't benefit
from whatever OS-level "restore" UI users already know.

**Why this is deferred, not just unimplemented**: this was a deliberate initial design choice,
not an oversight — programmatically restoring a file from the OS trash is not reliably
cross-platform (macOS and Windows expose this differently, and neither has a great "move to
trash, return an ID you can move back with" API surface the way this app's own trash folder
does trivially via `movePaths()`). Revisiting this means picking a per-platform native-trash
library (e.g. something wrapping `NSWorkspace` on macOS and `IFileOperation`/`SHFileOperation` on
Windows) and accepting that "restore" either needs to shell out to the OS's own trash-restore
flow (losing this app's own precise undo semantics) or give up on the current app's exact,
reliable undo — the app-level trash folder was chosen specifically to keep undo reliable and
platform-uniform, so this trade-off needs to be made deliberately, not just wired up.

**Complexity**: medium, but with a real design trade-off at the center of it (own-trash undo
precision vs. OS-native trash UI familiarity), not just implementation effort.
