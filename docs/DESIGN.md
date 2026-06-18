# okfview — Design Document

> An open-source desktop dev tool for viewing **OKF (Open Knowledge Format)** bundles
> from the local filesystem and remote URLs, with a polished, standardized UI that
> stays live-synced as on-disk files change.

**Status:** Draft v0.1 · **Date:** 2026-06-17 · **Stack:** Electron (Node main + React/Vite renderer)

---

## 1. Background: what OKF is

OKF v0.1 (Google Cloud, published 2026-06-12; spec: `okf/SPEC.md` in
[`GoogleCloudPlatform/knowledge-catalog`](https://github.com/GoogleCloudPlatform/knowledge-catalog), Apache 2.0)
represents knowledge as **a directory of UTF-8 Markdown files with YAML frontmatter**.
No SDK, no runtime, no schema registry. The facts that drive this design:

| Aspect | Rule (verbatim from spec) |
|---|---|
| **Bundle** | A directory tree of markdown files. The unit of distribution. May ship as a git repo (recommended), tarball/zip, or subdirectory of a larger repo. |
| **Concept** | One markdown doc = one concept. **Concept ID = file path minus `.md`** (e.g. `tables/users.md` → `tables/users`). |
| **Frontmatter** | YAML block delimited by `---`. **Only `type` is REQUIRED** (free-form string, no central taxonomy). Recommended-optional: `title`, `description`, `resource` (URI), `tags` (list), `timestamp` (ISO 8601). Producers MAY add arbitrary keys; consumers MUST preserve them. |
| **Body** | Standard markdown. Conventional (not required) section headings: `# Schema`, `# Examples`, `# Citations`. |
| **Links** | Plain markdown links = the knowledge graph. **Absolute/bundle-relative** (`/tables/customers.md`, recommended) or **relative** (`./other.md`, `../x/y.md`). Untyped — meaning is in the prose. |
| **Reserved: `index.md`** | Directory listing for progressive disclosure. **Contains NO frontmatter** — except the **bundle-root** `index.md`, the ONLY place frontmatter is allowed in an index, and ONLY to declare `okf_version: "0.1"`. Body = sections of bulleted links. |
| **Reserved: `log.md`** | Change history. `## YYYY-MM-DD` headings (ISO 8601), newest first, bulleted prose entries with a leading bold verb (`**Update**`, `**Creation**`, `**Deprecation**`). |
| **Versioning** | `<major>.<minor>`. Minor = backward-compatible additions. Declared optionally via root-index `okf_version`. |

### Conformance (spec §9) — the parser's contract
A bundle is conformant iff:
1. Every **non-reserved** `.md` file has a parseable YAML frontmatter block.
2. Every such frontmatter block has a **non-empty `type`**.
3. Reserved files (`index.md`, `log.md`) follow their structure when present.

Consumers **MUST NOT reject** a bundle for: missing optional fields, unknown `type`
values, unknown extra keys, **broken cross-links**, or missing `index.md`. This
permissive model is mandatory — our parser surfaces all of these as **non-blocking
diagnostics**, never hard failures.

### What's already out there (and why we're not duplicating it)
Google ships two reference implementations inside the one `enrichment_agent` Python package:
- **Enrichment Agent** — generates OKF from BigQuery via Google ADK + Gemini. *(Out of scope for us — we're a viewer, not a generator.)*
- **Static HTML Visualizer** (`viewer/generator.py` → `viz.html`) — emits a single
  self-contained HTML file **committed inside each bundle**. Cytoscape + `marked` from
  CDN, ~243 lines JS. Features: graph view, search by title/id/tag, type filter, layout
  switcher, basic backlinks. **Limitations we exploit:** frozen at generation time,
  single bundle, no remote sources, no live sync, graph-centric with weak document
  reading, no full-text/body search, no conformance surfacing.

**Our wedge = the three things their viewer can't do:** multi-source (local + remote),
live re-sync on change, and a genuinely polished multi-bundle reading+graph UI.

### Real-world fixtures (in the repo, use as test data)
`okf/bundles/{ga4,stackoverflow,crypto_bitcoin}` — real generated bundles.
`okf/samples/` holds the reproduction recipes. Observed in the wild:
- Types like `BigQuery Table`, `BigQuery Dataset`, `Metric`, joins, references.
- **Relative links used in practice** (`../references/metrics/event_count.md`) despite
  the spec recommending absolute — resolver must handle both.
- `tags` appear in both flow (`[a, b]`) and block-sequence YAML form.
- `timestamp` appears both as `...Z` and `...+00:00`, sometimes quoted.
- A `viz.html` (Google's viewer) sits inside each bundle dir — we ignore non-`.md`
  files for parsing but may offer "open Google's static viz" as a courtesy.

---

## 2. Goals & non-goals

### Goals
1. **View any OKF bundle** faithfully, from **local folders** and **remote URLs**.
2. **Standardized UI** — one consistent, high-quality experience across all bundles.
3. **Live sync** — local edits reflect near-instantly without losing UI state; remote
   sources refresh on a sensible cadence.
4. **Spec-faithful, permissive parsing** — conformant to §9; never reject; surface
   diagnostics.
5. **UI quality is the headline feature.** If it isn't delightful, it won't get used.

### Non-goals (v1)
- Generating/editing OKF (we're read-only; editing is a possible v2).
- Authentication to private remotes beyond standard git credential helpers / tokens.
- Re-implementing the enrichment agent.
- A web-hosted SaaS (desktop-first; a server mode is a later option).

---

## 3. Architecture

```
┌─────────────────────────────── Electron app ───────────────────────────────┐
│                                                                             │
│  MAIN PROCESS (Node)                      RENDERER (React + Vite)           │
│  ─────────────────────                    ────────────────────────         │
│  Workspace registry                       App shell / routing               │
│  Source adapters:                  IPC    ┌─ Sidebar: bundles + file tree   │
│    • LocalFolderSource ──┐      (preload   ├─ Document view (md + frontmt.)  │
│    • GitSource          ─┼──►  contextBridge)─ Graph view (Cytoscape)       │
│    • HttpTarballSource  ─┘       typed API ├─ Search (cmd palette)          │
│  Watcher (chokidar)                        ├─ Log timeline                   │
│  Remote poller (ETag / git SHA)            └─ Diagnostics panel             │
│  OKF CORE (shared TS, used both sides):                                     │
│    parse frontmatter (gray-matter) · build graph · resolve links ·          │
│    validate (§9) · index for search                                         │
│                                                                             │
│  Cache dir: remotes cloned/unpacked under app.getPath('userData')/bundles  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Process responsibilities**
- **Main** owns all I/O and OKF parsing. It's the single source of truth for bundle
  state. It watches/polls sources and emits `bundle:changed` deltas.
- **Preload** exposes a minimal typed API over `contextBridge`. `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`. No Node globals in the renderer.
- **Renderer** is pure presentation + interaction. It holds a mirror of bundle state and
  applies deltas in place (preserving selection, scroll, graph layout, expanded tree
  nodes).

**Why parsing lives in main:** filesystem access, consistent state, and so the renderer
can stay a sandboxed pure-UI surface. The OKF core is isolated as a framework-agnostic TS
package so it's independently unit-testable and could later back a CLI or server.

### 3.1 OKF core (the heart) — `packages/okf-core`
Pure TS, no Electron/DOM deps. Public surface:
```ts
parseConcept(path, raw): { id, frontmatter, body, type, diagnostics }
parseIndex(path, raw):   { entries, okfVersion?, diagnostics }   // root-index may carry okf_version
parseLog(path, raw):     { entries: { date, items }[], diagnostics }
buildBundle(files):      Bundle   // nodes + edges + type set + search index + diagnostics
resolveLink(fromId, href, bundleRoot): targetId | externalUrl | null
validate(bundle):        Diagnostic[]   // §9 conformance, all non-fatal
```
- **Frontmatter:** `gray-matter` (js-yaml under the hood) — handles flow/block lists,
  quoted/unquoted/offset timestamps.
- **Link resolution:** normalize `/abs`, `./rel`, `../rel` against concept ID; strip
  `.md`; flag unresolved targets as `broken-link` diagnostics (NOT errors).
- **Graph:** nodes = concepts; directed edges = links; compute backlinks. Reserved files
  excluded from the node set but available as overlays (index = TOC, log = timeline).
- **Search index:** title, id, type, tags, **and body text** (our edge over Google's
  title/id/tag-only search). Lightweight client-side index (MiniSearch/FlexSearch).

### 3.2 Source adapters — `main/sources/*`
Common interface so the UI treats every bundle identically:
```ts
interface Source {
  kind: 'local' | 'git' | 'http'
  load(): Promise<RawBundle>          // returns file list + contents
  watch(onChange): Disposable | null  // local: chokidar; remote: poll loop
  describe(): { label, origin, lastSynced }
}
```
- **LocalFolderSource** — read tree, `chokidar` watch (debounced ~150ms, ignore `.git`,
  `node_modules`, non-`.md` except we note `viz.html`). On change → re-parse only the
  affected file(s) → emit delta.
- **GitSource** — `simple-git` (or `isomorphic-git` for zero system-git dependency) clone
  to cache; refresh = `fetch` + compare HEAD SHA; on change pull and diff changed paths.
- **HttpTarballSource** — fetch a `.tar.gz`/`.zip`; **change detection via `ETag` /
  `Last-Modified`** conditional requests on a poll interval; re-unpack + diff on change.
  (Single raw-file URLs aren't a bundle; we require an archive or a git/dir URL.)

### 3.3 Live-sync model
- Local: filesystem event → main re-parses the one file → computes a **delta**
  (added/changed/removed concept, recomputed affected edges) → `bundle:changed` IPC →
  renderer patches state. The currently-open doc shows a subtle "updated" pulse; the graph
  animates only the changed nodes; layout is preserved.
- Remote: poll on interval (default git 60s, http via ETag 120s; configurable; manual
  "Sync now" always available). Same delta path on the renderer.
- **State preservation is a hard requirement** — never full-reload the renderer on sync.

---

## 4. UI design — the part that has to be great

**Layout:** three panes. Left = **workspace** (bundle list with source-kind badges + live
status dot; expandable file tree per bundle). Center = **primary view** (Document or
Graph, toggled). Right = **context** (frontmatter, backlinks, citations, diagnostics).

**Document view (default, our differentiator vs Google's graph-first viewer)**
- Beautifully rendered markdown (`react-markdown` + remark/rehype, GFM tables, Shiki
  syntax highlighting).
- Frontmatter rendered as a clean metadata header: `type` as a colored pill, `title`,
  `description`, `tags` as chips, `timestamp` relative + absolute, `resource` as a
  launchable link.
- `# Schema` / `# Examples` / `# Citations` get first-class styling (schema tables,
  copyable code, numbered citation list).
- In-bundle links are internal navigation; external links open in browser. Broken links
  rendered with a dotted underline + "not yet written" tooltip (per spec semantics).
- Right rail: **Backlinks** ("referenced by"), outgoing links, citations.

**Graph view**
- Cytoscape (proven by Google's own viewer) — but multi-bundle-aware, nodes colored by
  `type`, filter by type/tag, layout switcher, click → opens document view. Focus/neighbor
  highlighting. Live: changed nodes pulse.

**Cross-cutting**
- **Command palette** (Cmd/Ctrl-K): jump to any concept across all open bundles; full-text.
- **Log timeline**: render `log.md` as a vertical dated timeline.
- **Diagnostics panel**: conformance issues (missing `type`, unparseable frontmatter,
  broken links, malformed reserved files) — informational, with file links. This is a
  *developer* tool, so surfacing spec violations is a feature.
- Light/dark themes; keyboard-first navigation; remembered workspace on relaunch.

---

## 5. Data model (sketch)

```ts
type ConceptId = string  // path minus .md, forward-slashed, bundle-relative

interface Concept {
  id: ConceptId
  filePath: string
  type: string                       // required; '' → diagnostic
  frontmatter: Record<string, unknown>  // all keys preserved
  title?: string; description?: string
  resource?: string; tags: string[]; timestamp?: string
  body: string                       // raw markdown after frontmatter
  outgoing: Link[]                   // resolved + unresolved
}
interface Link { href: string; targetId?: ConceptId; external?: string; broken: boolean }
interface Bundle {
  id: string; label: string
  source: { kind; origin; lastSynced }
  okfVersion?: string                // from root index.md only
  concepts: Map<ConceptId, Concept>
  indexes: Map<string, IndexFile>    // dir → TOC
  logs: Map<string, LogFile>
  diagnostics: Diagnostic[]
}
interface Diagnostic { severity: 'info'|'warn'; code: string; file: string; message: string }
```

---

## 6. Tech choices

| Concern | Choice | Why |
|---|---|---|
| Shell | Electron | Chosen: cross-platform desktop, easy fs/remote in Node main. |
| Renderer | React + Vite + TypeScript | Chosen: richest ecosystem for graph/markdown. |
| Build/packaging | electron-vite + electron-builder | HMR in dev, signed installers for mac/win/linux. |
| Frontmatter/YAML | gray-matter (js-yaml) | Spec-grade YAML, lists/timestamps. |
| Markdown render | react-markdown + remark-gfm + rehype + Shiki | GFM tables, safe, gorgeous code. |
| Graph | Cytoscape.js | Battle-tested; Google's own viewer uses it. |
| Search | MiniSearch / FlexSearch | Fast client-side full-text incl. body. |
| File watch | chokidar | Robust cross-platform fs events. |
| Git remote | simple-git or isomorphic-git | SHA-diff change detection. |
| State | Zustand (or Redux Toolkit) | Simple delta-patchable store. |
| Tests | Vitest (core + main), Playwright (e2e on renderer) | Core logic + UI flows. |

---

## 7. Phased plan

1. **Scaffold** — electron-vite + React + TS; secure IPC skeleton (contextIsolation,
   sandbox); `okfview` launches an empty shell with the three-pane layout.
2. **OKF core + fixtures** — implement `packages/okf-core`; vendor the three official
   bundles as fixtures; unit tests asserting §9 conformance + link resolution (abs/rel)
   + reserved-file parsing (incl. root-index `okf_version`).
3. **Local source + live sync** — open folder → parse → document view → chokidar delta
   sync with state preservation. End-to-end on the `ga4` fixture.
4. **Graph + search + polish** — Cytoscape graph, command palette + full-text search,
   diagnostics panel, log timeline, theming, the visual-design pass.
5. **Remote sources** — GitSource (clone + SHA diff) and HttpTarballSource (ETag/
   Last-Modified poll), cache dir, "Sync now", per-source intervals.
6. **Package & release** — electron-builder installers, README, screenshots, license
   (Apache-2.0 to match the ecosystem), publish.

---

## 8. Open questions
- **isomorphic-git vs simple-git** — bundle a pure-JS git (no system dependency, larger
  binary) or shell out to the user's git (smaller, but requires git installed)? Leaning
  isomorphic-git for zero-dependency UX.
- **Editing** — read-only v1 is decided; revisit inline editing + write-back for v2.
- **Single-file `.tar.gz` URL vs git URL vs raw GitHub dir** — confirm which remote
  shapes to support first (proposal: git URL + tarball URL in v1; raw GitHub tree via
  API later).
- **"Open Google's viz.html"** — offer as a passthrough, or ignore entirely?
```
