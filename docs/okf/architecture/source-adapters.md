---
type: Module
title: Source Adapters
description: Local, git, and HTTP-tarball bundle sources behind one interface, so the rest of okfview treats every bundle identically.
resource: https://github.com/ryansann/okfview/tree/main/src/main/sources
tags: [sources, local, git, http, watching]
timestamp: 2026-06-18T00:00:00Z
---

# Source Adapters

Every bundle origin implements a common `Source` interface (`load`, `watch`, `refresh`,
`dispose`), so the workspace and UI never special-case where a bundle came from.

# Schema

| Adapter | Origin | Change detection |
|---|---|---|
| `LocalFolderSource` | a directory | `chokidar` file watching. |
| `GitSource` | a git URL (optional `#subpath`) | clone to cache; poll `git fetch` + HEAD diff |
| `HttpTarballSource` | a `.tar.gz` URL (optional `#subpath`) | conditional GET (`ETag` / `Last-Modified`) |

# Notes

Git and HTTP sources unpack into a cache dir under the app's userData and are then read
exactly like a local folder. All three round-trip through recents and the JSON settings
store by their `kind` + `origin`.
