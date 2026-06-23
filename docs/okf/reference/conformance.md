---
type: Reference
title: Conformance
description: The three rules a bundle must satisfy, and the permissive contract that forbids consumers from rejecting bundles.
resource: https://github.com/ryansann/okfview/blob/main/src/shared/okf/lint.ts
tags: [okf, conformance, validation]
timestamp: 2026-06-18T00:00:00Z
---

# Conformance

# Schema

A bundle is conformant with OKF v0.1 if:

1. Every non-reserved `.md` file has a parseable YAML frontmatter block.
2. Every such block has a non-empty `type`.
3. Reserved files (`index.md`, `log.md`) follow their structure when present.

# The consumer contract

Consumers MUST NOT reject a bundle for: missing optional fields, unknown `type` values,
unknown extra keys, broken cross-links, or missing `index.md` files.

# Notes

okfview honors this strictly: the OKF core never throws and always produces a Bundle,
surfacing problems as [diagnostics](/features/diagnostics.md) instead. The
`validate_bundle` and `validate_document` MCP tools return these issues with suggested
fixes so agents can self-correct.
