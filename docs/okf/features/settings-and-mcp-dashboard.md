---
type: Feature
title: Settings & MCP Dashboard
description: An in-app settings surface whose centerpiece is a first-class MCP dashboard — status, connections, live activity, and per-bundle scoping.
resource: https://github.com/ryansann/okfview/blob/main/src/renderer/src/components/McpDashboard.tsx
tags: [settings, mcp, dashboard, scoping]
timestamp: 2026-06-18T00:00:00Z
---

# Settings & MCP Dashboard

A Settings overlay (gear in the top bar) with **General**, **Agents (MCP)**, and **About**
sections.

# MCP dashboard

The Agents section is a live control surface for the [MCP server](/architecture/mcp-server.md):

- **Status** — running / stopped, uptime, the connect URL, and stat tiles (shared bundles,
  connections, total requests).
- **Connections** — each connected agent's client name + version, request count, and last
  activity, updated live.
- **Activity** — a realtime log of tool calls (tool, time, duration, ok/error).
- **Scope** — per-bundle checkboxes controlling which bundles agents can see; only **shared**
  bundles are exposed.

# Notes

Enabled state, port, and scope persist in the JSON settings store. A green **MCP** chip
appears in the top bar while the server runs. Validation findings shown to agents use the
same okftool metadata rendered by [Diagnostics](/features/diagnostics.md).
