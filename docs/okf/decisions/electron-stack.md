---
type: Decision
title: Electron Stack
description: okfview is an Electron desktop app (Node main + React renderer) because a great OKF viewer needs native file watching plus web-grade UI.
tags: [decision, electron, stack]
timestamp: 2026-06-17T00:00:00Z
---

# Electron Stack

**Decision:** build okfview as an Electron app: a Node main process plus a React renderer.

# Rationale

- The viewer needs real **filesystem access, file watching, and remote fetching** — squarely
  Node territory and the core reason the [architecture](/architecture/overview.md) is native.
- The UI quality bar is high; that is web-tech's strength (Markdown rendering, the Cytoscape
  graph).
- Electron packages both into a cross-platform desktop binary installable from the repo.

# Trade-offs

A ~150 MB binary, accepted for the developer-tool audience. The alternative stacks
(Tauri, a pure static web app) were weaker on either the Go-adjacent toolchain or the
live-watch requirement. The persistence trade-off is captured in [JSON, not SQLite](/decisions/json-not-sqlite.md).
