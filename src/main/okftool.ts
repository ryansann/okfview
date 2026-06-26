// Bridges okfview to the okftool wasm linter. okftool is the single source of
// truth for diagnostics (spec validation + lint rules); okfview still builds its
// own concept/graph model. Main-process only (loads wasm via a CommonJS
// require), never import in the renderer.
import { lint as okftoolLint, rules as okftoolRules } from '@ryansann/okftool'
import type { Diagnostic, RawFile } from '@shared/okf/types'
import type { LintProfile } from '@shared/ipc'

/** The app-policy lint config (`.okftool.yaml` contents) for a strictness profile. */
export function profileToYaml(profile: LintProfile): string {
  if (profile === 'strict') return 'extends: okf-strict\n'
  if (profile === 'minimal') return 'extends: okf-minimal\n'
  return '' // recommended — okftool's default profile
}

type OkftoolSeverity = 'off' | 'info' | 'warn' | 'error'

interface OkftoolDiagnostic {
  file: string
  code: string
  ruleName?: string
  category?: string
  categoryName?: string
  severity: OkftoolSeverity
  message: string
  spec: boolean
  rationale?: string
  help?: string
  fix?: string
}

interface OkftoolLink {
  href: string
  targetId?: string
  external?: string
  broken: boolean
}

interface OkftoolConcept {
  id: string
  type?: string
  frontmatter: Record<string, unknown>
  outgoing: OkftoolLink[]
}

interface OkftoolBundle {
  concepts: OkftoolConcept[]
  diagnostics: OkftoolDiagnostic[]
  conformant: boolean
}

function mapDiagnostic(d: OkftoolDiagnostic): Diagnostic {
  return {
    severity: d.severity === 'off' ? 'info' : d.severity,
    code: d.code,
    file: d.file,
    message: d.message,
    spec: d.spec,
    ...(d.ruleName ? { ruleName: d.ruleName } : {}),
    ...(d.category ? { category: d.category } : {}),
    ...(d.categoryName ? { categoryName: d.categoryName } : {}),
    ...(d.rationale ? { rationale: d.rationale } : {}),
    ...(d.help ? { help: d.help } : {}),
    ...(d.fix ? { fix: d.fix } : {})
  }
}

export interface OkftoolResult {
  conformant: boolean
  diagnostics: Diagnostic[]
}

/**
 * Run okftool's validate + lint over a set of files. `configYaml` is the
 * contents of a `.okftool.yaml` ('' → the okf-recommended profile). Never throws
 * — a linter failure degrades to a conformant empty result.
 */
export function checkWithOkftool(files: RawFile[], configYaml = ''): OkftoolResult {
  try {
    const input = files.map((f) => ({ path: f.path, content: f.content }))
    const bundle = okftoolLint(input, configYaml) as OkftoolBundle
    return { conformant: bundle.conformant, diagnostics: bundle.diagnostics.map(mapDiagnostic) }
  } catch (e) {
    console.error('[okftool] lint failed:', e)
    return { conformant: true, diagnostics: [] }
  }
}

/** Diagnostics-only convenience (used when assembling a bundle). */
export function lintWithOkftool(files: RawFile[], configYaml = ''): Diagnostic[] {
  return checkWithOkftool(files, configYaml).diagnostics
}

export interface DraftLint {
  conformant: boolean
  type?: string
  frontmatter: Record<string, unknown>
  linksTo: string[]
  externalLinks: string[]
  diagnostics: Diagnostic[]
}

/**
 * Validate + lint a single raw OKF document that isn't part of a bundle (an
 * agent iterating on a draft). Returns the parsed type/frontmatter/links plus
 * diagnostics with fixes.
 */
export function lintDraftWithOkftool(content: string, path = 'draft.md', configYaml = ''): DraftLint {
  try {
    const bundle = okftoolLint([{ path, content }], configYaml) as OkftoolBundle
    const concept = bundle.concepts[0]
    const outgoing = concept?.outgoing ?? []
    return {
      conformant: bundle.conformant,
      type: concept?.type,
      frontmatter: concept?.frontmatter ?? {},
      linksTo: outgoing.filter((l) => !l.external).map((l) => l.href),
      externalLinks: outgoing.filter((l) => l.external).map((l) => l.external as string),
      diagnostics: bundle.diagnostics.map(mapDiagnostic)
    }
  } catch (e) {
    console.error('[okftool] draft lint failed:', e)
    return { conformant: true, frontmatter: {}, linksTo: [], externalLinks: [], diagnostics: [] }
  }
}

/** okftool's lint-rule catalog (for the `okf://rules` MCP resource). */
export function okftoolRuleCatalog(): unknown {
  try {
    // okftool serializes the catalog entries as JS Maps; flatten to plain objects.
    return (okftoolRules() as unknown[]).map((r) => (r instanceof Map ? Object.fromEntries(r) : r))
  } catch (e) {
    console.error('[okftool] rules() failed:', e)
    return []
  }
}
