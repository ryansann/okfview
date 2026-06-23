import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { clockTime, relTime, uptime } from '../lib/format'
import type { McpManifest } from '@shared/ipc'

export function McpDashboard(): JSX.Element {
  const mcp = useStore((s) => s.mcp)
  const setMcp = useStore((s) => s.setMcp)
  const pushToast = useStore((s) => s.pushToast)
  const [port, setPort] = useState('')
  const [copied, setCopied] = useState(false)
  const [manifest, setManifest] = useState<McpManifest | null>(null)

  useEffect(() => {
    void window.okf.mcpTools().then(setManifest)
  }, [])

  const enabled = mcp?.enabled ?? false
  const running = mcp?.running ?? false
  const url = mcp?.url ?? ''

  const toggle = async (): Promise<void> => {
    const next = await window.okf.mcpSetEnabled(!enabled)
    setMcp(next)
    if (next.enabled && !next.running && next.error) pushToast('error', `MCP: ${next.error}`)
  }
  const applyPort = async (): Promise<void> => {
    const n = Number(port)
    if (!Number.isInteger(n) || n < 1 || n > 65535) return
    setMcp(await window.okf.mcpSetPort(n))
    setPort('')
  }
  const copy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const connectCmd = url ? `claude mcp add --transport http okfview ${url}` : ''

  return (
    <div className="settings-section mcp-dash">
      <div className="dash-head">
        <h2>Agents (MCP)</h2>
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={toggle} />
          <span className="switch-track" />
          <span className="switch-label">{enabled ? 'On' : 'Off'}</span>
        </label>
      </div>
      <p className="settings-lead">
        Expose your <strong>shared</strong> bundles to coding agents over MCP. Reads reflect the
        live, file-watched workspace — agents see edits in realtime.
      </p>

      {/* status card */}
      <div className={`status-card ${running ? 'running' : enabled ? 'error' : 'stopped'}`}>
        <div className="status-line">
          <span className={`status-dot ${running ? 'on' : enabled ? 'error' : 'off'}`} />
          <span className="status-text">
            {running ? 'Running' : enabled ? 'Failed to start' : 'Stopped'}
          </span>
          {running && <span className="status-uptime">up {uptime(mcp?.startedAt)}</span>}
        </div>
        {running && (
          <div className="status-url">
            <code title={url}>{url}</code>
            <button className="btn sm" onClick={() => copy(url)}>
              {copied ? '✓' : 'Copy'}
            </button>
          </div>
        )}
        {enabled && !running && mcp?.error && <div className="status-err">⚠ {mcp.error}</div>}
        <div className="stat-grid">
          <Stat label="Shared bundles" value={mcp?.sharedCount ?? 0} />
          <Stat label="Connections" value={mcp?.connections.length ?? 0} />
          <Stat label="Requests" value={mcp?.totalRequests ?? 0} />
        </div>
      </div>

      {/* connect snippet */}
      {running && (
        <div className="setting-block">
          <div className="setting-label">Connect a coding agent</div>
          <div className="cmd-row">
            <code className="cmd">{connectCmd}</code>
            <button className="btn sm" onClick={() => copy(connectCmd)}>
              Copy
            </button>
          </div>
          <div className="setting-desc">
            Or point any MCP client (Streamable HTTP) at <code>{url}</code>.
          </div>
        </div>
      )}

      {/* port */}
      <div className="setting-block">
        <div className="setting-label">Port</div>
        <div className="cmd-row">
          <input
            className="remote-input"
            placeholder={String(mcp?.port || 7331)}
            value={port}
            onChange={(e) => setPort(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyPort()}
          />
          <button className="btn sm" onClick={applyPort} disabled={!port.trim()}>
            Apply
          </button>
        </div>
      </div>

      {/* scoping */}
      <SharedBundles />

      {/* connections */}
      <div className="setting-block">
        <div className="setting-label">Active connections</div>
        {(mcp?.connections.length ?? 0) === 0 ? (
          <p className="dash-empty">No agents connected.</p>
        ) : (
          <div className="conn-table">
            {mcp?.connections.map((c) => (
              <div className="conn-row" key={c.id}>
                <span className="conn-client">
                  {c.client ? `${c.client}${c.clientVersion ? ` ${c.clientVersion}` : ''}` : 'connecting…'}
                </span>
                <span className="conn-meta">{c.requestCount} reqs</span>
                <span className="conn-meta">active {relTime(c.lastActivity)}</span>
                <span className="conn-id" title={c.id}>
                  {c.id.slice(0, 8)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* activity */}
      <div className="setting-block">
        <div className="setting-label">Recent activity</div>
        {(mcp?.recentActivity.length ?? 0) === 0 ? (
          <p className="dash-empty">No tool calls yet.</p>
        ) : (
          <div className="activity-log">
            {mcp?.recentActivity.map((a) => (
              <div className={`activity-row ${a.ok ? '' : 'err'}`} key={a.id}>
                <span className="act-time">{clockTime(a.ts)}</span>
                <span className={`act-dot ${a.ok ? 'ok' : 'err'}`} />
                <span className="act-tool">{a.tool}</span>
                {a.summary && <span className="act-summary">{a.summary}</span>}
                <span className="act-ms">{a.ms}ms</span>
                {a.error && <span className="act-error">{a.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* tools + resources reference (resolved from the live server) */}
      <div className="setting-block">
        <div className="setting-label">Tools exposed to agents</div>
        <div className="tool-chips">
          {manifest?.tools.map((t) => (
            <code key={t.name} className="tool-chip" title={t.description}>
              {t.name}
            </code>
          ))}
        </div>
        {manifest && manifest.resources.length > 0 && (
          <>
            <div className="setting-label" style={{ marginTop: 14 }}>
              Resources
            </div>
            <div className="tool-chips">
              {manifest.resources.map((r) => (
                <code key={r.uri} className="tool-chip" title={r.name}>
                  {r.uri}
                </code>
              ))}
            </div>
          </>
        )}
        <div className="setting-desc">
          <code>validate</code> checks a bundle or a draft document, and the resources let agents read
          the OKF spec and the lint-rule catalog.
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function SharedBundles(): JSX.Element {
  const order = useStore((s) => s.order)
  const bundles = useStore((s) => s.bundles)
  const applyChange = useStore((s) => s.applyChange)

  const toggle = async (id: string, shared: boolean): Promise<void> => {
    const updated = await window.okf.setShared(id, shared)
    if (updated) applyChange(updated)
  }

  return (
    <div className="setting-block">
      <div className="setting-label">Scope — which bundles agents can see</div>
      {order.length === 0 ? (
        <p className="dash-empty">No bundles open.</p>
      ) : (
        <div className="scope-list">
          {order.map((id) => {
            const b = bundles[id]
            return (
              <label className="scope-row" key={id}>
                <input
                  type="checkbox"
                  checked={!!b.shared}
                  onChange={(e) => toggle(id, e.target.checked)}
                />
                <span className={`source-badge ${b.source.kind}`}>{b.source.kind}</span>
                <span className="scope-name">{b.label}</span>
                <span className="scope-count">{b.concepts.length} concepts</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
