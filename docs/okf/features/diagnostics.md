---
type: Feature
title: Diagnostics
description: Surfaces OKF v0.1 conformance issues — missing frontmatter or type, broken links — as information, never rejecting a bundle.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/DiagnosticsPanel.tsx
tags: [conformance, diagnostics, dx]
timestamp: 2026-06-18T00:00:00Z
---

# Diagnostics

A developer-facing panel that lists every [conformance](/reference/conformance.md) issue in
a bundle, grouped by kind, each linking to the offending file. A bundle with no issues shows
a "Conformant" badge.

# Behavior

- Issues are purely informational — per the spec, okfview never rejects a bundle.
- A non-conformance banner appears when a bundle has files without frontmatter or `type`, so
  a non-standard bundle explains itself rather than looking broken.
- The same checks back the `validate_bundle` and `validate_document`
  [MCP tools](/reference/mcp-tools.md), so agents can debug the OKF they author.
