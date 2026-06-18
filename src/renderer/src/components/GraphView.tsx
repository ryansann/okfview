import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
import type { Bundle } from '@shared/okf/types'
import { colorForType } from '../lib/colors'

interface Props {
  bundle: Bundle
  activeConceptId: string | null
  onNavigate: (conceptId: string) => void
}

const LAYOUTS = ['cose', 'concentric', 'breadthfirst', 'circle', 'grid'] as const
type Layout = (typeof LAYOUTS)[number]

export function GraphView({ bundle, activeConceptId, onNavigate }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [layout, setLayout] = useState<Layout>('cose')
  const [typeFilter, setTypeFilter] = useState('')
  const [query, setQuery] = useState('')

  const elements = useMemo<ElementDefinition[]>(() => {
    const nodes: ElementDefinition[] = bundle.concepts.map((c) => ({
      data: {
        id: c.id,
        label: c.title || c.id.split('/').pop() || c.id,
        type: c.type,
        color: colorForType(c.type)
      }
    }))
    const ids = new Set(bundle.concepts.map((c) => c.id))
    const edges: ElementDefinition[] = []
    const seen = new Set<string>()
    for (const c of bundle.concepts) {
      for (const l of c.outgoing) {
        if (l.targetId && ids.has(l.targetId)) {
          const key = `${c.id}->${l.targetId}`
          if (seen.has(key)) continue
          seen.add(key)
          edges.push({ data: { id: key, source: c.id, target: l.targetId } })
        }
      }
    }
    return [...nodes, ...edges]
  }, [bundle])

  // Create the instance once.
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
            'font-size': 10,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-max-width': '120px',
            'text-wrap': 'ellipsis',
            width: 16,
            height: 16,
            'border-width': 0
          }
        },
        {
          selector: 'edge',
          style: {
            width: 1,
            'line-color': '#30363d',
            'target-arrow-color': '#30363d',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'curve-style': 'bezier',
            opacity: 0.7
          }
        },
        { selector: 'node.dim', style: { opacity: 0.15 } },
        { selector: 'edge.dim', style: { opacity: 0.05 } },
        {
          selector: 'node.active',
          style: { 'border-width': 3, 'border-color': '#ffffff', width: 22, height: 22 }
        },
        { selector: 'node.match', style: { 'border-width': 2, 'border-color': '#ffd43b' } }
      ],
      layout: { name: layout, animate: false } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.2
    })
    cy.on('tap', 'node', (evt) => onNavigate(evt.target.id()))
    cyRef.current = cy
    return () => {
      cy.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync elements when the bundle changes (live sync), preserving layout.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.json({ elements })
    cy.layout({ name: layout, animate: false } as cytoscape.LayoutOptions).run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements])

  // Re-run layout on demand.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.layout({ name: layout, animate: true } as cytoscape.LayoutOptions).run()
  }, [layout])

  // Highlight active + filter + search.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().removeClass('dim active match')
      if (typeFilter) {
        cy.nodes().forEach((n) => {
          if (n.data('type') !== typeFilter) n.addClass('dim')
        })
        cy.edges().forEach((e) => {
          if (e.source().hasClass('dim') || e.target().hasClass('dim')) e.addClass('dim')
        })
      }
      if (query.trim()) {
        const q = query.toLowerCase()
        cy.nodes().forEach((n) => {
          if (`${n.data('label')} ${n.id()} ${n.data('type')}`.toLowerCase().includes(q))
            n.addClass('match')
        })
      }
      if (activeConceptId) {
        const node = cy.getElementById(activeConceptId)
        if (node.nonempty()) {
          node.addClass('active')
          cy.center(node)
        }
      }
    })
  }, [typeFilter, query, activeConceptId])

  return (
    <div className="graph-view">
      <div className="graph-controls">
        <input
          className="graph-search"
          placeholder="Highlight…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types ({bundle.types.length})</option>
          {bundle.types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={layout} onChange={(e) => setLayout(e.target.value as Layout)}>
          {LAYOUTS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => cyRef.current?.fit(undefined, 40)}>
          Fit
        </button>
      </div>
      <div className="graph-canvas" ref={containerRef} />
    </div>
  )
}
