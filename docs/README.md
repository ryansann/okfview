# okfview — documentation

okfview documents itself **in the very format it views**. This directory is a native
[Open Knowledge Format](okf/reference/okf-format.md) bundle: okfview, dogfooding okfview. 🐶

➡️ **The bundle lives in [`okf/`](okf/index.md).** Open `docs/okf/` in okfview
(**Open folder…**) to browse it with the graph, search, backlinks, and diagnostics — or
connect a coding agent over MCP and point it at the bundle.

## What's inside `okf/`

| Section | What it covers |
|---|---|
| [architecture/](okf/architecture/index.md) | How okfview is built — the OKF core, Electron processes, the context bridge, source adapters, the MCP server. |
| [features/](okf/features/index.md) | What it does — document view, graph, search, live sync, recents, settings & the MCP dashboard. |
| [reference/](okf/reference/index.md) | The OKF format, frontmatter schema, conformance rules, the data model, and the MCP tools. |
| [decisions/](okf/decisions/index.md) | Why it's built the way it is — Electron, spec-only scope, JSON over SQLite. |

Every file under `okf/` is a conformant OKF v0.1 concept (Markdown + YAML frontmatter),
cross-linked into a graph. The bundle doubles as a real-world fixture for testing okfview.
