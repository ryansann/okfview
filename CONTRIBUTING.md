# Contributing to okfview

Thanks for your interest! okfview is a TypeScript + Electron app, and contributions -
issues, fixes, features, docs - are welcome.

## Prerequisites

- **Node.js 20+** (CI uses 22) and npm
- macOS, Linux, or Windows for development; packaged installers are currently macOS-only

## Setup

```bash
git clone https://github.com/ryansann/okfview.git
cd okfview
npm install
npm run dev        # launch the app with hot reload
```

Open a bundle on launch (handy while iterating):

```bash
OKF_OPEN="$PWD/docs/okf" npm start
```

Use a throwaway profile for preview capture without restoring your saved bundles/settings:

```bash
OKF_USER_DATA_DIR="$(mktemp -d)" OKF_OPEN="$PWD/docs/okf" npm run dev
```

## Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with HMR. |
| `npm run build` | Type-check-free bundle to `out/` (used by CI and packaging). |
| `npm run typecheck` | `tsc` over main + preload + shared, and the renderer. |
| `npm test` | Vitest unit tests (OKF core, relations, labels) against the fixtures. |
| `npm run inspect <dir>` | Diagnose any OKF bundle (concepts, links, conformance). |
| `npm run dist` | Build a macOS installer locally with electron-builder. |

Please run `npm run typecheck && npm test` before opening a PR.

## Repo layout

```
src/
  shared/okf/        framework-agnostic OKF core: parse, links, graph, relations, lint, spec, types
  shared/ipc.ts      main <-> renderer IPC contract
  main/              Electron main: window, menu, workspace, settings, label
    sources/         source adapters (local / git / http)
    mcp/             MCP server + tool definitions
  preload/           contextBridge security boundary -> window.okf
  renderer/          React UI (sidebar, document, graph, palette, diagnostics, MCP dashboard, settings)
docs/okf/            okfview's own docs, as a native OKF bundle (also a test fixture)
fixtures/            the three official OKF sample bundles
tests/               Vitest suite
scripts/             inspect.mjs (bundle diagnostics), mcp-smoke.mjs (MCP client test)
```

The full architecture lives in [`docs/okf/architecture/`](docs/okf/architecture/index.md)
and [`DESIGN.md`](DESIGN.md). The OKF core (`src/shared/okf/`) has no Electron or DOM
dependencies, so prefer putting logic there and keeping it unit-tested.

## Pull requests

1. Branch from `main`.
2. Keep changes focused; match the surrounding style.
3. Add or update tests for behavior changes.
4. Ensure `npm run typecheck` and `npm test` pass.
5. Open a PR describing the change and why. CI must be green.

## Releasing (maintainers)

The git tag is the source of truth for the version; no `package.json` bump needed.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

`.github/workflows/release.yml` builds the macOS `.dmg`/`.zip` (versioned from the tag) and
attaches them to that tag's GitHub Release via the `gh` CLI.
