---
type: Feature
title: Graph View
description: An interactive Cytoscape knowledge map of the concept link-graph, with central concepts near the center and progressive labels.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/GraphView.tsx
tags: [ui, graph, cytoscape]
timestamp: 2026-06-18T00:00:00Z
---

# Graph View

Renders the bundle as a directed knowledge map: each concept is a node colored by its
`type`, each resolved Markdown link is an edge. Built on Cytoscape.

# Behavior

- The default Knowledge Map layout scores concepts by link centrality, places highly
  connected concepts near the center, pushes leafier concepts outward, and separates
  disconnected components.
- Labels are progressive: central concepts are labeled by default, while peripheral labels
  appear on hover, search match, active selection, or when the **Labels** toggle is enabled.
- The **Edges** toggle hides link lines when labels or dense clusters need more room.
- Filter by type, highlight by search, and click a node to open it in the
  [document view](/features/document-view.md).
- The active concept is centered and emphasized.
- Manual node movement and pan/zoom state are remembered per bundle while the app is open,
  so switching away from the graph and back does not reset exploration.
- Edges come from the same link resolution the [OKF core](/architecture/okf-core.md) computes,
  so the graph and the [document](/features/document-view.md) backlinks always agree.

# Notes

The graph shows one node per concept *file* — the OKF model. (A non-standard bundle that
encodes concepts in a manifest instead of files will look sparse; that is expected, see
[spec-only scope](/decisions/spec-only-scope.md).)
