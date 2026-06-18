import { Fragment } from 'react'
import type { Concept } from '@shared/okf/types'
import { colorForType } from '../lib/colors'
import { relTime, stringifyValue } from '../lib/format'

const KNOWN = new Set(['type', 'title', 'description', 'resource', 'tags', 'timestamp'])

export function TypePill({ type }: { type: string }): JSX.Element {
  const c = colorForType(type)
  return (
    <span className="pill" style={{ background: `${c}1f`, color: c, borderColor: `${c}55` }}>
      {type || 'untyped'}
    </span>
  )
}

interface Props {
  concept: Concept
  onExternal: (url: string) => void
}

export function FrontmatterHeader({ concept, onExternal }: Props): JSX.Element {
  const extra = Object.entries(concept.frontmatter).filter(([k]) => !KNOWN.has(k))
  return (
    <header className="doc-header">
      <div className="doc-type-row">
        <TypePill type={concept.type} />
        {concept.timestamp && (
          <span className="muted ts" title={concept.timestamp}>
            updated {relTime(concept.timestamp)}
          </span>
        )}
        <span className="muted id">{concept.id}</span>
      </div>
      <h1 className="doc-title">{concept.title || concept.id.split('/').pop()}</h1>
      {concept.description && <p className="doc-desc">{concept.description}</p>}
      <div className="doc-meta">
        {concept.resource && (
          <a
            className="resource-link"
            href={concept.resource}
            onClick={(e) => {
              e.preventDefault()
              onExternal(concept.resource as string)
            }}
          >
            ↗ {hostOf(concept.resource)}
          </a>
        )}
        {concept.tags.map((t) => (
          <span key={t} className="chip">
            #{t}
          </span>
        ))}
      </div>
      {extra.length > 0 && (
        <details className="extra-fields">
          <summary>
            {extra.length} additional frontmatter field{extra.length > 1 ? 's' : ''}
          </summary>
          <dl>
            {extra.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{stringifyValue(v)}</dd>
              </Fragment>
            ))}
          </dl>
        </details>
      )}
    </header>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname || url
  } catch {
    return url
  }
}
