---
type: Reference
title: Data Model
description: okfview's internal types — Bundle, Concept, Link, and Diagnostic — produced by the OKF core and shared across all layers.
resource: https://github.com/ryansann/okfview/blob/main/src/shared/okf/types.ts
tags: [types, model, core]
timestamp: 2026-06-18T00:00:00Z
---

# Data Model

The types in `src/shared/okf/types.ts` are the contract between the OKF core, the main
process, and the renderer.

# Schema

| Type | Key fields |
|---|---|
| `Bundle` | `id`, `label`, `source`, `okfVersion?`, `shared?`, `concepts[]`, `indexes[]`, `logs[]`, `types[]`, `diagnostics[]` |
| `Concept` | `id`, `filePath`, `type`, `frontmatter`, `title?`, `description?`, `resource?`, `tags[]`, `timestamp?`, `body`, `outgoing[]` |
| `Link` | `href`, `text`, `targetId?`, `external?`, `broken` |
| `Diagnostic` | `severity`, `code`, `file`, `message` |

# Notes

A `Concept.id` is its path minus `.md`. A `Link` is resolved to either an in-bundle
`targetId`, an `external` URL, or flagged `broken` — the basis for graph edges and document
backlinks.
