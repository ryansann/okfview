// MCP tool definitions (plain JSON Schema — no zod coupling). The handlers live
// in server.ts. Reference data (the OKF spec, the lint-rule catalog) is exposed
// as MCP *resources* (okf://spec, okf://rules), not tools.

export const TOOLS = [
  {
    name: 'list_bundles',
    description:
      'Discover the OKF bundles currently shared with agents in okfview. Returns each bundle’s id, label, source (local/git/http), concept count, type vocabulary, and whether it is spec-conformant. Start here, then use a returned bundleId with the other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'describe_bundle',
    description:
      'Situational awareness for one bundle: an overview (concept count, type vocabulary, conformance, and a diagnostic summary by severity, spec/lint split, category, and code) plus the lint policy in force. Pass `include` to add sections: "tree" (directory outline), "concepts" (the table of contents), "vocabulary" (types & tags with counts — use this to author consistent concepts), and "graph" (orphans, top hubs, connected components). Does NOT return full diagnostics — use `validate` for those.',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: { type: 'string', description: 'Bundle id from list_bundles' },
        include: {
          type: 'array',
          items: { type: 'string', enum: ['tree', 'concepts', 'vocabulary', 'graph'] },
          description: 'Optional extra sections to include.'
        }
      },
      required: ['bundleId'],
      additionalProperties: false
    }
  },
  {
    name: 'search_concepts',
    description:
      'Full-text search across shared bundles (titles, types, tags, and body text). Omit bundleId to search all shared bundles, or pass one to scope it. Returns ranked hits with snippets; follow up with read_concept.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
        bundleId: { type: 'string', description: 'Optional: restrict to one bundle' }
      },
      required: ['query'],
      additionalProperties: false
    }
  },
  {
    name: 'read_concept',
    description:
      'Read one concept in full: its frontmatter, markdown body, the concepts it links to, external links, and its backlinks (concepts that reference it). The primitive for consuming and traversing a bundle.',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: { type: 'string', description: 'Bundle id from list_bundles' },
        conceptId: { type: 'string', description: 'Concept id (file path minus .md) from describe_bundle/search_concepts' }
      },
      required: ['bundleId', 'conceptId'],
      additionalProperties: false
    }
  },
  {
    name: 'validate',
    description:
      'Validate and lint with okftool. Pass a `bundleId` to check a shared bundle, OR raw `content` to check a single draft document before you write it. Returns `conformant` (OKF §9), the strictness it `ranUnder`, and every diagnostic with severity, spec-vs-lint, rule/category metadata, help/rationale, and suggested `fix` when available. Spec conformance is always enforced; lint findings are advisory and configurable. Use `strictness` to override the app policy for this call: "app" (default), "minimal", "recommended", or "strict". See the okf://rules resource for what each rule means.',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: { type: 'string', description: 'Check a shared bundle (mutually exclusive with content).' },
        content: { type: 'string', description: 'Check a raw draft document including --- frontmatter --- (mutually exclusive with bundleId).' },
        path: { type: 'string', description: 'Optional intended bundle-relative path for the draft, used in messages.' },
        strictness: {
          type: 'string',
          enum: ['app', 'minimal', 'recommended', 'strict'],
          description: 'Override the lint strictness for this call. Defaults to the app policy.'
        }
      },
      additionalProperties: false
    }
  }
] as const

/** Read-only reference data exposed as MCP resources (single source of truth). */
export const RESOURCES = [
  {
    uri: 'okf://spec',
    name: 'OKF v0.1 specification',
    mimeType: 'text/markdown',
    description:
      'The Open Knowledge Format reference — frontmatter fields, reserved files, link conventions, conformance rules. Read before authoring or fixing a bundle.'
  },
  {
    uri: 'okf://rules',
    name: 'okftool lint rules',
    mimeType: 'application/json',
    description:
      'The okftool lint-rule catalog: id, category, rationale, default severity, fixability. Look up a diagnostic code here to understand why it fires.'
  }
] as const
