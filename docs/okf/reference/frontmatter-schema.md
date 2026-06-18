---
type: Reference
title: Frontmatter Schema
description: The YAML fields an OKF concept may carry — only `type` is required; everything else is optional and preserved.
resource: https://github.com/ryansann/okfview/blob/main/src/shared/okf/spec.ts
tags: [okf, frontmatter, schema]
timestamp: 2026-06-18T00:00:00Z
---

# Frontmatter Schema

# Schema

| Field | Required | Type | Notes |
|---|---|---|---|
| `type` | **yes** | string | The only required field. Free-form (e.g. `Module`, `Feature`, `Reference`). |
| `title` | no | string | Display name; falls back to the filename. |
| `description` | no | string | One-sentence summary. |
| `resource` | no | URI | The underlying asset (omit for abstract concepts). |
| `tags` | no | list | Cross-cutting labels. |
| `timestamp` | no | ISO 8601 | Last meaningful change. |
| *(any other key)* | no | any | Preserved verbatim; consumers must not reject unknown keys. |

# Examples

Every concept in this bundle is an example — this file's own frontmatter declares
`type: Reference`. See the [OKF format](/reference/okf-format.md) for the surrounding rules
and [conformance](/reference/conformance.md) for what makes a bundle valid.
