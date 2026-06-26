---
type: Feature
title: Document View
description: Renders a concept as styled Markdown with diagrams, internal navigation, and a toggleable relations rail.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/DocumentView.tsx
tags: [ui, markdown, reading]
timestamp: 2026-06-18T00:00:00Z
---

# Document View

The default view. It renders the concept body as GFM Markdown (tables, syntax
highlighting, and Mermaid diagrams) with a header built from the
frontmatter: a colored type pill, title, description, tags, timestamp, and a launchable
`resource` link.

# Behavior

- In-bundle links navigate internally; external links open in the browser; broken links are
  shown with a dotted underline.
- Fenced `mermaid` code blocks render as diagrams in the current light/dark theme, with a
  per-diagram toggle for switching between the rendered diagram and Mermaid source. If a
  diagram has invalid syntax, okfview shows the source block and the Mermaid error instead
  of hiding the content.
- A right rail toggles between list mode (**Referenced by** and **Links to**) and a compact
  neighborhood map centered on the current concept. The [OKF core](/architecture/okf-core.md)
  computes those relations from the same links that power the graph.
- This document-first reading experience is okfview's main edge over the concept-graph-only
  static viewer that ships with the spec.

See [Graph View](/features/graph-view.md) for the same relationships as a directed map.
