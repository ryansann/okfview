---
type: Decision
title: JSON, not SQLite
description: Persistence is a single JSON file in the app data dir, because okfview only stores a bundle list, recents, and settings.
resource: https://github.com/ryansann/okfview/blob/main/src/main/settings.ts
tags: [decision, persistence, storage]
timestamp: 2026-06-18T00:00:00Z
---

# JSON, not SQLite

**Decision:** persist state in one JSON file (`okfview-settings.json` in the app userData
dir), not a database.

# Rationale

- The data is small and flat: MCP enabled/port, the open-bundle set (auto-restored), and the
  recents list.
- JSON needs no native module, no migrations, no rebuild against Electron's ABI — and a user
  can read or delete it.
- SQLite would only earn its keep if okfview cached *parsed concept content* for very large
  bundles to speed startup; that is not needed today. That native-module avoidance supports
  the packaging trade-off in [Electron Stack](/decisions/electron-stack.md).

# Notes

The store is owned by `settings.ts` and written by the workspace on every open/close/scope
change. Bundle content itself is never cached; the app re-reads sources when
[live sync](/features/live-sync.md) needs fresh file state for users and agents.
