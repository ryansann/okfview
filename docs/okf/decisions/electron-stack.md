---
type: Decision
title: Electron Stack
description: okfview is an Electron desktop app (Node main + React renderer) because a great OKF viewer needs native file watching plus web-grade UI.
tags: [decision, electron, stack]
timestamp: 2026-06-17T00:00:00Z
---

# Electron Stack

**Decision:** build okfview as an Electron app — a Node [main process](/architecture/main-process.md)
plus a React [renderer](/architecture/renderer.md).

# Rationale

- The viewer needs real **filesystem access and watching** (for [live sync](/features/live-sync.md))
  and **remote fetching** (git/HTTP [sources](/architecture/source-adapters.md)) — squarely
  Node territory.
- The UI quality bar is high; that is web-tech's strength (Markdown rendering, the Cytoscape
  [graph](/features/graph-view.md)).
- Electron packages both into a cross-platform desktop binary installable from the repo —
  see the [release process](/reference/release-process.md) for how it is built, signed, and shipped.

# Trade-offs

A ~150 MB binary, accepted for the developer-tool audience. The alternative stacks
(Tauri, a pure static web app) were weaker on either the Go-adjacent toolchain or the
live-watch requirement.
