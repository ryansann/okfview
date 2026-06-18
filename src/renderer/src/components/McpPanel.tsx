import { useStore } from '../store'

/** Compact sidebar footer chip — shows MCP status and opens the full dashboard. */
export function McpPanel(): JSX.Element {
  const mcp = useStore((s) => s.mcp)
  const openSettings = useStore((s) => s.openSettings)

  const enabled = mcp?.enabled ?? false
  const running = mcp?.running ?? false
  const dot = running ? 'on' : enabled ? 'error' : 'off'
  const status = running
    ? `:${mcp?.port} · ${mcp?.sharedCount} shared · ${mcp?.connections.length ?? 0} conn`
    : enabled
      ? 'error'
      : 'off'

  return (
    <button className="mcp-chip" onClick={() => openSettings('mcp')} title="Open MCP settings">
      <span className={`mcp-dot ${dot}`} />
      <span className="mcp-chip-title">Agents (MCP)</span>
      <span className="mcp-chip-status">{status}</span>
      <span className="mcp-chip-gear">⚙</span>
    </button>
  )
}
