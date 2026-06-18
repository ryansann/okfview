import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import { join, relative, sep } from 'path'
import { buildBundle } from '@shared/okf/graph'
import { resolveTarget } from '@shared/okf/links'
import { parseConcept, parseIndex, parseLog } from '@shared/okf/parse'
import type { RawFile } from '@shared/okf/types'

const FIXTURES = join(__dirname, '..', 'fixtures')

async function readDir(root: string): Promise<RawFile[]> {
  const out: RawFile[] = []
  async function walk(dir: string): Promise<void> {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.name.endsWith('.md'))
        out.push({ path: relative(root, full).split(sep).join('/'), content: await fs.readFile(full, 'utf8') })
    }
  }
  await walk(root)
  return out
}

describe('OKF core on real fixtures', () => {
  it('parses the ga4 bundle into concepts with types', async () => {
    const files = await readDir(join(FIXTURES, 'ga4'))
    const bundle = buildBundle({
      label: 'ga4',
      source: { kind: 'local', origin: 'fixtures/ga4' },
      files
    })
    expect(bundle.concepts.length).toBeGreaterThan(5)
    expect(bundle.types).toContain('BigQuery Table')
    // every concept has a non-empty type id and path
    for (const c of bundle.concepts) {
      expect(c.id).not.toMatch(/\.md$/)
      expect(typeof c.type).toBe('string')
    }
  })

  it('resolves the cross-link graph (some links land on real concepts)', async () => {
    const files = await readDir(join(FIXTURES, 'ga4'))
    const bundle = buildBundle({ label: 'ga4', source: { kind: 'local', origin: 'x' }, files })
    const resolved = bundle.concepts.flatMap((c) => c.outgoing).filter((l) => l.targetId)
    expect(resolved.length).toBeGreaterThan(0)
  })

  it('all three fixtures build without throwing', async () => {
    for (const name of ['ga4', 'stackoverflow', 'crypto_bitcoin']) {
      const files = await readDir(join(FIXTURES, name))
      const bundle = buildBundle({ label: name, source: { kind: 'local', origin: name }, files })
      expect(bundle.concepts.length).toBeGreaterThan(0)
    }
  })
})

describe('parser units', () => {
  it('requires only `type`; preserves unknown keys', () => {
    const raw = `---\ntype: Metric\ncustom_key: hello\n---\n# Body\n`
    const { concept, diagnostics } = parseConcept('a/b.md', raw)
    expect(concept.type).toBe('Metric')
    expect(concept.frontmatter.custom_key).toBe('hello')
    expect(diagnostics.length).toBe(0)
  })

  it('flags missing type but still produces a concept', () => {
    const { concept, diagnostics } = parseConcept('x.md', `---\ntitle: No type\n---\nbody`)
    expect(concept.type).toBe('')
    expect(diagnostics.some((d) => d.code === 'missing-type')).toBe(true)
  })

  it('flags missing frontmatter', () => {
    const { diagnostics } = parseConcept('x.md', `# Just markdown\n`)
    expect(diagnostics.some((d) => d.code === 'missing-frontmatter')).toBe(true)
  })

  it('resolves absolute and relative links and ignores index/anchors', () => {
    expect(resolveTarget('tables/orders', '/tables/customers.md').targetPath).toBe('tables/customers')
    expect(resolveTarget('a/b/c', '../d.md').targetPath).toBe('a/d')
    expect(resolveTarget('a/b', 'https://x.com').external).toBe('https://x.com')
    expect(resolveTarget('a/b', '/datasets/index.md').directoryOrAnchor).toBe(true)
    expect(resolveTarget('a/b', '#section').directoryOrAnchor).toBe(true)
  })

  it('reads okf_version only from the root index', () => {
    const root = parseIndex('index.md', `---\nokf_version: "0.1"\n---\n# Sub\n`)
    expect(root.okfVersion).toBe('0.1')
    const nested = parseIndex('sub/index.md', `---\nokf_version: "0.1"\n---\n`)
    expect(nested.diagnostics.some((d) => d.code === 'index-frontmatter')).toBe(true)
  })

  it('parses log days and verbs', () => {
    const { log } = parseLog('log.md', `# Log\n\n## 2026-05-22\n* **Update**: did a thing.\n* plain entry\n`)
    expect(log.days[0].date).toBe('2026-05-22')
    expect(log.days[0].entries[0].verb).toBe('Update')
    expect(log.days[0].entries[1].text).toBe('plain entry')
  })
})
