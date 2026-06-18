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
runs in tests, the [main process](/architecture/main-process.md), and (for types) the
[renderer](/architecture/renderer.md).

# Schema

| File | Responsibility |
|---|---|
| `parse.ts` | Frontmatter (`gray-matter`), concept/index/log parsing. |
| `links.ts` | Extract Markdown links; resolve absolute (`/x.md`) and relative (`../x.md`) targets. |
| `graph.ts` | `buildBundle()` — assemble concepts, resolve the link graph, collect diagnostics. |
| `relations.ts` | `backlinksOf`, `outgoingTargets`, `conformanceSummary`. |
| `lint.ts` | Conformance issues with suggested fixes (used by the [MCP tools](/reference/mcp-tools.md)). |
| `spec.ts` | The OKF v0.1 reference text. |
| `types.ts` | The [data model](/reference/data-model.md). |

# Notes

Parsing is intentionally permissive per the [conformance contract](/reference/conformance.md):
it never throws and never rejects a bundle. `gray-matter` is only imported by `parse.ts`
and `lint.ts`, so those are main-process only; `spec.ts` and `types.ts` are safe in the renderer.
