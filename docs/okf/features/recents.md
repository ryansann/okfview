---
type: Feature
title: Recents
description: Every imported bundle is remembered so a closed bundle is one click to reopen, and open bundles auto-restore on launch.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/RecentsList.tsx
tags: [persistence, library, ux]
timestamp: 2026-06-18T00:00:00Z
---

# Recents

okfview keeps a library of every bundle you have imported.

# Behavior

- **Open bundles auto-restore** on the next launch (local re-reads instantly; remote
  re-syncs in the background).
- **Closed bundles are remembered** — reopen them in one click from the welcome screen or the
  **Recent ▾** button in the sidebar; ✕ forgets one.
- The recents list hides bundles that are already open, so it only offers what you can
  actually reopen.

# Notes

Recents (`kind`, `origin`, `label`, `lastOpened`) live in the
[JSON settings store](/decisions/json-not-sqlite.md), separate from the auto-restored open
set. Reopen reuses the same code path as restore and the [source adapters](/architecture/source-adapters.md).
