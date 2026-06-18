---
type: Reference
title: MCP Tools
description: The eight tools okfview exposes to coding agents over MCP — browse, search, and debug OKF bundles.
resource: https://github.com/ryansann/okfview/blob/main/src/main/mcp/tools.ts
tags: [mcp, tools, agents]
timestamp: 2026-06-18T00:00:00Z
---

# MCP Tools

Served by the [MCP server](/architecture/mcp-server.md) over scoped bundles.

# Schema

| Tool | Purpose |
|---|---|
| `list_bundles` | Discover shared bundles (id, label, source, counts, conformance). |
| `list_concepts` | A bundle's table of contents. |
| `read_concept` | One concept: frontmatter, body, links-to, external links, backlinks. |
| `search_concepts` | Full-text [search](/features/search.md) across shared bundles. |
| `get_bundle_diagnostics` | A bundle's [conformance](/reference/conformance.md) report. |
| `get_okf_spec` | The [OKF v0.1 reference](/reference/okf-format.md), so an agent authors correct OKF. |
| `validate_bundle` | Every conformance issue in a bundle, each with a suggested fix. |
| `validate_document` | Validate a single draft document before writing it. |

# Notes

The last three exist so an agent can **debug the OKF it authors**: learn the format, validate
a draft concept, then validate the whole bundle. Reads reflect the
[live workspace](/features/live-sync.md).
