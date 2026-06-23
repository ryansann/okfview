---
type: Module
title: Main Process
description: The Electron main process owns all I/O — the workspace registry, source adapters, file watching, settings, and the MCP server.
resource: https://github.com/ryansann/okfview/tree/main/src/main
tags: [main, electron, workspace, io]
timestamp: 2026-06-18T00:00:00Z
---

# Main Process

`src/main/` is the only place with filesystem and network access. It is the single source
of truth for bundle state.

# Schema

| Piece | Role |
|---|---|
| `index.ts` | App lifecycle, window, CSP, [menu](https://github.com/ryansann/okfview/blob/main/src/main/menu.ts), IPC registration. |
| `workspace.ts` | The bundle registry: open, close, refresh, watch, reorder, and scope bundles. |
| `sources/` | The [source adapters](/architecture/source-adapters.md). |
| `settings.ts` | JSON persistence for recents, MCP settings, bundle order, and graph state. |
| `mcp/` | The [MCP server](/architecture/mcp-server.md). |

# Notes

The workspace stamps every `Bundle.id` to its source id so the registry map key, IPC
lookups, and the renderer all agree. It emits change events that drive live sync and
refresh MCP status.
