import { describe, it, expect } from 'vitest'
import { promises as fs } from 'fs'
import { join, relative, sep } from 'path'
import { buildBundle } from '@shared/okf/graph'
import { backlinksOf, outgoingTargets, conformanceSummary } from '@shared/okf/relations'
import type { RawFile } from '@shared/okf/types'

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

const loadFixture = async (name: string) =>
  buildBundle({
    label: name,
    source: { kind: 'local', origin: name },
    files: await readDir(join(__dirname, '..', 'fixtures', name))
  })

describe('relations on real OKF fixtures', () => {
  it('ga4 has at least one concept with backlinks and one with outgoing links', async () => {
    const b = await loadFixture('ga4')
    const withBacklinks = b.concepts.filter((c) => backlinksOf(b, c.id).length > 0)
    const withOutgoing = b.concepts.filter((c) => outgoingTargets(c, b).length > 0)
    expect(withBacklinks.length).toBeGreaterThan(0)
    expect(withOutgoing.length).toBeGreaterThan(0)
  })

  it('backlinks and outgoing are inverse: A links to B ⟺ B is backlinked by A', async () => {
    const b = await loadFixture('ga4')
    for (const a of b.concepts) {
      for (const target of outgoingTargets(a, b)) {
        expect(backlinksOf(b, target.id).some((c) => c.id === a.id)).toBe(true)
      }
    }
  })

  it('outgoing targets are de-duplicated', async () => {
    const b = await loadFixture('stackoverflow')
    for (const c of b.concepts) {
      const ids = outgoingTargets(c, b).map((t) => t.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})

describe('conformance summary', () => {
  it('official fixtures are conformant', async () => {
    for (const name of ['ga4', 'stackoverflow', 'crypto_bitcoin']) {
      const s = conformanceSummary(await loadFixture(name))
      expect(s.conformant).toBe(true)
      expect(s.missingType).toBe(0)
      expect(s.missingFrontmatter).toBe(0)
    }
  })

  it('flags a frontmatter-less bundle as non-conformant', () => {
    const b = buildBundle({
      label: 'local-profile',
      source: { kind: 'local', origin: 'x' },
      files: [
        { path: 'README.md', content: '# Just markdown, no frontmatter\nSee [a](a.md)\n' },
        { path: 'a.md', content: '# A\n' }
      ]
    })
    const s = conformanceSummary(b)
    expect(s.conformant).toBe(false)
    expect(s.missingFrontmatter).toBe(2)
  })
})
