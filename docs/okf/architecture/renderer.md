---
type: Module
title: Renderer
description: A sandboxed React + Vite app that is pure presentation; it mirrors workspace state over IPC and never touches the filesystem.
resource: https://github.com/ryansann/okfview/tree/main/src/renderer
tags: [renderer, react, ui]
timestamp: 2026-06-18T00:00:00Z
---

# Renderer

`src/renderer/` is a React app (Vite, Zustand store) running with `contextIsolation` on
and `nodeIntegration` off. It reaches the main process only through the
[context bridge](/architecture/context-bridge.md).

# Schema

| Area | Components |
|---|---|
| Shell | `App`, `Sidebar`, topbar, `Settings`. |
| Reading | [Document view](/features/document-view.md), `Markdown`, `Frontmatter`. |
| Exploring | [Graph view](/features/graph-view.md), [command palette](/features/search.md). |
| Surfacing | [Diagnostics](/features/diagnostics.md), `LogTimeline`, [non-conformance banner](/reference/conformance.md). |
| Agents | [MCP dashboard](/features/settings-and-mcp-dashboard.md), `McpPanel`. |
| Library | [Recents](/features/recents.md). |

# Notes

State lives in a single Zustand store. On a [live-sync](/features/live-sync.md) event the
store patches a bundle in place, preserving selection, scroll, and graph layout.
