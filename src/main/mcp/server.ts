import http from 'http'
import { randomUUID } from 'crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  isInitializeRequest
} from '@modelcontextprotocol/sdk/types.js'
import type { LintProfile, McpActivityEntry, McpConnection, McpStatus } from '@shared/ipc'
import type { Bundle, Concept, Diagnostic } from '@shared/okf/types'
import { backlinksOf, conformanceSummary, outgoingTargets } from '@shared/okf/relations'
import { buildTree, renderTreeText } from '@shared/okf/tree'
import { OKF_SPEC_SUMMARY } from '@shared/okf/spec'
import { loadSettings } from '../settings'
import { checkWithOkftool, lintDraftWithOkftool, okftoolRuleCatalog, profileToYaml } from '../okftool'
import type { Workspace } from '../workspace'
import { TOOLS, RESOURCES } from './tools'

const MAX_ACTIVITY = 200

/**
 * MCP server exposing the user's *scoped* OKF bundles to coding agents over
 * Streamable HTTP (localhost). Reads reflect the live workspace (realtime), and
 * it tracks connections + tool activity for the in-app dashboard.
 */
export class OkfMcpServer {
  private httpServer: http.Server | null = null
  private transports = new Map<string, StreamableHTTPServerTransport>()
  private connections = new Map<string, McpConnection>()
  private activity: McpActivityEntry[] = []
  private activitySeq = 1
  private totalRequests = 0
  private startedAt?: number
  private port = 0
  private lastError?: string
  private onChange: () => void = () => {}

  constructor(
    private readonly workspace: Workspace,
    private readonly version: string
  ) {}

  setOnChange(cb: () => void): void {
    this.onChange = cb
  }

  status(enabled: boolean): McpStatus {
    return {
      enabled,
      running: !!this.httpServer,
      url: this.httpServer ? `http://127.0.0.1:${this.port}/mcp` : null,
      port: this.port || 0,
      sharedCount: this.workspace.listShared().length,
      error: this.lastError,
      startedAt: this.startedAt,
      totalRequests: this.totalRequests,
      connections: [...this.connections.values()].sort((a, b) => b.connectedAt - a.connectedAt),
      recentActivity: this.activity.slice(-40).reverse()
    }
  }

  async start(port: number): Promise<void> {
    await this.stop()
    this.lastError = undefined
    const server = http.createServer((req, res) => {
      this.handle(req, res).catch((e) => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: (e as Error).message }))
      })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', (e) => {
        this.lastError = (e as Error).message
        reject(e)
      })
      server.listen(port, '127.0.0.1', () => {
        this.port = (server.address() as { port: number }).port
        this.httpServer = server
        this.startedAt = Date.now()
        resolve()
      })
    })
  }

  async stop(): Promise<void> {
    for (const t of this.transports.values()) await t.close().catch(() => {})
    this.transports.clear()
    this.connections.clear()
    this.startedAt = undefined
    const s = this.httpServer
    this.httpServer = null
    if (s) await new Promise<void>((resolve) => s.close(() => resolve()))
  }

  private setCors(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id, Last-Event-ID')
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id')
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.setCors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = req.url ?? '/'
    if (!url.startsWith('/mcp')) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ name: 'okfview', mcp: '/mcp' }))
      return
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (req.method === 'POST') {
      const body = await readJson(req)
      let transport = sessionId ? this.transports.get(sessionId) : undefined
      if (!transport && isInitializeRequest(body)) {
        const conn: McpConnection = {
          id: '',
          connectedAt: Date.now(),
          lastActivity: Date.now(),
          requestCount: 0
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid): void => {
            conn.id = sid
            this.transports.set(sid, transport as StreamableHTTPServerTransport)
            this.connections.set(sid, conn)
            this.onChange()
          }
        })
        transport.onclose = (): void => {
          if (conn.id) {
            this.transports.delete(conn.id)
            this.connections.delete(conn.id)
            this.onChange()
          }
        }
        const mcp = this.buildServer(conn)
        mcp.oninitialized = (): void => {
          const ci = mcp.getClientVersion()
          if (ci) {
            conn.client = ci.name
            conn.clientVersion = ci.version
            this.onChange()
          }
        }
        await mcp.connect(transport)
      }
      if (!transport) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'No valid session' }, id: null })
        )
        return
      }
      await transport.handleRequest(req, res, body)
      return
    }

    const transport = sessionId ? this.transports.get(sessionId) : undefined
    if (!transport) {
      res.writeHead(400)
      res.end('Missing or unknown session')
      return
    }
    await transport.handleRequest(req, res)
  }

  private buildServer(conn: McpConnection): Server {
    const server = new Server(
      { name: 'okfview', version: this.version },
      { capabilities: { tools: {}, resources: {} } }
    )
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
    server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }))
    server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
      const uri = req.params.uri
      if (uri === 'okf://spec') {
        return { contents: [{ uri, mimeType: 'text/markdown', text: OKF_SPEC_SUMMARY }] }
      }
      if (uri === 'okf://rules') {
        return {
          contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(okftoolRuleCatalog(), null, 2) }]
        }
      }
      throw new Error(`Unknown resource: ${uri}`)
    })
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const name = req.params.name
      const args = (req.params.arguments ?? {}) as Record<string, unknown>
      const start = Date.now()
      try {
        const result = this.callTool(name, args)
        this.record(conn, name, true, Date.now() - start, summarizeArgs(name, args))
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
      } catch (e) {
        const msg = (e as Error).message
        this.record(conn, name, false, Date.now() - start, summarizeArgs(name, args), msg)
        return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true }
      }
    })
    return server
  }

  private record(
    conn: McpConnection,
    tool: string,
    ok: boolean,
    ms: number,
    summary?: string,
    error?: string
  ): void {
    this.totalRequests++
    conn.requestCount++
    conn.lastActivity = Date.now()
    this.activity.push({ id: this.activitySeq++, ts: Date.now(), sessionId: conn.id, tool, ok, ms, summary, error })
    if (this.activity.length > MAX_ACTIVITY) this.activity.splice(0, this.activity.length - MAX_ACTIVITY)
    this.onChange()
  }

  private callTool(name: string, args: Record<string, unknown>): unknown {
    switch (name) {
      case 'list_bundles':
        return this.workspace.listShared().map(bundleSummary)

      case 'describe_bundle':
        return this.describeBundle(args)

      case 'search_concepts': {
        const query = String(args.query ?? '').toLowerCase().trim()
        if (!query) return []
        const scope = args.bundleId
          ? [this.requireBundle(String(args.bundleId))]
          : this.workspace.listShared()
        return searchBundles(scope, query)
      }

      case 'read_concept': {
        const b = this.requireBundle(String(args.bundleId))
        const c = b.concepts.find((x) => x.id === String(args.conceptId))
        if (!c) throw new Error(`No concept "${args.conceptId}" in bundle`)
        return {
          conceptId: c.id,
          type: c.type,
          title: c.title,
          description: c.description,
          resource: c.resource,
          tags: c.tags,
          timestamp: c.timestamp,
          frontmatter: c.frontmatter,
          body: c.body,
          linksTo: outgoingTargets(c, b).map((t) => t.id),
          externalLinks: c.outgoing.filter((l) => l.external).map((l) => l.external),
          backlinks: backlinksOf(b, c.id).map((x) => x.id)
        }
      }

      case 'validate':
        return this.validate(args)

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  private describeBundle(args: Record<string, unknown>): unknown {
    const b = this.requireBundle(String(args.bundleId))
    const include = Array.isArray(args.include) ? args.include.map(String) : []
    const out: Record<string, unknown> = {
      bundleId: b.id,
      label: b.label,
      source: { kind: b.source.kind, origin: b.source.origin },
      okfVersion: b.okfVersion,
      conceptCount: b.concepts.length,
      conformant: conformanceSummary(b).conformant,
      diagnostics: diagnosticSummary(b.diagnostics),
      lint: this.workspace.lintInfoFor(b.id) ?? undefined
    }
    if (include.includes('tree')) out.tree = renderTreeText(buildTree(b))
    if (include.includes('concepts')) out.concepts = b.concepts.map(tocEntry)
    if (include.includes('vocabulary')) out.vocabulary = vocabulary(b)
    if (include.includes('graph')) out.graph = graphSummary(b)
    return out
  }

  private validate(args: Record<string, unknown>): unknown {
    const strictness = args.strictness ? String(args.strictness) : 'app'

    // Draft mode: a raw document not in any bundle.
    if (args.content !== undefined) {
      const content = String(args.content)
      if (!content.trim()) throw new Error('`content` is required')
      const cfg = configForStrictness(strictness)
      const result = lintDraftWithOkftool(content, args.path ? String(args.path) : 'draft.md', cfg.yaml)
      return { ranUnder: cfg.label, ...result }
    }

    // Bundle mode.
    if (args.bundleId !== undefined) {
      const b = this.requireBundle(String(args.bundleId))
      if (strictness === 'app') {
        // Cached diagnostics under the app policy (honours per-bundle .okftool.yaml).
        const info = this.workspace.lintInfoFor(b.id)
        return {
          bundleId: b.id,
          ranUnder: info?.profile ?? 'app',
          conformant: conformanceSummary(b).conformant,
          diagnostics: b.diagnostics
        }
      }
      const files = this.workspace.sharedRawFiles(b.id)
      if (!files) throw new Error(`Bundle "${b.id}" is not shared`)
      const result = checkWithOkftool(files, profileToYaml(strictness as LintProfile))
      return { bundleId: b.id, ranUnder: strictness, conformant: result.conformant, diagnostics: result.diagnostics }
    }

    throw new Error('Pass either `bundleId` (check a shared bundle) or `content` (check a draft)')
  }

  private requireBundle(id: string): Bundle {
    const b = this.workspace.getShared(id)
    if (!b) throw new Error(`Bundle "${id}" is not shared with agents or does not exist`)
    return b
  }
}

/** Resolve a strictness arg to a `.okftool.yaml` config + a label for `ranUnder`. */
function configForStrictness(strictness: string): { yaml: string; label: string } {
  if (strictness === 'app') {
    const profile = loadSettings().lintProfile
    return { yaml: profileToYaml(profile), label: profile }
  }
  return { yaml: profileToYaml(strictness as LintProfile), label: strictness }
}

function tocEntry(c: Concept): unknown {
  return {
    conceptId: c.id,
    title: c.title ?? c.id.split('/').pop(),
    type: c.type,
    description: c.description,
    tags: c.tags
  }
}

function diagnosticSummary(diags: Diagnostic[]): unknown {
  const sev = { error: 0, warn: 0, info: 0 }
  const byCode: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  let spec = 0
  let lint = 0
  for (const d of diags) {
    if (d.severity in sev) sev[d.severity as keyof typeof sev]++
    byCode[d.code] = (byCode[d.code] ?? 0) + 1
    if (d.spec) {
      spec++
    } else {
      lint++
      const category = d.categoryName ?? d.category ?? 'Lint'
      byCategory[category] = (byCategory[category] ?? 0) + 1
    }
  }
  return { total: diags.length, ...sev, spec, lint, byCategory, byCode }
}

function vocabulary(b: Bundle): unknown {
  const types: Record<string, number> = {}
  const tags: Record<string, number> = {}
  for (const c of b.concepts) {
    if (c.type) types[c.type] = (types[c.type] ?? 0) + 1
    for (const t of c.tags) tags[t] = (tags[t] ?? 0) + 1
  }
  const sorted = (m: Record<string, number>): { name: string; count: number }[] =>
    Object.entries(m)
      .map(([name, count]) => ({ name, count }))
      .sort((a, z) => z.count - a.count)
  return { types: sorted(types), tags: sorted(tags) }
}

function graphSummary(b: Bundle): unknown {
  const out = new Map<string, number>()
  const inn = new Map<string, number>()
  const adj = new Map<string, Set<string>>()
  for (const c of b.concepts) {
    out.set(c.id, 0)
    inn.set(c.id, 0)
    adj.set(c.id, new Set())
  }
  for (const c of b.concepts) {
    const seen = new Set<string>()
    for (const l of c.outgoing) {
      const t = l.targetId
      if (t && t !== c.id && out.has(t) && !seen.has(t)) {
        seen.add(t)
        out.set(c.id, (out.get(c.id) ?? 0) + 1)
        inn.set(t, (inn.get(t) ?? 0) + 1)
        adj.get(c.id)?.add(t)
        adj.get(t)?.add(c.id)
      }
    }
  }
  const orphans = b.concepts
    .filter((c) => (out.get(c.id) ?? 0) === 0 && (inn.get(c.id) ?? 0) === 0)
    .map((c) => c.id)
  const topHubs = b.concepts
    .map((c) => ({ conceptId: c.id, outDegree: out.get(c.id) ?? 0 }))
    .filter((h) => h.outDegree > 0)
    .sort((a, z) => z.outDegree - a.outDegree)
    .slice(0, 5)
  const visited = new Set<string>()
  let components = 0
  for (const c of b.concepts) {
    if (visited.has(c.id)) continue
    components++
    const stack = [c.id]
    visited.add(c.id)
    while (stack.length) {
      const id = stack.pop() as string
      for (const n of adj.get(id) ?? []) {
        if (!visited.has(n)) {
          visited.add(n)
          stack.push(n)
        }
      }
    }
  }
  return { orphans: { count: orphans.length, conceptIds: orphans.slice(0, 25) }, topHubs, components }
}

function bundleSummary(b: Bundle): unknown {
  const s = conformanceSummary(b)
  return {
    bundleId: b.id,
    label: b.label,
    sourceKind: b.source.kind,
    origin: b.source.origin,
    conceptCount: b.concepts.length,
    types: b.types,
    okfVersion: b.okfVersion,
    conformant: s.conformant
  }
}

function summarizeArgs(tool: string, args: Record<string, unknown>): string {
  if (tool === 'search_concepts') return `"${String(args.query ?? '')}"`
  if (tool === 'validate' && args.content !== undefined) return `${String(args.content).length} chars`
  const parts = [args.bundleId, args.conceptId].filter(Boolean).map(String)
  if (args.strictness && args.strictness !== 'app') parts.push(`@${String(args.strictness)}`)
  if (Array.isArray(args.include) && args.include.length) parts.push(`+${args.include.join(',')}`)
  return parts.join(' / ')
}

interface Hit {
  bundleId: string
  conceptId: string
  title: string
  type: string
  score: number
  snippet: string
}

function searchBundles(bundles: Bundle[], q: string): Hit[] {
  const hits: Hit[] = []
  for (const b of bundles) {
    for (const c of b.concepts) {
      const title = (c.title ?? c.id).toLowerCase()
      const hay = `${title} ${c.id} ${c.type} ${c.tags.join(' ')}`.toLowerCase()
      let score = 0
      if (title.includes(q)) score += 10
      if (hay.includes(q)) score += 5
      const bodyIdx = c.body.toLowerCase().indexOf(q)
      if (bodyIdx >= 0) score += 2
      if (score === 0) continue
      hits.push({
        bundleId: b.id,
        conceptId: c.id,
        title: c.title ?? c.id,
        type: c.type,
        score,
        snippet: bodyIdx >= 0 ? snippet(c.body, bodyIdx) : (c.description ?? '')
      })
    }
  }
  return hits.sort((a, z) => z.score - a.score).slice(0, 25)
}

function snippet(body: string, idx: number): string {
  const clean = body.replace(/\s+/g, ' ')
  const start = Math.max(0, idx - 50)
  return (start > 0 ? '…' : '') + clean.slice(start, start + 160)
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      if (!data) return resolve(undefined)
      try {
        resolve(JSON.parse(data))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}
