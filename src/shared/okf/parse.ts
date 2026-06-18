// OKF document parsing. Uses gray-matter (Node/CJS) — imported only by the main
// process, never the renderer.
import matter from 'gray-matter'
import { extractLinks } from './links'
import type {
  Concept,
  Diagnostic,
  IndexFile,
  IndexSection,
  Link,
  LogDay,
  LogFile
} from './types'

export function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return (i >= 0 ? path.slice(i + 1) : path).toLowerCase()
}

export function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i >= 0 ? path.slice(0, i) : ''
}

export function conceptIdFromPath(path: string): string {
  return path.replace(/\.md$/i, '')
}

export type ReservedKind = 'index' | 'log' | null
export function reservedKind(path: string): ReservedKind {
  const b = basename(path)
  if (b === 'index.md') return 'index'
  if (b === 'log.md') return 'log'
  return null
}

function asString(v: unknown): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x))
  if (typeof v === 'string') return v.split(',').map((s) => s.trim()).filter(Boolean)
  return []
}

export interface ParsedConcept {
  concept: Concept
  diagnostics: Diagnostic[]
}

/** Parse a non-reserved concept document. Always returns a Concept (permissive). */
export function parseConcept(path: string, raw: string): ParsedConcept {
  const diagnostics: Diagnostic[] = []
  const hasFrontmatter = /^﻿?---\r?\n/.test(raw)
  let data: Record<string, unknown> = {}
  let body = raw

  if (!hasFrontmatter) {
    diagnostics.push({
      severity: 'warn',
      code: 'missing-frontmatter',
      file: path,
      message: 'Concept document has no YAML frontmatter block (spec §9.1).'
    })
  } else {
    try {
      const fm = matter(raw)
      data = (fm.data as Record<string, unknown>) ?? {}
      body = fm.content
    } catch (e) {
      diagnostics.push({
        severity: 'warn',
        code: 'frontmatter-parse',
        file: path,
        message: `Unparseable YAML frontmatter: ${(e as Error).message}`
      })
    }
  }

  const type = (asString(data.type) ?? '').trim()
  if (!type) {
    diagnostics.push({
      severity: 'warn',
      code: 'missing-type',
      file: path,
      message: 'Frontmatter is missing a non-empty `type` field (spec §9.2).'
    })
  }

  const outgoing: Link[] = extractLinks(body).map((l) => ({
    href: l.href,
    text: l.text,
    broken: false
  }))

  const concept: Concept = {
    id: conceptIdFromPath(path),
    filePath: path,
    type,
    frontmatter: data,
    title: asString(data.title),
    description: asString(data.description),
    resource: asString(data.resource),
    tags: asTags(data.tags),
    timestamp: asString(data.timestamp),
    body,
    outgoing
  }
  return { concept, diagnostics }
}

export interface ParsedIndex {
  index: IndexFile
  okfVersion?: string
  diagnostics: Diagnostic[]
}

const HEADING = /^#{1,6}\s+(.*?)\s*$/
const LIST_LINK = /^\s*[*+-]\s+\[([^\]]*)\]\(([^)]+)\)\s*(?:[-–—:]\s*(.*))?$/

/** Parse a reserved `index.md`. Frontmatter is only valid in the bundle-root index. */
export function parseIndex(path: string, raw: string): ParsedIndex {
  const diagnostics: Diagnostic[] = []
  let okfVersion: string | undefined
  let body = raw

  const hasFrontmatter = /^﻿?---\r?\n/.test(raw)
  if (hasFrontmatter) {
    try {
      const fm = matter(raw)
      const data = (fm.data as Record<string, unknown>) ?? {}
      body = fm.content
      if (data.okf_version != null) okfVersion = String(data.okf_version)
      const isRoot = dirOf(path) === ''
      if (!isRoot) {
        diagnostics.push({
          severity: 'info',
          code: 'index-frontmatter',
          file: path,
          message: 'Frontmatter in an index.md is only permitted in the bundle-root index (spec §11).'
        })
      }
    } catch {
      /* index frontmatter is best-effort */
    }
  }

  const sections: IndexSection[] = []
  let current: IndexSection | null = null
  for (const line of body.split('\n')) {
    const h = HEADING.exec(line)
    if (h) {
      current = { heading: h[1], entries: [] }
      sections.push(current)
      continue
    }
    const li = LIST_LINK.exec(line)
    if (li) {
      if (!current) {
        current = { heading: '', entries: [] }
        sections.push(current)
      }
      current.entries.push({ title: li[1], href: li[2], description: li[3]?.trim() || undefined })
    }
  }

  return { index: { dir: dirOf(path), path, sections }, okfVersion, diagnostics }
}

const LOG_DATE = /^#{1,6}\s+(\d{4}-\d{2}-\d{2})\s*$/
const LOG_ITEM = /^\s*[*+-]\s+(.*)$/
const LOG_VERB = /^\*\*([^*]+)\*\*:?\s*(.*)$/

export function parseLog(path: string, raw: string): { log: LogFile; diagnostics: Diagnostic[] } {
  const days: LogDay[] = []
  let current: LogDay | null = null
  for (const line of raw.split('\n')) {
    const d = LOG_DATE.exec(line.trim())
    if (d) {
      current = { date: d[1], entries: [] }
      days.push(current)
      continue
    }
    const item = LOG_ITEM.exec(line)
    if (item && current) {
      const v = LOG_VERB.exec(item[1])
      if (v) current.entries.push({ verb: v[1].trim(), text: v[2].trim() })
      else current.entries.push({ text: item[1].trim() })
    }
  }
  return { log: { path, dir: dirOf(path), days }, diagnostics: [] }
}
