# Sieve

A desktop file-triage app for organizing, sorting, and reviewing large, messy directories -
built with Electron, React, and TypeScript.

Point it at a folder and it recursively indexes every file into a local SQLite database, then
lets you sort, regex-filter, group-by-word, and visually preview thousands of files without the
lag of a plain filesystem listing. It's built around one specific workflow: staring at a folder
full of inconsistently-named files (screenshots, downloads, camera exports, scraped media) and
figuring out what's safe to rename, group, or delete.

---

## What it does

- **Recursive or single-folder indexing** into a local SQLite DB (`node:sqlite`), kept live by a
  filesystem watcher (`chokidar`) - no manual rescanning after you move/rename/delete files
  outside the app
- **Regex filtering** (fuzzy substring or strict regex, AND/OR-combinable, invertible), with a
  live "N would match" preview and recent-pattern history
- **Quick filters** for common extension groups, size presets, and "modified within" presets
- **Word-frequency grouping** - tokenizes every filename in scope, surfaces the most common
  words as clickable chips, and groups the file list by whichever words you pick
- **Table / Grouped / Gallery views**, all backed by `react-virtuoso` so 100k+ rows stay smooth
- **Media previews** - thumbnails (1 frame for images, N frames for video via `ffmpeg`) generated
  in background worker threads, with a carousel and full-size lightbox for the selected file(s)
- **File operations** with real undo/redo: rename, bulk rename, new folder, cut/copy/paste,
  duplicate, drag-and-drop move/copy, delete-to-trash (a same-volume `.dir-explorer-trash`
  folder, not the OS trash - see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for why)
- **Pinned rows** and **saved views** (a named bundle of filters/sort/grouping/view-mode, so a
  multi-step triage setup can be recreated in one click)
- **Storage breakdown** - a per-extension size/count bar chart for the current scope and filters
- **Config export/import** as a portable JSON file

## Prerequisites

- Node **22.22.2** (pinned in `.nvmrc` - see [Node version note](#node-version-note) below)
- Yarn (classic, v1) - `corepack enable` or `npm install -g yarn`

## Quick start

```bash
git clone <this repo>
cd sieve
nvm use          # picks up .nvmrc -> Node 22.22.2
yarn install
yarn dev         # launches the Electron app with hot reload
```

Pick a folder via "Choose folder…" and it starts indexing immediately.

## Key scripts

| Script | What it does |
|---|---|
| `yarn dev` | Electron app with hot module reload (dev loop) |
| `yarn build` | Production build via `electron-vite` (outputs to `out/`) |
| `yarn typecheck` | `tsc --noEmit` for both the main and web `tsconfig`s |
| `yarn test` | Full Vitest suite (see [docs/local-testing.md](docs/local-testing.md)) |
| `yarn test:watch` | Vitest in watch mode |
| `yarn dist:mac` | Package a portable macOS `.app` + `.zip` (no installer, no signing) |
| `yarn dist:win` | Package a portable Windows `.exe` + `.zip` - **must be run on an actual Windows machine**, see [docs/PACKAGING.md](docs/PACKAGING.md) |

## Node version note

Node 22.22.2 is pinned because `jsdom` (a test-only dependency) rejects the system's default
Node (24.13.0 here) at its declared engine range. This affects **every** `yarn` command, not
just tests - `yarn install`, `yarn add`, etc. all need to run under Node 22. If you don't use
`nvm`/`.nvmrc` switching automatically, prefix commands explicitly (macOS/Linux, bash/zsh):

```bash
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn <command>
```

**On Windows**, there's no PowerShell/CMD equivalent of that `PATH=` prefix trick - install Node
22.22.2 directly (via [nvm-windows](https://github.com/coreybutler/nvm-windows) or the plain
[nodejs.org](https://nodejs.org/) installer) and make sure it's the active version
(`nvm use 22.22.2`, or just don't have another Node version installed) before running any
`yarn` command.

`yarn typecheck`, `yarn build`, and `yarn dev` are unaffected by this and work fine under the
system Node - only commands that touch the package tree or invoke `jsdom` (`yarn test`, `yarn
add`, `yarn install`) need the pin. See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for
the full story.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - process split, IPC surface, SQLite schema,
  worker threads, renderer structure
- [docs/local-testing.md](docs/local-testing.md) - dev loop, how to exercise every feature by
  hand, running the test suite
- [docs/PACKAGING.md](docs/PACKAGING.md) - building portable Windows/macOS builds
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - real issues hit during development, with
  root causes and fixes
- [docs/FUTURE_UPDATES.md](docs/FUTURE_UPDATES.md) - backlog of deferred features

## Status

Personal-use proof of concept. Actively developed on macOS; Windows builds are packaged but not
yet runtime-tested on a real Windows machine (see [docs/PACKAGING.md](docs/PACKAGING.md)). Not
published anywhere - this is a local project, not a released product.
