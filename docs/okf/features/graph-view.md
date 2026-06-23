---
type: Feature
title: Graph View
description: An interactive Cytoscape knowledge map of the directed concept link-graph, laid out for readable flow, spacing, and labels.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/GraphView.tsx
tags: [ui, graph, cytoscape]
timestamp: 2026-06-18T00:00:00Z
---

# Graph View

Renders the bundle as a directed knowledge map: each concept is a node colored by its
`type`, each resolved Markdown link is a directed edge. Built on Cytoscape.

# Behavior

- The default Directed Layout assigns concepts to left-to-right ranks from link direction,
  orders each rank to reduce crossings, and reserves space for node labels.
- Labels are progressive: central concepts are labeled by default, while peripheral labels
  appear on hover, search match, active selection, or when the **Labels** toggle is enabled.
- Directed arrowheads sit outside node boundaries. Reciprocal links are curved apart so
  both directions remain visible.
- The **Edges** toggle hides link lines when labels or dense clusters need more room.
- Filter by type, highlight by search, and click a node to open it in the
  [document view](/features/document-view.md).
- The active concept is centered and emphasized.
- Manual node movement and pan/zoom state are remembered per bundle while the app is open,
  so switching away from the graph and back does not reset exploration.
- Edges come from the same link resolution the OKF core computes, so the graph and
  document backlinks always agree.

# Notes

The graph shows one node per concept *file* — the OKF model. (A non-standard bundle that
encodes concepts in a manifest instead of files will look sparse; that is expected, see
[spec-only scope](/decisions/spec-only-scope.md).)

The graph is only as legible as the link structure it draws — see [graph
authoring](/reference/graph-authoring.md) for how to write documents that produce a useful
map instead of a hairball.
