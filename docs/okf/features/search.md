---
type: Feature
title: Search
description: A command palette that does full-text search across every open bundle — titles, types, tags, and body text.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/CommandPalette.tsx
tags: [ui, search, palette]
timestamp: 2026-06-18T00:00:00Z
---

# Search

Press ⌘K / Ctrl-K to open the command palette and search across all open bundles. It
indexes title, concept id, type, tags, **and body text** with MiniSearch, returning ranked
hits with snippets; selecting one opens it in the [document view](/features/document-view.md).

# Notes

Body-text search is a deliberate step beyond the title/id/tag search of the spec's bundled
viewer. The same capability is available to agents as the `search_concepts`
[MCP tool](/reference/mcp-tools.md).
