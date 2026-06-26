---
type: Decision
title: Spec-Only Scope
description: okfview targets real Google OKF v0.1 only, not custom variants — a non-standard bundle renders as-is and is flagged, never specially parsed.
tags: [decision, scope, conformance]
timestamp: 2026-06-18T00:00:00Z
---

# Spec-Only Scope

**Decision:** support exactly the OKF v0.1 format — Markdown files with frontmatter — and
not invented variants.

# Background

A test bundle turned out to use a self-described "local OKF profile": a `manifest.yaml`
plus frontmatter-less Markdown, with a bespoke viewer that synthesized dozens of nodes.
okfview read its handful of real files correctly and so looked sparse by comparison. The
manifest is **not** part of OKF.

# Resolution

okfview stays faithful to the spec. Non-conformant bundles are still rendered (the
conformance contract forbids rejecting them) and a diagnostics banner explains why they
look the way they do. Agents can still fetch the format through the
[MCP tools](/reference/mcp-tools.md) and regenerate a proper bundle. This scope choice sits
beside [Electron Stack](/decisions/electron-stack.md): the app is native, but the format stays plain files.
