---
type: Feature
title: Live Sync
description: Bundles stay current as their files change — local folders are watched and the UI is patched in place without losing state.
resource: https://github.com/ryansann/okfview/blob/main/src/main/sources/local.ts
tags: [sync, watching, realtime]
timestamp: 2026-06-18T00:00:00Z
---

# Live Sync

A core differentiator: open a bundle and edit its files, and okfview reflects the change
near-instantly.

# How it works

1. A [source adapter](/architecture/source-adapters.md) watches the origin — `chokidar` for
   local folders, polling for git/HTTP.
2. On change, the [main process](/architecture/main-process.md) re-loads and re-parses via
   the [OKF core](/architecture/okf-core.md) and emits a change event over the
   [context bridge](/architecture/context-bridge.md).
3. The [renderer](/architecture/renderer.md) patches the bundle in its store **in place** —
   selection, scroll, and [graph](/features/graph-view.md) layout are preserved; the
   [MCP](/features/settings-and-mcp-dashboard.md) scope updates too.

# Notes

Because reads always reflect the live workspace, agents connected over
[MCP](/architecture/mcp-server.md) see the same fresh state with no extra work.
