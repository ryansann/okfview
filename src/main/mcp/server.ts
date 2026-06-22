import http from 'http'
import { randomUUID } from 'crypto'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializeRequest
} from '@modelcontextprotocol/sdk/types.js'
import type { McpActivityEntry, McpConnection, McpStatus } from '@shared/ipc'
import type { Bundle } from '@shared/okf/types'
import { backlinksOf, conformanceSummary, outgoingTargets } from '@shared/okf/relations'
import { buildTree, renderTreeText, type TreeNode } from '@shared/okf/tree'
import { lintBundle, lintDocument } from '@shared/okf/lint'
import { OKF_SPEC_SUMMARY, OKF_SPEC_URL, OKF_SPEC_VERSION } from '@shared/okf/spec'
import type { Workspace } from '../workspace'
import { TOOLS } from './tools'

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
      { capabilities: { tools: {} } }
    )
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
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

      case 'list_concepts': {
        const b = this.requireBundle(String(args.bundleId))
        return b.concepts.map((c) => ({
          conceptId: c.id,
          title: c.title ?? c.id.split('/').pop(),
          type: c.type,
          description: c.description,
          tags: c.tags
        }))
      }

      case 'get_bundle_tree': {
        const b = this.requireBundle(String(args.bundleId))
        const tree = buildTree(b)
        return String(args.format ?? 'text') === 'json'
          ? { bundleId: b.id, tree: outlineTree(tree) }
          : { bundleId: b.id, tree: renderTreeText(tree) }
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

      case 'search_concepts': {
        const query = String(args.query ?? '').toLowerCase().trim()
        if (!query) return []
        const scope = args.bundleId
          ? [this.requireBundle(String(args.bundleId))]
          : this.workspace.listShared()
        return searchBundles(scope, query)
      }

      case 'get_bundle_diagnostics': {
        const b = this.requireBundle(String(args.bundleId))
        return { ...conformanceSummary(b), diagnostics: b.diagnostics }
      }

      // ---- OKF authoring / debugging tools ----
      case 'get_okf_spec':
        return { version: OKF_SPEC_VERSION, url: OKF_SPEC_URL, spec: OKF_SPEC_SUMMARY }

      case 'validate_bundle': {
        const b = this.requireBundle(String(args.bundleId))
        const s = conformanceSummary(b)
        return {
          bundleId: b.id,
          conformant: s.conformant,
          summary: s,
          issues: lintBundle(b)
        }
      }

      case 'validate_document': {
        const content = String(args.content ?? '')
        if (!content.trim()) throw new Error('`content` is required')
        return lintDocument(content, args.path ? String(args.path) : undefined)
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  private requireBundle(id: string): Bundle {
    const b = this.workspace.getShared(id)
    if (!b) throw new Error(`Bundle "${id}" is not shared with agents or does not exist`)
    return b
  }
}

function outlineTree(node: TreeNode): unknown {
  return {
    name: node.name,
    path: node.path,
    isDir: node.isDir,
    type: node.concept?.type,
    title: node.concept?.title,
    children: node.children.map(outlineTree)
  }
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
  if (tool === 'validate_document') return `${String(args.content ?? '').length} chars`
  const parts = [args.bundleId, args.conceptId].filter(Boolean).map(String)
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
