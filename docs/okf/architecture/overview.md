---
type: Architecture
title: Architecture Overview
description: okfview is a shared OKF core wrapped by an Electron main process, a sandboxed React renderer, and an MCP server.
resource: https://github.com/ryansann/okfview/blob/main/DESIGN.md
tags: [architecture, electron, overview]
timestamp: 2026-06-18T00:00:00Z
---

# Overview

okfview has four parts:

- The **[OKF core](/architecture/okf-core.md)** — pure TypeScript that parses OKF documents, resolves links, and builds the concept graph. No Electron or DOM dependencies, so it is unit-testable and reused everywhere (including the [MCP server](/architecture/mcp-server.md)).
- The **[main process](/architecture/main-process.md)** — owns all I/O: the workspace registry, [source adapters](/architecture/source-adapters.md), file watching, settings persistence, and the MCP server.
- The **[renderer](/architecture/renderer.md)** — a sandboxed React app that is pure presentation.
- The **[context bridge](/architecture/context-bridge.md)** — the only channel between them.

# Data flow

A [source adapter](/architecture/source-adapters.md) loads a bundle's files, the
[OKF core](/architecture/okf-core.md) parses them into a [Bundle](/reference/data-model.md),
and the workspace holds it. The renderer mirrors that state over the
[context bridge](/architecture/context-bridge.md) and patches it live as files change —
see [live sync](/features/live-sync.md).

# Citations

[1] [DESIGN.md](https://github.com/ryansann/okfview/blob/main/DESIGN.md)
