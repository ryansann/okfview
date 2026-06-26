---
type: Module
title: OKF Core
description: The framework-agnostic TypeScript core that parses OKF documents, resolves links, and assembles the concept graph.
resource: https://github.com/ryansann/okfview/tree/main/src/shared/okf
tags: [core, parser, graph, shared]
timestamp: 2026-06-18T00:00:00Z
---

# OKF Core

`src/shared/okf/` is pure TypeScript with no Node or DOM dependencies, so the same code
runs in tests, the main process, and (for types) the renderer.

# Schema

| File | Responsibility |
|---|---|
| `parse.ts` | Frontmatter (`gray-matter`), concept/index/log parsing. |
| `links.ts` | Extract Markdown links; resolve absolute (`/x.md`) and relative (`../x.md`) targets. |
| `graph.ts` | `buildBundle()` — assemble concepts, resolve the link graph, collect diagnostics. |
| `relations.ts` | `backlinksOf`, `outgoingTargets`, `conformanceSummary`. |
| `lint.ts` | Conformance issues with suggested fixes. |
| `spec.ts` | The OKF v0.1 reference text. |
| `types.ts` | Shared Bundle / Concept / Link / Diagnostic types. |

# Notes

Parsing is intentionally permissive: it never throws and never rejects a bundle. The
[source adapters](/architecture/source-adapters.md) hand raw files to this core, and
`gray-matter` stays confined to parser code that runs under the main process. The rendered
[data model](/reference/data-model.md) reference mirrors these TypeScript contracts for
agents and contributors.
