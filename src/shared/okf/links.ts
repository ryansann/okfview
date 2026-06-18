// Pure link helpers — no Node deps, safe to import anywhere.
import type { ConceptId } from './types'

export interface RawLink {
  href: string
  text: string
}

const IMAGE_OR_LINK = /(!?)\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g
const AUTOLINK = /<((?:https?|mailto):[^>]+)>/g

/** Extract markdown links from a body, skipping images. */
export function extractLinks(markdown: string): RawLink[] {
  const links: RawLink[] = []
  let m: RegExpExecArray | null
  IMAGE_OR_LINK.lastIndex = 0
  while ((m = IMAGE_OR_LINK.exec(markdown))) {
    if (m[1] === '!') continue // image, not a link
    links.push({ text: m[2], href: m[3] })
  }
  AUTOLINK.lastIndex = 0
  while ((m = AUTOLINK.exec(markdown))) {
    links.push({ text: m[1], href: m[1] })
  }
  return links
}

export function isExternal(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith('mailto:')
}

/** Normalize a relative path against a base directory, resolving `.`/`..`. */
function normalize(baseDir: string, rel: string): string {
  const parts = (baseDir ? baseDir.split('/') : []).concat(rel.split('/'))
  const out: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') out.pop()
    else out.push(p)
  }
  return out.join('/')
}

export interface ResolvedTarget {
  external?: string
  /** Concept id the link points at (`.md` stripped), if it is an in-bundle path. */
  targetPath?: string
  /** True for `.../index.md`, `subdir/` and bare-anchor links — never "broken". */
  directoryOrAnchor?: boolean
}

/**
 * Resolve a markdown href as seen from `fromId` (a concept id, no `.md`).
 * Returns the in-bundle target path (without `.md`), an external URL, or a
 * directory/anchor marker. Membership in the bundle is decided by the caller.
 */
export function resolveTarget(fromId: ConceptId, href: string): ResolvedTarget {
  if (isExternal(href)) return { external: href }

  const hashIdx = href.indexOf('#')
  const pathPart = hashIdx >= 0 ? href.slice(0, hashIdx) : href
  if (pathPart === '') return { directoryOrAnchor: true } // pure `#anchor`

  // Directory links (trailing slash) are progressive-disclosure pointers, not concepts.
  if (pathPart.endsWith('/')) return { directoryOrAnchor: true }

  const baseDir = fromId.includes('/') ? fromId.slice(0, fromId.lastIndexOf('/')) : ''
  const abs = pathPart.startsWith('/') ? pathPart.slice(1) : normalize(baseDir, pathPart)
  const stripped = abs.replace(/\.md$/i, '')

  // Links to an index file point at a directory, not a concept.
  if (stripped === 'index' || stripped.endsWith('/index')) return { directoryOrAnchor: true }

  return { targetPath: stripped }
}
