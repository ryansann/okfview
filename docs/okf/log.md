# okfview Bundle Update Log

## 2026-06-18
* **Creation**: Converted okfview's documentation into this native OKF bundle.
* **Update**: Added the recents / known-bundle library — see [recents](/features/recents.md).
* **Update**: Made the MCP server first-class — the [settings & MCP dashboard](/features/settings-and-mcp-dashboard.md), connection tracking, and OKF-debugging [MCP tools](/reference/mcp-tools.md).
* **Update**: Documented persistence — [JSON over SQLite](/decisions/json-not-sqlite.md).

## 2026-06-17
* **Initialization**: okfview project created; the [Electron stack](/decisions/electron-stack.md) was chosen and the [OKF v0.1 format](/reference/okf-format.md) captured.
* **Decision**: Scoped okfview to [spec-only](/decisions/spec-only-scope.md) after a test bundle turned out to use a non-standard "local profile".
