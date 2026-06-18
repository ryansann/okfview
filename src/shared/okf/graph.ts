// Assemble a Bundle from raw files: parse documents, resolve the link graph,
// and collect conformance diagnostics (spec §9). Fully permissive — never throws
// on bad input, never rejects a bundle.
import { parseConcept, parseIndex, parseLog, reservedKind } from './parse'
import { resolveTarget } from './links'
import type { Bundle, Concept, Diagnostic, IndexFile, LogFile, RawBundle } from './types'

export function buildBundle(input: RawBundle): Bundle {
  const concepts: Concept[] = []
  const indexes: IndexFile[] = []
  const logs: LogFile[] = []
  const diagnostics: Diagnostic[] = []
  let okfVersion: string | undefined

  for (const f of input.files) {
    if (!f.path.toLowerCase().endsWith('.md')) continue
    const kind = reservedKind(f.path)
    if (kind === 'index') {
      const { index, okfVersion: v, diagnostics: d } = parseIndex(f.path, f.content)
      indexes.push(index)
      diagnostics.push(...d)
      if (v && index.dir === '') okfVersion = v
    } else if (kind === 'log') {
      const { log, diagnostics: d } = parseLog(f.path, f.content)
      logs.push(log)
      diagnostics.push(...d)
    } else {
      const { concept, diagnostics: d } = parseConcept(f.path, f.content)
      concepts.push(concept)
      diagnostics.push(...d)
    }
  }

  // Resolve cross-links now that we know every concept id.
  const idSet = new Set(concepts.map((c) => c.id))
  for (const c of concepts) {
    for (const link of c.outgoing) {
      const r = resolveTarget(c.id, link.href)
      if (r.external) {
        link.external = r.external
      } else if (r.directoryOrAnchor) {
        // directory / index / anchor links are never broken
      } else if (r.targetPath !== undefined) {
        if (idSet.has(r.targetPath)) {
          link.targetId = r.targetPath
        } else {
          link.broken = true
          diagnostics.push({
            severity: 'info',
            code: 'broken-link',
            file: c.filePath,
            message: `Link "${link.href}" has no matching concept in the bundle.`
          })
        }
      }
    }
  }

  const types = [...new Set(concepts.map((c) => c.type).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  )

  return {
    id: input.source.origin,
    label: input.label,
    source: input.source,
    okfVersion,
    concepts,
    indexes,
    logs,
    types,
    diagnostics
  }
}
