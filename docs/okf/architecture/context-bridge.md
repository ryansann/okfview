---
type: Module
title: Context Bridge
description: The secure preload boundary that exposes a narrow, typed window.okf API from the main process to the sandboxed renderer.
resource: https://github.com/ryansann/okfview/blob/main/src/preload/index.ts
tags: [ipc, security, preload]
timestamp: 2026-06-18T00:00:00Z
---

# Context Bridge

The proverbial context bridge. `src/preload/index.ts` uses Electron's `contextBridge` to
expose exactly one object — `window.okf` — to the [renderer](/architecture/renderer.md).
Nothing else crosses the boundary; the renderer has no Node access.

# Schema

The API and channel names are defined once in `src/shared/ipc.ts` and shared by all three
layers, so main, preload, and renderer cannot drift:

- Bundles: `listBundles`, `openLocalDialog`, `openGit`, `openHttp`, `getBundle`, `refreshBundle`, `closeBundle`, `setShared`.
- [Recents](/features/recents.md): `listRecents`, `openRecent`, `forgetRecent`.
- [MCP](/features/settings-and-mcp-dashboard.md): `mcpStatus`, `mcpSetEnabled`, `mcpSetPort`.
- Events: `onBundleChanged`, `onBundleError`, `onMcpChanged`.

# Notes

It is a nice double meaning: this `contextBridge` carries app context to the UI, while the
[MCP server](/architecture/mcp-server.md) bridges curated OKF *context* to AI models.
