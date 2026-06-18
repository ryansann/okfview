// Conformance linting with actionable fixes. Reuses the parser, so (like parse.ts)
// this is main-process only — never import it in the renderer.
import { parseConcept } from './parse'
import type { Bundle } from './types'

export interface LintIssue {
  file: string
  code: string
  severity: 'info' | 'warn'
  message: string
  fix?: string
}

const FIX: Record<string, string> = {
  'missing-frontmatter':
    'Add a YAML frontmatter block delimited by `---` at the very top of the file, including at least `type:`.',
  'missing-type':
    'Add a non-empty `type:` field to the frontmatter (e.g. `type: BigQuery Table`). It is the only required OKF field.',
  'frontmatter-parse':
    'Fix the YAML syntax in the frontmatter block — check indentation, colons, and quoting.',
  'broken-link':
    'Point the link at an existing concept (its path minus `.md`), or create the target document. Broken links are allowed but usually unintended.',
  'index-frontmatter':
    'Remove frontmatter from this index.md. Only the bundle-root index.md may carry frontmatter, and only `okf_version`.'
}

const FATAL = new Set(['missing-frontmatter', 'missing-type', 'frontmatter-parse'])

/** Conformance issues for a whole bundle, each annotated with a suggested fix. */
export function lintBundle(bundle: Bundle): LintIssue[] {
  return bundle.diagnostics.map((d) => ({
    file: d.file,
    code: d.code,
    severity: d.severity,
    message: d.message,
    fix: FIX[d.code]
  }))
}

export interface DocumentLint {
  conformant: boolean
  type: string
  hasFrontmatter: boolean
  frontmatter: Record<string, unknown>
  links: { href: string; text: string }[]
  issues: LintIssue[]
}

/**
 * Validate a single OKF document's raw content (frontmatter + body) without it
 * needing to live in a bundle. Lets an agent debug a concept it is drafting.
 */
export function lintDocument(content: string, path = 'draft.md'): DocumentLint {
  const { concept, diagnostics } = parseConcept(path, content)
  const issues: LintIssue[] = diagnostics.map((d) => ({
    file: d.file,
    code: d.code,
    severity: d.severity,
    message: d.message,
    fix: FIX[d.code]
  }))
  return {
    conformant: !issues.some((i) => FATAL.has(i.code)),
    type: concept.type,
    hasFrontmatter: Object.keys(concept.frontmatter).length > 0 || !issues.some((i) => i.code === 'missing-frontmatter'),
    frontmatter: concept.frontmatter,
    links: concept.outgoing.map((l) => ({ href: l.href, text: l.text })),
    issues
  }
}
