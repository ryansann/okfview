# okfview

A polished, open-source desktop viewer for **[OKF — Open Knowledge Format](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)** bundles. Open bundles from your **local filesystem** or **remote URLs**, browse them through a standardized UI, and watch them **stay in sync live** as the underlying files change.

Built with Electron + React + TypeScript. Spec-faithful and fully permissive per OKF v0.1 §9.

## Why

Google ships a static, single-bundle HTML visualizer inside each bundle. okfview is the missing **developer tool**: multi-bundle, multi-source, live-syncing, with a document-first reading experience, a relationship graph, full-text search, and a conformance/diagnostics view.

## Features

- **Local & remote sources** — open a folder, a git repo (`…repo.git#optional/subpath`), or a `.tar.gz` archive URL.
- **Live sync** — local bundles are watched (chokidar); edits/additions/deletions appear instantly without losing your place. Remote sources poll for changes (git HEAD diff, HTTP `ETag`/`Last-Modified`).
- **Document view** — rendered Markdown (GFM tables, syntax highlighting) with a first-class frontmatter header (type pill, tags, timestamp, resource link), backlinks, and outgoing links.
- **Graph view** — interactive Cytoscape graph of the concept link-graph, colored by `type`, with filtering and layouts.
- **Command palette** (`⌘K` / `Ctrl+K`) — full-text search across every open bundle (titles, types, tags, **and body text**).
- **Log timeline** — renders `log.md` change history as a dated timeline.
- **Diagnostics** — surfaces OKF v0.1 conformance issues (missing `type`, unparseable frontmatter, broken links) — all informational, never rejecting, exactly as the spec mandates.
- **MCP server for coding agents** — expose your open bundles to AI agents over the Model Context Protocol (see below).
- **Light / dark themes.**

## MCP server (connect your coding agents)

okfview can run a built-in [MCP](https://modelcontextprotocol.io) server so coding
agents (Claude Code, Cursor, …) can discover and browse your OKF bundles in
realtime — reads always reflect the live, file-watched workspace.

**Enable, scope & monitor it** from **Settings → Agents (MCP)** (gear icon in the top
bar, or click the status chip at the bottom of the sidebar). The dashboard shows live
server status & uptime, the connect URL, **active agent connections**, a **realtime
tool-call activity log**, request stats, and per-bundle **scope** checkboxes — only
*shared* bundles are exposed to agents. A quick **◉ / ◌** toggle also sits on each
bundle in the sidebar when MCP is on.

**Connect Claude Code** (the panel shows the exact command with your port):

```bash
claude mcp add --transport http okfview http://127.0.0.1:7331/mcp
```

**Tools exposed:**

| Tool | What it does |
|---|---|
| `list_bundles` | List shared bundles (id, label, source, concept count, types, conformance) |
| `list_concepts` | A bundle's table of contents (conceptId, title, type, tags) |
| `read_concept` | One concept: frontmatter, body, links-to, external links, backlinks |
| `search_concepts` | Full-text search across shared bundles (title/type/tags/body) |
| `get_bundle_diagnostics` | OKF v0.1 conformance report for a bundle |
| `get_okf_spec` | The OKF v0.1 spec reference — so an agent can author correct OKF |
| `validate_bundle` | Conformance issues for a bundle, each with a suggested fix |
| `validate_document` | Validate a single draft document (frontmatter + body) before writing it |

The last three let an agent **debug the OKF it authors**: learn the format, validate a
concept it's drafting, then validate the whole bundle. The server binds to `127.0.0.1`
only and is **off by default**. Settings (enabled, port) and your shared-bundle scope
persist across restarts.

## Persistence

okfview keeps a small JSON store in your OS app-data dir (`okfview-settings.json`):

- **Open bundles auto-restore** on the next launch — local folders re-read instantly,
  git/http sources re-sync in the background. No re-importing.
- **Recent bundles** — every bundle you've imported is remembered, so even after you
  *close* one it's one click to reopen from the **Recent** list (welcome screen, or the
  **Recent ▾** button in the sidebar). Forget any with the ✕.
- MCP enabled/port and your per-bundle share scope persist too.

No database — it's a single JSON file you can read or delete.

## Install on macOS

Grab the latest `.dmg` (arm64 or x64) from the
[**Releases**](https://github.com/ryansann/okfview/releases) page and drag okfview
to Applications. Builds are currently **unsigned**, so on first launch macOS
Gatekeeper will warn — right-click the app → **Open**, or run
`xattr -dr com.apple.quarantine /Applications/okfview.app`.

Releases are produced by `.github/workflows/release.yml` on a `v*` tag
(`git tag v0.1.0 && git push origin v0.1.0`) via electron-builder. To ship signed
& notarized builds, add `CSC_LINK` / `CSC_KEY_PASSWORD` / Apple ID secrets and drop
the `CSC_IDENTITY_AUTO_DISCOVERY: false` line in the workflow.

## OKF conformance

okfview implements the OKF v0.1 consumer contract faithfully:

- Only `type` is required; all other frontmatter is optional and unknown keys are preserved.
- Concept ID = file path minus `.md`.
- Links resolve as bundle-absolute (`/x/y.md`) or relative (`./y.md`, `../y.md`); broken links are shown, not rejected.
- `index.md` (TOC) and `log.md` (history) are reserved; `okf_version` is read only from the bundle-root `index.md`.
- A bundle is **never rejected** for missing optional fields, unknown types/keys, broken links, or missing index files (spec §9).

## Develop

```bash
npm install
npm run dev        # launch with HMR
npm run build      # type-check + bundle to out/
npm test           # core parser/graph tests against real fixtures
npm run typecheck  # tsc on main+preload+shared and renderer
npm run dist       # package an installer (electron-builder)
```

Open a bundle on launch (handy for development):

```bash
OKF_OPEN="$PWD/fixtures/ga4" npm start
```

## Project layout

```
src/
  shared/okf/        # framework-agnostic OKF core: parse, links, graph, relations, types
  shared/ipc.ts      # main↔renderer IPC contract
  main/              # Electron main: window, menu, workspace, settings
    sources/         # source adapters (local/git/http)
    mcp/             # MCP server + tool defs (exposes scoped bundles to agents)
  preload/           # contextBridge security boundary → window.okf
  renderer/          # React UI (sidebar, document, graph, palette, diagnostics, log, MCP panel)
fixtures/            # the three official OKF sample bundles (ga4, stackoverflow, crypto_bitcoin)
tests/               # vitest suite over the core + fixtures
scripts/             # inspect.mjs (bundle diagnostics), mcp-smoke.mjs (MCP client test)
.github/workflows/   # ci.yml (typecheck/test/build) + release.yml (macOS dmg/zip)
DESIGN.md            # architecture & rationale
```

## License

Apache-2.0, matching the OKF ecosystem.
