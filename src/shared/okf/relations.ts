// Pure graph-relation helpers over a parsed Bundle. No Node/DOM deps — usable
// in the renderer and unit-testable directly.
import type { Bundle, Concept, ConceptId } from './types'

/** Concepts that link TO `conceptId` (its backlinks / "referenced by"). */
export function backlinksOf(bundle: Bundle, conceptId: ConceptId): Concept[] {
  return bundle.concepts.filter((c) => c.outgoing.some((l) => l.targetId === conceptId))
}

/** Distinct in-bundle concepts that `concept` links to ("links to"). */
export function outgoingTargets(concept: Concept, bundle: Bundle): Concept[] {
  const byId = new Map(bundle.concepts.map((c) => [c.id, c]))
  const seen = new Set<ConceptId>()
  const out: Concept[] = []
  for (const l of concept.outgoing) {
    if (!l.targetId || seen.has(l.targetId)) continue
    const target = byId.get(l.targetId)
    if (target) {
      seen.add(l.targetId)
      out.push(target)
    }
  }
  return out
}

export interface ConformanceSummary {
  conceptCount: number
  missingFrontmatter: number
  missingType: number
  brokenLinks: number
  /** True when the bundle satisfies OKF v0.1 §9 (no frontmatter/type violations). */
  conformant: boolean
}

/** Summarize conformance signal from a bundle's diagnostics (spec §9). */
export function conformanceSummary(bundle: Bundle): ConformanceSummary {
  const count = (code: string): number => bundle.diagnostics.filter((d) => d.code === code).length
  const missingFrontmatter = count('missing-frontmatter')
  const missingType = count('missing-type')
  const brokenLinks = count('broken-link')
  return {
    conceptCount: bundle.concepts.length,
    missingFrontmatter,
    missingType,
    brokenLinks,
    conformant: missingFrontmatter === 0 && missingType === 0
  }
}
