import { useMemo } from 'react'
import type { Bundle, Concept } from '@shared/okf/types'
import { backlinksOf, outgoingTargets } from '@shared/okf/relations'
import { Markdown } from './Markdown'
import { FrontmatterHeader } from './Frontmatter'
import { colorForType } from '../lib/colors'

interface Props {
  bundle: Bundle
  concept: Concept
  onNavigate: (conceptId: string) => void
}

export function DocumentView({ bundle, concept, onNavigate }: Props): JSX.Element {
  const openExternal = (u: string): void => void window.okf.openExternal(u)

  const backlinks = useMemo(() => backlinksOf(bundle, concept.id), [bundle, concept.id])
  const outgoing = useMemo(() => outgoingTargets(concept, bundle), [bundle, concept])

  return (
    <div className="document-view">
      <article className="doc-scroll" key={concept.id}>
        <FrontmatterHeader concept={concept} onExternal={openExternal} />
        <Markdown concept={concept} onNavigate={onNavigate} onExternal={openExternal} />
      </article>

      <aside className="doc-rail">
        <RailSection title="Referenced by" count={backlinks.length}>
          {backlinks.map((c) => (
            <RelRow key={c.id} concept={c} onClick={() => onNavigate(c.id)} />
          ))}
          {backlinks.length === 0 && <p className="rail-empty">No backlinks</p>}
        </RailSection>

        <RailSection title="Links to" count={outgoing.length}>
          {outgoing.map((c) => (
            <RelRow key={c.id} concept={c} onClick={() => onNavigate(c.id)} />
          ))}
          {outgoing.length === 0 && <p className="rail-empty">No outgoing links</p>}
        </RailSection>
      </aside>
    </div>
  )
}

function RailSection({
  title,
  count,
  children
}: {
  title: string
  count: number
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="rail-section">
      <h3>
        {title} <span className="rail-count">{count}</span>
      </h3>
      <div className="rail-list">{children}</div>
    </section>
  )
}

function RelRow({ concept, onClick }: { concept: Concept; onClick: () => void }): JSX.Element {
  return (
    <button className="rel-row" onClick={onClick} title={concept.id}>
      <span className="rel-dot" style={{ background: colorForType(concept.type) }} />
      <span className="rel-title">{concept.title || concept.id.split('/').pop()}</span>
      <span className="rel-type">{concept.type}</span>
    </button>
  )
}
