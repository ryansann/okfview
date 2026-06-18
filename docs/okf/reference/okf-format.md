---
type: Reference
title: OKF Format
description: Open Knowledge Format v0.1 — a directory of Markdown files with YAML frontmatter, published by Google Cloud.
resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
tags: [okf, spec, format]
timestamp: 2026-06-18T00:00:00Z
---

# OKF Format

Open Knowledge Format v0.1 (Google Cloud, June 2026) represents knowledge as **a directory
of UTF-8 Markdown files with YAML frontmatter**. No manifest, no schema registry, no required
tooling. One file = one concept; the graph is built from ordinary Markdown links between files.

# Schema

- A concept's **id** is its file path minus `.md`.
- Frontmatter carries the metadata — see [frontmatter schema](/reference/frontmatter-schema.md).
- Reserved filenames: `index.md` (a directory's table of contents) and `log.md` (change
  history). This bundle uses both.
- Links are absolute (`/x/y.md`) or relative (`../y.md`) and are untyped.

# Notes

okfview implements this format faithfully — and only this format, by
[deliberate scope](/decisions/spec-only-scope.md). The full rules okfview enforces are in
[conformance](/reference/conformance.md), and okfview serves this same reference to agents via
the `get_okf_spec` [MCP tool](/reference/mcp-tools.md).

# Citations

[1] [OKF v0.1 specification](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md)
