# Packaging

Portable-zip builds via `electron-builder`, for local personal use — no installer, no code
signing, no auto-update, no CI. This doc covers *how* to build each platform's package and the
real gotchas hit while setting this up; if something here goes stale, check
`package.json`'s `"build"` block and the `dist:*` scripts against what's actually configured.

---

## Why zip, not an installer

`settings.ts`'s `getSettingsPath()` deliberately stores `appConfig.json` **next to the running
executable** — a "portable app" pattern, so the whole thing (binary + its own config) can be
copied or moved as one unit:

```ts
function getSettingsPath(): string {
  if (app.isPackaged) return join(dirname(process.execPath), 'appConfig.json')
  return join(__dirname, '../../src/appConfig.json')
}
```

A traditional installer breaks this:

- **Windows NSIS installer** → installs to `Program Files\Sieve\`, which is not writable
  without elevation. `appConfig.json` would either fail to write or need the whole app run
  elevated every time — neither is acceptable for a personal-use app.
- **macOS DMG → drag to /Applications** → same problem in spirit; writing inside a bundle that
  lives in `/Applications` can also hit Gatekeeper/App Translocation restrictions (see below).

A **zip** target sidesteps all of this: unzip anywhere you have write access, run the exe/`.app`
directly from wherever you put it, and `appConfig.json` lands right beside it exactly as
designed — zero code changes needed.

## Config (`package.json` → `"build"`)

```json
"build": {
  "appId": "com.allanbealsgibson.sieve",
  "productName": "Sieve",
  "asarUnpack": ["**/node_modules/ffmpeg-static/**", "**/node_modules/ffprobe-static/**"],
  "win": { "target": "zip" },
  "mac": { "target": "zip", "identity": null }
}
```

- **`asarUnpack`** — `ffmpeg-static`/`ffprobe-static` ship real executables. Electron can't
  execute a binary from *inside* an `asar` archive, so these two packages are unpacked to a
  parallel `app.asar.unpacked/` directory at build time. `resolveBinaryPath()` (duplicated in
  both `thumbnails.ts` and `thumbnail-worker.ts`) does the corresponding `app.asar` →
  `app.asar.unpacked` string substitution at runtime — a no-op in dev, where there's no `asar`
  at all.
- **`mac.identity: null`** — no Apple Developer certificate exists for this project, so this
  explicitly skips any identity lookup rather than letting electron-builder search for one and
  fail. The resulting `.app` is unsigned/ad-hoc-signed; see the Gatekeeper note below.
- **No `win.certificateFile`** — same reasoning for Windows; the build proceeds unsigned.
- **No `icon`** — no icon asset exists yet; electron-builder falls back to Electron's default
  icon. Adding a real one later is a config-only change (`build.win.icon` / `build.mac.icon`
  pointing at `.ico`/`.icns` files), no other packaging changes needed.
- **No native-module rebuild step** — the SQLite layer uses Node's built-in `node:sqlite`, not a
  compiled addon, so there's nothing for `@electron/rebuild` to actually do there (it still runs
  as part of `electron-builder`'s pipeline, it just has nothing native of ours to rebuild).

## Building each platform

### macOS

```bash
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn dist:mac
```

Produces `dist/mac-<arch>/Sieve.app` (unpacked) and `dist/Sieve-<version>-<arch>-mac.zip`.
Defaults to the *host* machine's architecture (arm64 on Apple Silicon) — that's correct here
since "for local use" means running on the machine that built it.

**Gatekeeper note**: a locally-built, unsigned `.app` that you launch directly (via `open` or
double-click, never downloaded through a browser) runs fine with no quarantine flag. If you ever
*transfer* this `.app` to another Mac (AirDrop, USB, a zip downloaded from somewhere), macOS
will quarantine it and Gatekeeper will refuse to open it normally — right-click → Open once to
bypass, or `xattr -cr Sieve.app` to strip the quarantine flag entirely. This is expected for an
unsigned build and not a bug to fix.

**Settings-write caveat (locally built, not fixed — see below)**: verified directly that
`Contents/MacOS/` inside the built `.app` is writable under the same user/permissions the app
runs with, for a build that's run directly where it was built. If the `.app` is ever downloaded
(quarantined) rather than built locally, macOS's App Translocation can run it from a randomized,
read-only mount instead of its real location — which would break the write. Not fixed here
because it doesn't apply to the actual use case (build-and-run-locally); if this app is ever
distributed to *other* Mac users, revisit `getSettingsPath()` to place `appConfig.json` next to
the `.app` bundle instead of inside `Contents/MacOS/`, which survives translocation more
reliably.

### Windows

**Must be run on an actual Windows machine.** This isn't a style preference — building the
Windows target from macOS produces a build that reports success but is **broken** (see the
`ffmpeg-static` explanation below). The build must happen on Windows itself.

**Setup (PowerShell)** — the `PATH="..."yarn <cmd>` prefix used throughout this repo's docs
elsewhere is **bash syntax and will not work in PowerShell or CMD**. On a real Windows machine,
install Node 22.22.2 directly (via [nvm-windows](https://github.com/coreybutler/nvm-windows) or
the plain [nodejs.org](https://nodejs.org/) installer) so it's just the active `node`/`yarn` on
`PATH` — the bash `PATH=...` prefix trick exists only to work around this Mac's system Node
being a version jsdom rejects; a fresh Windows install with the right Node version installed
doesn't need it at all:

```powershell
git clone <this repo>
cd sieve
nvm install 22.22.2   # if using nvm-windows
nvm use 22.22.2
corepack enable        # or: npm install -g yarn
yarn install
yarn dist:win
```

If `yarn install` fails with the same jsdom engine error documented in
[TROUBLESHOOTING.md](TROUBLESHOOTING.md), it means Node 22.22.2 isn't actually the active
version — check `node --version` before retrying, there's no PowerShell equivalent of the bash
`PATH=` prefix workaround; you have to actually switch the active Node version.

Building the Windows target from macOS instead of Windows produces a build that reports success
but is **broken**:

> `ffmpeg-static`'s `install.js` downloads only *one* binary — matching the platform/arch of the
> machine running `yarn install` — not a copy for every platform. Its `index.js` then resolves
> the binary's filename **at runtime**, based on that process's own `os.platform()`. Build the
> Windows target on a Mac, and the packaged app ships a macOS Mach-O file literally named
> `ffmpeg` (no extension) where the Windows-running code will look for `ffmpeg.exe` — resolves to
> `null`, and `thumbnail-worker.ts` throws immediately (`"ffmpeg-static did not resolve a binary
> for this platform"`) the moment thumbnailing runs. `ffprobe-static` is unaffected — it ships
> prebuilt binaries for every platform inside the npm package itself, so it doesn't have this
> problem.

Running `yarn install` (which triggers `ffmpeg-static`'s own postinstall) **on the Windows
machine itself** resolves this automatically — that machine downloads the correct
`win32`/`x64` binary at install time. This is exactly what the "clone the repo onto the Windows
machine, build there" workflow already does; the bug only bites you if you try to cross-build
the Windows package from macOS instead — which was tried once during setup, purely as a
build-time sanity check, and is not the actual delivery path.

The script explicitly pins `--x64`:

```json
"dist:win": "electron-vite build && electron-builder --win --x64 --publish never"
```

Without it, `electron-builder --win` defaults to the *host* machine's architecture — building
from an Apple Silicon Mac would silently produce an **ARM64 Windows** build, which won't run on
a typical x64 Windows PC. Pinning `--x64` makes the target explicit regardless of what machine
happens to run the build.

Produces `dist/win-unpacked/Sieve.exe` (unpacked) and `dist/Sieve-<version>-win.zip`.

**SmartScreen note** (the direct Windows equivalent of the macOS Gatekeeper note above): an
unsigned `.exe` triggers a "Windows protected your PC" SmartScreen warning on first run. Click
"More info" → "Run anyway". Expected for an unsigned build, not a bug.

**Trash folder visibility**: soft-deleted files move to a `.dir-explorer-trash` folder under the
scanned root (see [ARCHITECTURE.md](ARCHITECTURE.md)). The leading dot hides it by convention on
macOS/Linux, but Windows has no such convention (hidden files there are an NTFS attribute, not a
naming pattern) — so on Windows this folder will show up as an ordinary visible folder in File
Explorer. Not a functional bug, just a rough edge nobody's smoothed over yet.

### What's still genuinely untested

Everything above the two notes just made has been verified at the build/packaging level
(binaries unpack correctly, run standalone, settings path is writable) — **not** through a real
run on a real Windows machine. Concretely still unverified: chokidar's Windows filesystem-watch
backend, actual drive-letter path handling end to end, real NTFS permission behavior, and
anything that only shows up by actually clicking through the app. Source-level review (grepping
for hardcoded `/` path-joining) found nothing suspicious — everything goes through `node:path`'s
platform-aware `join`/`dirname`/`sep` — but that's static review, not a substitute for actually
running it. Treat the first real run on Windows as the actual test, not this build step.
