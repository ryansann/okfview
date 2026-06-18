// Connect to a running okfview MCP server and exercise every tool.
//   node scripts/mcp-smoke.mjs http://127.0.0.1:7799/mcp
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const url = new URL(process.argv[2] || 'http://127.0.0.1:7799/mcp')
const client = new Client({ name: 'okf-smoke', version: '0.0.0' })
await client.connect(new StreamableHTTPClientTransport(url))

const parse = (r) => JSON.parse(r.content[0].text)

const tools = await client.listTools()
console.log('tools:', tools.tools.map((t) => t.name).join(', '))

const bundles = parse(await client.callTool({ name: 'list_bundles', arguments: {} }))
console.log('list_bundles:', bundles.length, bundles.map((b) => `${b.label}(${b.conceptCount})`).join(', '))

if (bundles.length) {
  const bid = bundles[0].bundleId
  const concepts = parse(await client.callTool({ name: 'list_concepts', arguments: { bundleId: bid } }))
  console.log('list_concepts:', concepts.length, '| first:', concepts[0]?.conceptId)

  const withLinks = concepts.find((c) => c) // first; read it
  if (withLinks) {
    const r = parse(
      await client.callTool({ name: 'read_concept', arguments: { bundleId: bid, conceptId: withLinks.conceptId } })
    )
    console.log(
      `read_concept ${withLinks.conceptId}: body=${r.body.length}b linksTo=${r.linksTo.length} backlinks=${r.backlinks.length} type=${JSON.stringify(r.type)}`
    )
  }

  const search = parse(await client.callTool({ name: 'search_concepts', arguments: { query: 'event' } }))
  console.log('search_concepts "event":', search.length, '| top:', search[0]?.conceptId)

  const diag = parse(await client.callTool({ name: 'get_bundle_diagnostics', arguments: { bundleId: bid } }))
  console.log('diagnostics: conformant=', diag.conformant, 'missingType=', diag.missingType)

  // ---- agent OKF-debugging tools ----
  const spec = parse(await client.callTool({ name: 'get_okf_spec', arguments: {} }))
  console.log('get_okf_spec: v' + spec.version, '|', spec.spec.length, 'chars')

  const vb = parse(await client.callTool({ name: 'validate_bundle', arguments: { bundleId: bid } }))
  console.log('validate_bundle: conformant=', vb.conformant, 'issues=', vb.issues.length)

  // a deliberately broken doc (no type) — agent debugging its own draft
  const bad = '---\ntitle: Draft with no type\n---\n# Body\nSee [x](/tables/x.md)\n'
  const vd = parse(await client.callTool({ name: 'validate_document', arguments: { content: bad } }))
  console.log(
    'validate_document(bad): conformant=', vd.conformant,
    '| issues=', vd.issues.map((i) => i.code).join(','),
    '| firstFix=', JSON.stringify(vd.issues[0]?.fix?.slice(0, 40))
  )
}

await client.close()
console.log('MCP SMOKE OK')
