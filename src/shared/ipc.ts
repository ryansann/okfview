// Shared IPC contract between main, preload, and renderer.
import type { Bundle, BundleHandle, SourceKind } from './okf/types'

/** A bundle that has been imported before — for one-click reopen. */
export interface KnownBundle {
  kind: SourceKind
  origin: string
  label: string
  lastOpened: number // epoch ms
}

export const IPC = {
  listBundles: 'workspace:list',
  openLocalDialog: 'bundle:open-local-dialog',
  openLocalPath: 'bundle:open-local-path',
  openGit: 'bundle:open-git',
  openHttp: 'bundle:open-http',
  getBundle: 'bundle:get',
  refreshBundle: 'bundle:refresh',
  closeBundle: 'bundle:close',
  setShared: 'bundle:set-shared',
  listRecents: 'bundle:list-recents',
  openRecent: 'bundle:open-recent',
  forgetRecent: 'bundle:forget-recent',
  openExternal: 'shell:open-external',
  // MCP control
  mcpStatus: 'mcp:status',
  mcpSetEnabled: 'mcp:set-enabled',
  mcpSetPort: 'mcp:set-port',
  // main → renderer events
  bundleChanged: 'event:bundle-changed',
  bundleError: 'event:bundle-error',
  mcpChanged: 'event:mcp-changed'
} as const

export interface McpConnection {
  id: string
  client?: string
  clientVersion?: string
  connectedAt: number // epoch ms
  lastActivity: number // epoch ms
  requestCount: number
}

export interface McpActivityEntry {
  id: number
  ts: number // epoch ms
  sessionId?: string
  tool: string
  ok: boolean
  ms: number
  summary?: string
  error?: string
}

export interface McpStatus {
  enabled: boolean
  running: boolean
  url: string | null
  port: number
  sharedCount: number
  error?: string
  startedAt?: number // epoch ms
  totalRequests: number
  connections: McpConnection[]
  recentActivity: McpActivityEntry[]
}

export interface BundleChangedEvent {
  id: string
  bundle: Bundle
}

export interface BundleErrorEvent {
  origin: string
  message: string
}

/** The API surfaced on `window.okf` by the preload bridge. */
export interface OkfApi {
  listBundles(): Promise<BundleHandle[]>
  openLocalDialog(): Promise<Bundle | null>
  openLocalPath(path: string): Promise<Bundle | null>
  openGit(url: string): Promise<Bundle | null>
  openHttp(url: string): Promise<Bundle | null>
  getBundle(id: string): Promise<Bundle | null>
  refreshBundle(id: string): Promise<Bundle | null>
  closeBundle(id: string): Promise<void>
  setShared(id: string, shared: boolean): Promise<Bundle | null>
  listRecents(): Promise<KnownBundle[]>
  openRecent(kind: SourceKind, origin: string): Promise<Bundle | null>
  forgetRecent(kind: SourceKind, origin: string): Promise<KnownBundle[]>
  openExternal(url: string): Promise<void>
  // MCP
  mcpStatus(): Promise<McpStatus>
  mcpSetEnabled(enabled: boolean): Promise<McpStatus>
  mcpSetPort(port: number): Promise<McpStatus>
  onMcpChanged(cb: (s: McpStatus) => void): () => void
  // events
  onBundleChanged(cb: (e: BundleChangedEvent) => void): () => void
  onBundleError(cb: (e: BundleErrorEvent) => void): () => void
}
