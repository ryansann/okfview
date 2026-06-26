---
type: Feature
title: Diagnostics
description: Surfaces OKF v0.1 conformance issues — missing frontmatter or type, broken links — as information, never rejecting a bundle.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/DiagnosticsPanel.tsx
tags: [conformance, diagnostics, dx]
timestamp: 2026-06-18T00:00:00Z
---

# Diagnostics

A developer-facing panel that lists conformance and lint findings in a bundle, grouped by
severity, spec-vs-lint source, and okftool category. Each finding links to the offending
file, and a bundle with no issues shows a "Conformant" badge.

# Behavior

- Issues are purely informational — per the spec, okfview never rejects a bundle.
- A non-conformance banner appears when a bundle has files without frontmatter or `type`, so
  a non-standard bundle explains itself rather than looking broken.
- Diagnostics use the same renderer patterns as [Document View](/features/document-view.md): compact
  metadata first, then expandable context and direct navigation to the source concept.
- The same checks back the MCP validation tools, so agents can debug the OKF they author.
