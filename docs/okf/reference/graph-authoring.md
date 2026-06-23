---
type: Reference
title: Graph Authoring
description: How to write OKF documents so links produce a useful graph instead of a dense hairball.
resource: https://github.com/ryansann/okfview/tree/main/docs/okf
tags: [okf, authoring, graph]
timestamp: 2026-06-22T00:00:00Z
---

# Graph Authoring

The [graph view](/features/graph-view.md) treats every resolved Markdown link in the
[OKF format](/reference/okf-format.md) as an edge. That makes links meaningful data, not
just reader convenience.

# Rules

- Link when the target is a direct dependency, implementation owner, workflow handoff, or
  primary reference.
- Avoid linking every mentioned concept. Plain text is better when the relationship is
  incidental.
- Avoid duplicate links to the same target inside one concept.
- Put broad navigation in reserved `index.md` files. They guide readers without becoming
  graph nodes.
- Split a document when it mixes independent concerns that would naturally have different
  neighbors.

# Notes

A useful OKF graph should have local clusters, a few intentional hubs, and visible leaf
nodes. When everything links to everything else, the graph stops explaining the system.
