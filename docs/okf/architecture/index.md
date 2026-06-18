# Architecture

* [Overview](overview.md) - The shape of okfview: a shared OKF core, an Electron main process, a sandboxed renderer, and an MCP server.
* [OKF core](okf-core.md) - The framework-agnostic parser, link resolver, and graph builder.
* [Main process](main-process.md) - Window, workspace, settings, file watching, and all I/O.
* [Renderer](renderer.md) - The sandboxed React UI.
* [Context bridge](context-bridge.md) - The secure IPC boundary between main and renderer.
* [Source adapters](source-adapters.md) - Local, git, and HTTP bundle sources behind one interface.
* [MCP server](mcp-server.md) - Exposing scoped bundles to coding agents.
