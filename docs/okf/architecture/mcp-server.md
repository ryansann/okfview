---
type: Module
title: MCP Server
description: An embedded Model Context Protocol server that exposes scoped OKF bundles to coding agents over Streamable HTTP on localhost.
resource: https://github.com/ryansann/okfview/tree/main/src/main/mcp
tags: [mcp, agents, server, http]
timestamp: 2026-06-18T00:00:00Z
---

# MCP Server

`src/main/mcp/` runs an MCP server (official SDK, low-level `Server` + Streamable HTTP) on
`127.0.0.1`. It is off by default and serves only the bundles the user marks **shared** —
see [scoping](/features/settings-and-mcp-dashboard.md). Reads come straight from the live
workspace, so agents see edits in realtime.

# Schema

- Reads serve from the [OKF core](/architecture/okf-core.md): `relations.ts` for links and
  `lint.ts` for conformance.
- Per-session transports are tracked as connections (client name/version captured at
  initialize); every tool call is recorded into an activity ring buffer.
- The full tool set is documented in [MCP tools](/reference/mcp-tools.md).

# Notes

Because the SDK is ESM and the main bundle is CJS, the SDK and `zod` are bundled into the
main output rather than externalized. Status (connections, activity, uptime) is pushed to
the renderer and rendered by the [MCP dashboard](/features/settings-and-mcp-dashboard.md).
