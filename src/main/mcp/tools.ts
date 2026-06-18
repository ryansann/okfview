// MCP tool definitions (plain JSON Schema — no zod coupling). The handlers live
// in server.ts; these describe the tools agents can discover and call.

export const TOOLS = [
  {
    name: 'list_bundles',
    description:
      'List the OKF bundles currently shared with agents in okfview. Returns bundle ids, labels, source (local/git/http), concept counts, types, and conformance. Use a returned bundleId with the other tools.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'list_concepts',
    description:
      'List every concept in a bundle (its table of contents): conceptId, title, type, description, tags. A concept is one OKF markdown document.',
    inputSchema: {
      type: 'object',
      properties: { bundleId: { type: 'string', description: 'Bundle id from list_bundles' } },
      required: ['bundleId'],
      additionalProperties: false
    }
  },
  {
    name: 'read_concept',
    description:
      'Read a single concept: its frontmatter, full markdown body, the concepts it links to, external links, and its backlinks (concepts that reference it).',
    inputSchema: {
      type: 'object',
      properties: {
        bundleId: { type: 'string', description: 'Bundle id from list_bundles' },
        conceptId: { type: 'string', description: 'Concept id (file path minus .md) from list_concepts' }
      },
      required: ['bundleId', 'conceptId'],
      additionalProperties: false
    }
  },
  {
    name: 'search_concepts',
    description:
      'Full-text search across shared bundles (titles, types, tags, and body text). Omit bundleId to search all shared bundles, or pass one to scope the search. Returns ranked hits with snippets.',
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
    name: 'get_bundle_diagnostics',
    description:
      'Get OKF v0.1 conformance diagnostics for a bundle (missing frontmatter/type, broken links). Informational — bundles are never rejected.',
    inputSchema: {
      type: 'object',
      properties: { bundleId: { type: 'string' } },
      required: ['bundleId'],
      additionalProperties: false
    }
  },
  {
    name: 'get_okf_spec',
    description:
      'Return the Open Knowledge Format v0.1 specification reference (frontmatter fields, reserved files, link conventions, conformance rules). Call this before authoring or fixing an OKF bundle so you produce spec-correct output.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'validate_bundle',
    description:
      'Check a shared bundle against OKF v0.1 and return every conformance issue (missing frontmatter/type, unparseable YAML, broken links) WITH a suggested fix for each. Use this to debug a bundle you are authoring.',
    inputSchema: {
      type: 'object',
      properties: { bundleId: { type: 'string' } },
      required: ['bundleId'],
      additionalProperties: false
    }
  },
  {
    name: 'validate_document',
    description:
      'Validate a single OKF Markdown document (raw text, frontmatter + body) WITHOUT it being in a bundle. Returns the parsed type, frontmatter, extracted links, whether it is conformant, and issues with fixes. Use this to iterate on a concept you are drafting before writing the file.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Full Markdown document including --- frontmatter ---' },
        path: { type: 'string', description: 'Optional intended bundle-relative path, for messages' }
      },
      required: ['content'],
      additionalProperties: false
    }
  }
] as const
