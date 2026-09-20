# Troubleshooting

Real issues hit during development, with root cause and fix — not a generic checklist.

---

## `yarn add`/`yarn install`/`yarn test` fails with an engine error

```
error jsdom@30.1.0: The engine "node" is incompatible with this module.
Expected version "^22.22.2 || ^24.15.0 || >=26.0.0". Got "24.13.0"
error Found incompatible module.
```

**Cause**: `jsdom` (a test-only dependency) declares an engine range that the system's default
Node (24.13.0 here) doesn't satisfy — it needs either 22.22.2+, 24.15.0+, or 26+. This is checked
by Yarn on **every** command that touches the dependency tree, not just test runs: `yarn add`,
`yarn install`, and `yarn test`/`yarn test:watch` (which spawns Vitest, which loads jsdom for
renderer tests) all hit this. `yarn typecheck`, `yarn build`, and `yarn dev` are unaffected — they
never load jsdom.

**Fix (macOS/Linux, bash/zsh)**: run the affected command with Node 22.22.2 (pinned in
`.nvmrc`) explicitly on `PATH`:

```bash
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn test
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn add -D <package>
```

Or switch your shell's active Node first if your `nvm` setup auto-loads `.nvmrc`:

```bash
nvm use
yarn test
```

**Fix (Windows)**: there's no PowerShell/CMD equivalent of the bash `PATH=` prefix — install
Node 22.22.2 directly (via [nvm-windows](https://github.com/coreybutler/nvm-windows) or the
plain [nodejs.org](https://nodejs.org/) installer), confirm it's active with `node --version`,
then run the command normally:

```powershell
nvm use 22.22.2   # if using nvm-windows
node --version    # confirm it says v22.22.2 before proceeding
yarn test
```

## `(node:XXXXX) ExperimentalWarning: SQLite is an experimental feature and might change at any time`

**Not a bug** — `src/main/db.ts` uses `node:sqlite`'s `DatabaseSync`, Node's own built-in SQLite
binding (stable enough to use, but Node still labels the module experimental as of the Node
version in use here). Every test run and every real app run prints this warning once; it's
expected and harmless. See [ARCHITECTURE.md](ARCHITECTURE.md#database-srcmaindbts) for why this
matters for packaging (no native-module rebuild step needed for the DB layer).

## Thumbnails are missing or blank for a specific image

**Cause**: `ffmpeg` can report success (`exit 0`, `end` event fires) while having written an
*empty* output file — reproduced with a real photo when extracting a frame with a seek offset
(`-ss` before `-i`) on what ffmpeg treats as a single-frame input; a synthetic 1-frame test image
did **not** reproduce it, which is why this looked file-specific rather than seek-specific at
first. `thumbnail-worker.ts`'s `extractFrame()` already guards against this — it checks the
output file's actual size after the `end` event and rejects if it's zero or missing — so a
legitimately-failing extraction shows as "no preview available" rather than a broken/corrupt
image. If you see a *silently wrong* thumbnail (not just missing), that guard is the first place
to check for a regression.

## Carousel/lightbox images don't load in dev mode (`file://` blocked)

**Cause** (already fixed, documented for anyone who reintroduces the pattern): the renderer in
dev mode is served from `http://localhost:5173` — a real HTTP origin, not `file://`. Chromium
blocks a non-`file://` origin from loading `file://` resources, so serving thumbnails as raw
`file://<path>` URLs works when the renderer itself is loaded from `file://` (a packaged build)
but silently fails to load images in dev.

**Fix in place**: `ThumbnailFramePreview` (`shared/types.ts`) carries a base64 `dataUrl`, not a
raw path — `getThumbnailPreviews()`/`getThumbnailIconDataUrl()` in `main/index.ts` read the
thumbnail file and encode it before sending over IPC. This works identically in dev and
packaged, so don't reach for a raw `file://` path for anything rendered in an `<img>` — encode it
as a data URL instead, the same way these two functions already do.

## macOS build: settings don't seem to save

Check whether the `.app` was **downloaded/transferred** rather than built and run directly where
it was built. See [PACKAGING.md](PACKAGING.md#macos) for the full explanation (App Translocation
can run a quarantined `.app` from a read-only mount) — this doesn't happen for a locally built,
directly-launched `.app`, which is the only scenario currently in use.

## Windows build: thumbnails don't work at all

If the Windows `.zip`/`.exe` was built **on macOS** (cross-built) rather than on an actual
Windows machine, this is expected and not fixable by anything in the app's own code — see
[PACKAGING.md](PACKAGING.md#windows) for the root cause (`ffmpeg-static` only ships the *host*
platform's binary at install time) and the fix (build on Windows, not macOS).

## Refactoring: `TS2448`/`TS2454` after extracting a hook

**Symptom**: moving state into a new hook produces `'x' is used before being assigned` or
`Cannot access 'x' before initialization` even though the code *looks* like it runs after `x` is
declared.

**Cause**: referencing a not-yet-declared `const` (typically from a hook call that hasn't
happened yet, further down in `App.tsx`) **directly inside a `useEffect` dependency array** is
eagerly evaluated at that point in the render — a real temporal-dead-zone error, not a false
positive. The same reference **inside a closure body** passed as a callback is fine, since the
closure only actually runs after the entire render body (including every hook call) has
executed.

**Fix**: either move the hook call earlier in `App.tsx` so the value exists by the time it's
needed, or capture the forward reference in a `useRef` that's updated every render and read only
when the callback actually fires — never listed in a dependency array directly. Both patterns
are used in the current hooks (see [ARCHITECTURE.md](ARCHITECTURE.md#hooks-srcrenderersrchooks)).
