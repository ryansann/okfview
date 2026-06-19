---
type: Feature
title: Document View
description: Renders a concept as styled Markdown with diagrams, a first-class frontmatter header, internal navigation, and a backlinks rail.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/DocumentView.tsx
tags: [ui, markdown, reading]
timestamp: 2026-06-18T00:00:00Z
---

# Document View

The default view. It renders the concept body as GFM Markdown (tables, syntax
highlighting, and Mermaid diagrams) with a header built from the
[frontmatter](/reference/frontmatter-schema.md): a colored type pill, title, description,
tags, timestamp, and a launchable `resource` link.

# Behavior

- In-bundle links navigate internally; external links open in the browser; broken links are
  shown with a dotted underline (per the [conformance contract](/reference/conformance.md)).
- Fenced `mermaid` code blocks render as diagrams in the current light/dark theme. If a
  diagram has invalid syntax, okfview shows the source block and the Mermaid error instead
  of hiding the content.
- A right rail shows **Referenced by** (backlinks) and **Links to**, computed by
  `relations.ts` in the [OKF core](/architecture/okf-core.md).
- This document-first reading experience is okfview's main edge over the concept-graph-only
  static viewer that ships with the spec.

See also the [graph view](/features/graph-view.md) for the same relationships, visually.
