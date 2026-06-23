import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
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
  const [railMode, setRailMode] = useState<'list' | 'map'>('list')

  const backlinks = useMemo(() => backlinksOf(bundle, concept.id), [bundle, concept.id])
  const outgoing = useMemo(() => outgoingTargets(concept, bundle), [bundle, concept])

  return (
    <div className="document-view">
      <article className="doc-scroll" key={concept.id}>
        <div className="doc-inner">
          <FrontmatterHeader concept={concept} onExternal={openExternal} />
          <Markdown concept={concept} onNavigate={onNavigate} onExternal={openExternal} />
        </div>
      </article>

      <aside className="doc-rail">
        <div className="rail-mode">
          <button className={railMode === 'list' ? 'on' : ''} onClick={() => setRailMode('list')}>
            List
          </button>
          <button className={railMode === 'map' ? 'on' : ''} onClick={() => setRailMode('map')}>
            Map
          </button>
        </div>

        {railMode === 'list' ? (
          <>
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
          </>
        ) : (
          <NeighborhoodMap
            concept={concept}
            backlinks={backlinks}
            outgoing={outgoing}
            onNavigate={onNavigate}
          />
        )}
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

function NeighborhoodMap({
  concept,
  backlinks,
  outgoing,
  onNavigate
}: {
  concept: Concept
  backlinks: Concept[]
  outgoing: Concept[]
  onNavigate: (conceptId: string) => void
}): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onNavigateRef = useRef(onNavigate)
  const conceptIdRef = useRef(concept.id)
  const elements = useMemo(
    () => neighborhoodElements(concept, backlinks, outgoing),
    [concept, backlinks, outgoing]
  )

  useEffect(() => {
    onNavigateRef.current = onNavigate
  }, [onNavigate])

  useEffect(() => {
    conceptIdRef.current = concept.id
  }, [concept.id])

  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#c9d1d9',
            'font-size': 9,
            'font-weight': 700,
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-max-width': '92px',
            'text-wrap': 'ellipsis',
            width: 'data(size)',
            height: 'data(size)',
            'border-width': 1,
            'border-color': 'rgba(255,255,255,0.2)'
          }
        },
        {
          selector: 'node.focus',
          style: { 'border-width': 3, 'border-color': '#ffffff', 'z-index': 10 }
        },
        {
          selector: 'edge',
          style: {
            width: 1.6,
            'line-color': '#4b5566',
            'target-arrow-color': '#4b5566',
            'source-arrow-shape': 'none',
            'target-arrow-shape': 'triangle-backcurve',
            'arrow-scale': 0.82,
            'curve-style': 'unbundled-bezier',
            'source-endpoint': 'outside-to-node',
            'target-endpoint': 'outside-to-node',
            'control-point-distances': 'data(controlPointDistance)',
            'control-point-weights': 0.5,
            opacity: 0.78
          }
        }
      ],
      layout: { name: 'preset', fit: true, padding: 28, animate: false } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.2
    })
    cy.on('tap', 'node', (evt) => {
      const id = evt.target.id()
      if (id !== conceptIdRef.current) onNavigateRef.current(id)
    })
    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.json({ elements })
    cy.layout({ name: 'preset', fit: true, padding: 28, animate: false } as cytoscape.LayoutOptions).run()
  }, [elements])

  return (
    <section className="rail-section neighborhood-section">
      <h3>
        Neighborhood <span className="rail-count">{backlinks.length + outgoing.length}</span>
      </h3>
      <div className="neighborhood-map" ref={containerRef} />
      {backlinks.length === 0 && outgoing.length === 0 && (
        <p className="rail-empty">No linked concepts</p>
      )}
    </section>
  )
}

function neighborhoodElements(
  concept: Concept,
  backlinks: Concept[],
  outgoing: Concept[]
): ElementDefinition[] {
  const related = new Map<string, { concept: Concept; in: boolean; out: boolean }>()
  for (const c of backlinks) related.set(c.id, { concept: c, in: true, out: false })
  for (const c of outgoing) {
    const entry = related.get(c.id)
    if (entry) entry.out = true
    else related.set(c.id, { concept: c, in: false, out: true })
  }

  const nodes: ElementDefinition[] = [
    {
      data: {
        id: concept.id,
        label: concept.title || concept.id.split('/').pop() || concept.id,
        color: colorForType(concept.type),
        size: 28
      },
      classes: 'focus',
      position: { x: 0, y: 0 }
    }
  ]
  const edges: ElementDefinition[] = []
  const entries = [...related.values()].sort((a, b) => a.concept.id.localeCompare(b.concept.id))
  entries.forEach((entry, index) => {
    const angle = (index / Math.max(entries.length, 1)) * Math.PI * 2 - Math.PI / 2
    const radius = 96 + Math.floor(index / 10) * 44
    nodes.push({
      data: {
        id: entry.concept.id,
        label: entry.concept.title || entry.concept.id.split('/').pop() || entry.concept.id,
        color: colorForType(entry.concept.type),
        size: entry.in && entry.out ? 22 : 18
      },
      position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
    })
    if (entry.in) {
      edges.push({
        data: {
          id: `${entry.concept.id}->${concept.id}`,
          source: entry.concept.id,
          target: concept.id,
          controlPointDistance: entry.out ? 28 : 18
        }
      })
    }
    if (entry.out) {
      edges.push({
        data: {
          id: `${concept.id}->${entry.concept.id}`,
          source: concept.id,
          target: entry.concept.id,
          controlPointDistance: entry.in ? 28 : 18
        }
      })
    }
  })
  return [...nodes, ...edges]
}
