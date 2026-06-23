// Core OKF data model — shared between main (parsing) and renderer (display).
// Type-only in the renderer, so this file must stay free of runtime Node deps.

export type ConceptId = string // file path minus `.md`, forward-slashed, bundle-relative

export type SourceKind = 'local' | 'git' | 'http'

export interface SourceInfo {
  kind: SourceKind
  origin: string // absolute path (local) or URL (git/http)
  lastSynced?: string // ISO 8601
}

export interface Link {
  href: string // raw markdown href
  text: string
  targetId?: ConceptId // resolved in-bundle concept, if any
  external?: string // resolved external URL, if any
  broken: boolean // in-bundle link whose target does not exist
}

export interface Concept {
  id: ConceptId
  filePath: string // bundle-relative path including `.md`
  type: string // required by spec; '' surfaces a diagnostic
  frontmatter: Record<string, unknown> // all keys preserved verbatim
  title?: string
  description?: string
  resource?: string
  tags: string[]
  timestamp?: string
  body: string // raw markdown after the frontmatter
  outgoing: Link[]
}

export interface IndexEntry {
  title: string
  href: string
  description?: string
  targetId?: ConceptId
}
export interface IndexSection {
  heading: string
  entries: IndexEntry[]
}
export interface IndexFile {
  dir: string // directory the index describes ('' = bundle root)
  path: string
  sections: IndexSection[]
}

export interface LogEntry {
  verb?: string // leading bold word: Update / Creation / Deprecation …
  text: string
}
export interface LogDay {
  date: string // ISO 8601 YYYY-MM-DD
  entries: LogEntry[]
}
export interface LogFile {
  path: string
  dir: string
  days: LogDay[]
}

export type DiagnosticSeverity = 'info' | 'warn' | 'error'
export interface Diagnostic {
  severity: DiagnosticSeverity
  code: string
  file: string
  message: string
  fix?: string // optional actionable suggestion (from okftool)
}

export interface Bundle {
  id: string
  label: string
  source: SourceInfo
  okfVersion?: string // declared in bundle-root index.md only
  shared?: boolean // exposed to MCP agents (scoping)
  concepts: Concept[]
  indexes: IndexFile[]
  logs: LogFile[]
  types: string[] // distinct, sorted
  diagnostics: Diagnostic[]
}

// Raw inputs handed to the parser.
export interface RawFile {
  path: string // bundle-relative, forward-slashed
  content: string
}
export interface RawBundle {
  label: string
  source: SourceInfo
  files: RawFile[]
}

// Lightweight handle for the workspace list.
export interface BundleHandle {
  id: string
  label: string
  source: SourceInfo
  conceptCount: number
  diagnosticCount: number
}
