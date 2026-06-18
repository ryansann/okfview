---
type: Feature
title: Graph View
description: An interactive Cytoscape graph of the concept link-graph, with nodes colored by type and filters by type and tag.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/GraphView.tsx
tags: [ui, graph, cytoscape]
timestamp: 2026-06-18T00:00:00Z
---

# Graph View

Renders the bundle as a directed graph: each concept is a node colored by its `type`, each
resolved Markdown link is an edge. Built on Cytoscape.

# Behavior

- Filter by type or tag, switch layouts (force / concentric / breadth-first / circle / grid),
  highlight by search, and click a node to open it in the [document view](/features/document-view.md).
- The active concept is centered and emphasized.
- Edges come from the same link resolution the [OKF core](/architecture/okf-core.md) computes,
  so the graph and the [document](/features/document-view.md) backlinks always agree.

# Notes

The graph shows one node per concept *file* — the OKF model. (A non-standard bundle that
encodes concepts in a manifest instead of files will look sparse; that is expected, see
[spec-only scope](/decisions/spec-only-scope.md).)
