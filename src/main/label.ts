import type { SourceKind } from '@shared/okf/types'

// Directory names too generic to identify a bundle on their own. When a bundle's
// leaf folder is one of these, we walk up to a meaningful ancestor (e.g. the
// project dir), so `myproject/docs/okf` is labeled "myproject" rather than "okf".
const GENERIC_SEGMENTS = new Set([
  'okf',
  '.okf',
  'docs',
  'doc',
  'bundle',
  'bundles',
  'knowledge',
  'kb',
  'wiki'
])

/** A readable default label for a bundle from its origin (path, or URL + #subpath). */
export function deriveLabel(kind: SourceKind, origin: string): string {
  let segs: string[]
  if (kind === 'local') {
    segs = origin.split(/[\\/]/).filter(Boolean)
  } else {
    const [base, sub] = origin.split('#')
    if (sub) {
      segs = sub.split('/').filter(Boolean)
    } else {
      segs = base
        .replace(/\.git$/i, '')
        .replace(/\.(tar\.gz|tgz|zip)$/i, '')
        .replace(/^[a-z]+:\/\//i, '')
        .split('/')
        .filter(Boolean)
    }
  }
  if (segs.length === 0) return origin
  let i = segs.length - 1
  while (i > 0 && GENERIC_SEGMENTS.has(segs[i].toLowerCase())) i--
  return segs[i]
}
