// Shared IPC contract between main, preload, and renderer.
import type { Bundle, BundleHandle, SourceKind } from './okf/types'

/** A bundle that has been imported before — for one-click reopen. */
export interface KnownBundle {
  kind: SourceKind
  origin: string
  label: string // display name (alias if set, else derived)
  lastOpened: number // epoch ms
  alias?: string // user-chosen name, re-applied on reopen
}

export const IPC = {
  appInfo: 'app:info',
  listBundles: 'workspace:list',
  openLocalDialog: 'bundle:open-local-dialog',
  openLocalPath: 'bundle:open-local-path',
  openGit: 'bundle:open-git',
  openHttp: 'bundle:open-http',
  getBundle: 'bundle:get',
  refreshBundle: 'bundle:refresh',
  closeBundle: 'bundle:close',
  reorderBundles: 'bundle:reorder',
  setShared: 'bundle:set-shared',
  setAlias: 'bundle:set-alias',
  listRecents: 'bundle:list-recents',
  openRecent: 'bundle:open-recent',
  forgetRecent: 'bundle:forget-recent',
  openExternal: 'shell:open-external',
  // MCP control
  mcpStatus: 'mcp:status',
  mcpSetEnabled: 'mcp:set-enabled',
  mcpSetPort: 'mcp:set-port',
  // Lint policy
  lintConfig: 'lint:config',
  lintSetConfig: 'lint:set-config',
  mcpTools: 'mcp:tools',
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

/** Lint strictness presets, matching okftool's profiles. */
export type LintProfile = 'minimal' | 'recommended' | 'strict'

export interface LintConfig {
  /** Strictness preset applied as the app-wide lint policy. */
  profile: LintProfile
  /**
   * When true, the app policy applies to every bundle, ignoring any per-bundle
   * `.okftool.yaml`. When false, a bundle's own `.okftool.yaml` wins if present;
   * otherwise the app policy is the default.
   */
  overrideBundleConfig: boolean
}

/** The MCP surface (tools + resources) the server exposes, for the dashboard. */
export interface McpManifest {
  tools: { name: string; description: string }[]
  resources: { uri: string; name: string }[]
}

export interface BundleChangedEvent {
  id: string
  bundle: Bundle
}

export interface BundleErrorEvent {
  origin: string
  message: string
}

export interface AppInfo {
  version: string
  packaged: boolean
  sha?: string
  cwd?: string
}

/** The API surfaced on `window.okf` by the preload bridge. */
export interface OkfApi {
  appInfo(): Promise<AppInfo>
  listBundles(): Promise<BundleHandle[]>
  openLocalDialog(): Promise<Bundle | null>
  openLocalPath(path: string): Promise<Bundle | null>
  openGit(url: string): Promise<Bundle | null>
  openHttp(url: string): Promise<Bundle | null>
  getBundle(id: string): Promise<Bundle | null>
  refreshBundle(id: string): Promise<Bundle | null>
  closeBundle(id: string): Promise<void>
  reorderBundles(ids: string[]): Promise<void>
  setShared(id: string, shared: boolean): Promise<Bundle | null>
  setAlias(id: string, alias: string): Promise<Bundle | null>
  listRecents(): Promise<KnownBundle[]>
  openRecent(kind: SourceKind, origin: string): Promise<Bundle | null>
  forgetRecent(kind: SourceKind, origin: string): Promise<KnownBundle[]>
  openExternal(url: string): Promise<void>
  // MCP
  mcpStatus(): Promise<McpStatus>
  mcpSetEnabled(enabled: boolean): Promise<McpStatus>
  mcpSetPort(port: number): Promise<McpStatus>
  onMcpChanged(cb: (s: McpStatus) => void): () => void
  // Lint policy
  lintConfig(): Promise<LintConfig>
  lintSetConfig(config: LintConfig): Promise<LintConfig>
  mcpTools(): Promise<McpManifest>
  // events
  onBundleChanged(cb: (e: BundleChangedEvent) => void): () => void
  onBundleError(cb: (e: BundleErrorEvent) => void): () => void
}
