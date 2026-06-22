import { describe, expect, it } from 'vitest'
import { buildBundle } from '@shared/okf/graph'
import { buildTree, renderTreeText } from '@shared/okf/tree'

describe('OKF tree utilities', () => {
  it('builds and renders a stable bundle tree', () => {
    const bundle = buildBundle({
      label: 'demo',
      source: { kind: 'local', origin: 'demo' },
      files: [
        { path: 'architecture/overview.md', content: '---\ntype: Note\ntitle: Overview\n---\n' },
        { path: 'architecture/runtime.md', content: '---\ntype: Note\ntitle: Runtime\n---\n' },
        { path: 'reference/api.md', content: '---\ntype: Reference\ntitle: API\n---\n' }
      ]
    })
    const tree = buildTree(bundle)
    expect(tree.children.map((c) => c.name)).toEqual(['architecture', 'reference'])
    expect(renderTreeText(tree)).toContain('|-- architecture/')
    expect(renderTreeText(tree)).toContain('`-- api.md  [Reference] API')
  })
})
