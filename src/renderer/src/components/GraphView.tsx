import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
import type { Bundle } from '@shared/okf/types'
import { colorForType } from '../lib/colors'

interface Props {
  bundle: Bundle
  activeConceptId: string | null
  onNavigate: (conceptId: string) => void
}

interface MapNode {
  id: string
  label: string
  type: string
  group: string
  inDegree: number
  outDegree: number
  degree: number
  centrality: number
  pageRank: number
}

interface KnowledgeMap {
  elements: ElementDefinition[]
  nodeCount: number
  edgeCount: number
}

interface GraphSnapshot {
  positions: Record<string, { x: number; y: number }>
  pan: { x: number; y: number }
  zoom: number
}

const PAGERANK_DAMPING = 0.85
const PAGERANK_ITERATIONS = 36
const graphSnapshots = new Map<string, GraphSnapshot>()

export function GraphView({ bundle, activeConceptId, onNavigate }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onNavigateRef = useRef(onNavigate)
  const renderedBundleIdRef = useRef(bundle.id)
  const restoredViewportRef = useRef(false)
  const didInitialElementSyncRef = useRef(false)
  const previousActiveConceptIdRef = useRef(activeConceptId)
  const pendingRestoreFrameRef = useRef<number | null>(null)
  const [typeFilter, setTypeFilter] = useState('')
  const [query, setQuery] = useState('')
  const [showAllLabels, setShowAllLabels] = useState(false)
  const [showEdges, setShowEdges] = useState(true)

  const map = useMemo<KnowledgeMap>(
    () => buildKnowledgeMap(bundle, graphSnapshots.get(bundle.id)?.positions),
    [bundle]
  )

  useEffect(() => {
    onNavigateRef.current = onNavigate
  }, [onNavigate])

  // Create the instance once.
  useEffect(() => {
    if (!containerRef.current) return
    const snapshot = graphSnapshots.get(bundle.id)
    renderedBundleIdRef.current = bundle.id
    const cy = cytoscape({
      container: containerRef.current,
      elements: map.elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(displayLabel)',
            color: '#c9d1d9',
            'font-size': 'data(labelSize)',
            'font-weight': 700,
            'text-valign': 'bottom',
            'text-margin-y': 6,
            'text-max-width': '130px',
            'text-wrap': 'ellipsis',
            'text-background-color': '#0d1117',
            'text-background-opacity': 0.72,
            'text-background-padding': '2px',
            'text-border-opacity': 0,
            width: 'data(size)',
            height: 'data(size)',
            'border-width': 1,
            'border-color': 'rgba(255,255,255,0.18)'
          }
        },
        {
          selector: 'edge',
          style: {
            width: 'data(width)',
            'line-color': '#445061',
            'target-arrow-color': '#445061',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.52,
            'curve-style': 'unbundled-bezier',
            'control-point-distance': 28,
            'control-point-weight': 0.5,
            opacity: 0.38
          }
        },
        { selector: 'node.show-label', style: { label: 'data(label)' } },
        { selector: 'node.hover', style: { label: 'data(label)', 'z-index': 20 } },
        { selector: 'node.neighbor', style: { label: 'data(label)', opacity: 1 } },
        { selector: 'node.dim', style: { opacity: 0.14 } },
        { selector: 'edge.dim', style: { opacity: 0.04 } },
        { selector: 'edge.hot', style: { opacity: 0.9, width: 2.2, 'z-index': 10 } },
        { selector: 'edge.hide', style: { opacity: 0 } },
        {
          selector: 'node.active',
          style: { label: 'data(label)', 'border-width': 3, 'border-color': '#ffffff', 'z-index': 30 }
        },
        {
          selector: 'node.match',
          style: { label: 'data(label)', 'border-width': 2, 'border-color': '#ffd43b', 'z-index': 25 }
        }
      ],
      layout: {
        name: 'preset',
        fit: !snapshot,
        padding: 48,
        animate: false
      } as cytoscape.LayoutOptions,
      wheelSensitivity: 0.2
    })
    restoreSnapshotIfPresent(cy, snapshot, restoredViewportRef, pendingRestoreFrameRef)
    cy.on('tap', 'node', (evt) => onNavigateRef.current(evt.target.id()))
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target
      node.addClass('hover')
      node.neighborhood('node').addClass('neighbor')
      node.connectedEdges().addClass('hot')
    })
    cy.on('mouseout', 'node', (evt) => {
      const node = evt.target
      node.removeClass('hover')
      node.neighborhood('node').removeClass('neighbor')
      node.connectedEdges().removeClass('hot')
    })
    let saveTimer: number | null = null
    const scheduleSave = (): void => {
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        saveGraphSnapshot(renderedBundleIdRef.current, cy)
        saveTimer = null
      }, 120)
    }
    cy.on('free', 'node', scheduleSave)
    cy.on('pan zoom', scheduleSave)
    cyRef.current = cy
    return () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      if (pendingRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingRestoreFrameRef.current)
        pendingRestoreFrameRef.current = null
      }
      saveGraphSnapshot(renderedBundleIdRef.current, cy)
      cy.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync elements when the bundle changes (live sync), preserving layout.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    if (!didInitialElementSyncRef.current) {
      didInitialElementSyncRef.current = true
      return
    }
    saveGraphSnapshot(renderedBundleIdRef.current, cy)
    renderedBundleIdRef.current = bundle.id
    const snapshot = graphSnapshots.get(bundle.id)
    cy.json({ elements: map.elements })
    cy.layout({
      name: 'preset',
      fit: !snapshot,
      padding: 48,
      animate: false
    } as cytoscape.LayoutOptions).run()
    restoreSnapshotIfPresent(cy, snapshot, restoredViewportRef, pendingRestoreFrameRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.id, map.elements])

  // Highlight active + filter + search.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().removeClass('dim active match hide show-label')
      if (showAllLabels) cy.nodes().addClass('show-label')
      if (!showEdges) cy.edges().addClass('hide')
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
        }
      }
      restoredViewportRef.current = false
    })
  }, [typeFilter, query, activeConceptId, showAllLabels, showEdges, map.elements])

  // Center only when navigation changes the active concept, not when filters or labels change.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const previous = previousActiveConceptIdRef.current
    previousActiveConceptIdRef.current = activeConceptId
    if (!activeConceptId || activeConceptId === previous) return

    if (pendingRestoreFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingRestoreFrameRef.current)
      pendingRestoreFrameRef.current = null
      restoredViewportRef.current = false
    }

    const node = cy.getElementById(activeConceptId)
    if (node.nonempty()) cy.center(node)
  }, [activeConceptId])

  return (
    <div className="graph-view">
      <div className="graph-controls">
        <div className="graph-summary" title="Knowledge Map uses link centrality to place hubs near the center">
          Knowledge Map
          <span>
            {map.nodeCount} concepts / {map.edgeCount} links
          </span>
        </div>
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
        <button
          className={`graph-toggle ${showAllLabels ? 'on' : ''}`}
          onClick={() => setShowAllLabels((v) => !v)}
          title="Toggle between smart labels and all labels"
        >
          Labels
        </button>
        <button
          className={`graph-toggle ${showEdges ? 'on' : ''}`}
          onClick={() => setShowEdges((v) => !v)}
          title="Show or hide graph edges"
        >
          Edges
        </button>
        <button className="btn" onClick={() => cyRef.current?.fit(undefined, 40)}>
          Fit
        </button>
      </div>
      <div className="graph-canvas" ref={containerRef} />
    </div>
  )
}

function buildKnowledgeMap(
  bundle: Bundle,
  savedPositions?: Record<string, { x: number; y: number }>
): KnowledgeMap {
  const ids = bundle.concepts.map((c) => c.id)
  const idSet = new Set(ids)
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()
  for (const id of ids) {
    outgoing.set(id, new Set())
    incoming.set(id, new Set())
  }

  const edges: ElementDefinition[] = []
  const seen = new Set<string>()
  for (const c of bundle.concepts) {
    for (const l of c.outgoing) {
      if (!l.targetId || !idSet.has(l.targetId)) continue
      const key = `${c.id}->${l.targetId}`
      if (seen.has(key)) continue
      seen.add(key)
      outgoing.get(c.id)?.add(l.targetId)
      incoming.get(l.targetId)?.add(c.id)
      edges.push({ data: { id: key, source: c.id, target: l.targetId } })
    }
  }

  const pageRank = scorePageRank(ids, outgoing, incoming)
  const maxDegree = ids.reduce(
    (max, id) => Math.max(max, (outgoing.get(id)?.size ?? 0) + (incoming.get(id)?.size ?? 0)),
    1
  )
  const maxRank = [...pageRank.values()].reduce((max, rank) => Math.max(max, rank), 1 / Math.max(ids.length, 1))
  const nodes: MapNode[] = bundle.concepts.map((c) => {
    const inDegree = incoming.get(c.id)?.size ?? 0
    const outDegree = outgoing.get(c.id)?.size ?? 0
    const degree = inDegree + outDegree
    const rankScore = pageRank.get(c.id) ?? 0
    const centrality = 0.68 * (rankScore / maxRank) + 0.32 * (degree / maxDegree)
    return {
      id: c.id,
      label: c.title || c.id.split('/').pop() || c.id,
      type: c.type,
      group: groupKey(c.id, c.type),
      inDegree,
      outDegree,
      degree,
      pageRank: rankScore,
      centrality
    }
  })

  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const centralLabelCount = Math.min(18, Math.max(5, Math.ceil(nodes.length * 0.18)))
  const labelIds = new Set(
    [...nodes]
      .sort((a, b) => b.centrality - a.centrality || b.degree - a.degree || a.id.localeCompare(b.id))
      .slice(0, centralLabelCount)
      .map((n) => n.id)
  )
  const components = connectedComponents(nodes, outgoing, incoming)
  const positions = positionComponents(components)

  const nodeElements: ElementDefinition[] = nodes.map((n) => {
    const size = Math.round(14 + Math.min(24, n.centrality * 18 + Math.sqrt(n.degree) * 3))
    const displayLabel = labelIds.has(n.id) || n.degree >= 4 ? n.label : ''
    return {
      data: {
        id: n.id,
        label: n.label,
        displayLabel,
        type: n.type,
        group: n.group,
        color: colorForType(n.type),
        size,
        labelSize: n.centrality > 0.72 ? 12 : 10,
        centrality: n.centrality,
        degree: n.degree,
        inDegree: n.inDegree,
        outDegree: n.outDegree
      },
      position: savedPositions?.[n.id] ?? positions.get(n.id) ?? { x: 0, y: 0 }
    }
  })

  const edgeElements = edges.map((edge) => {
    const source = nodeById.get(edge.data.source as string)
    const target = nodeById.get(edge.data.target as string)
    const edgeCentrality = Math.max(source?.centrality ?? 0, target?.centrality ?? 0)
    return {
      data: {
        ...edge.data,
        width: 0.7 + edgeCentrality * 0.9,
        centrality: edgeCentrality
      }
    }
  })

  return { elements: [...nodeElements, ...edgeElements], nodeCount: nodes.length, edgeCount: edges.length }
}

function scorePageRank(
  ids: string[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
): Map<string, number> {
  if (ids.length === 0) return new Map()
  const n = ids.length
  let scores = new Map(ids.map((id) => [id, 1 / n]))
  for (let i = 0; i < PAGERANK_ITERATIONS; i++) {
    const next = new Map(ids.map((id) => [id, (1 - PAGERANK_DAMPING) / n]))
    let dangling = 0
    for (const id of ids) {
      if ((outgoing.get(id)?.size ?? 0) === 0) dangling += scores.get(id) ?? 0
    }
    const danglingShare = (PAGERANK_DAMPING * dangling) / n
    for (const id of ids) next.set(id, (next.get(id) ?? 0) + danglingShare)
    for (const id of ids) {
      for (const src of incoming.get(id) ?? []) {
        const outCount = outgoing.get(src)?.size ?? 1
        next.set(id, (next.get(id) ?? 0) + (PAGERANK_DAMPING * (scores.get(src) ?? 0)) / outCount)
      }
    }
    scores = next
  }
  return scores
}

function connectedComponents(
  nodes: MapNode[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
): MapNode[][] {
  const nodeById = new Map(nodes.map((n) => [n.id, n]))
  const seen = new Set<string>()
  const components: MapNode[][] = []
  for (const node of nodes) {
    if (seen.has(node.id)) continue
    const queue = [node.id]
    const component: MapNode[] = []
    seen.add(node.id)
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]
      const current = nodeById.get(id)
      if (current) component.push(current)
      const neighbors = new Set([...(outgoing.get(id) ?? []), ...(incoming.get(id) ?? [])])
      for (const next of neighbors) {
        if (seen.has(next)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    components.push(component)
  }
  return components.sort((a, b) => b.length - a.length || centralitySum(b) - centralitySum(a))
}

function positionComponents(components: MapNode[][]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (components.length === 0) return positions
  const mainRadius = componentRadius(components[0].length)
  components.forEach((component, index) => {
    const radius = componentRadius(component.length)
    const offset =
      index === 0
        ? { x: 0, y: 0 }
        : polarToCartesian(
            mainRadius + radius + 260 + Math.floor((index - 1) / 8) * 220,
            ((index - 1) / Math.max(1, components.length - 1)) * Math.PI * 2
          )
    for (const [id, point] of positionComponent(component, radius)) {
      positions.set(id, { x: point.x + offset.x, y: point.y + offset.y })
    }
  })
  return positions
}

function positionComponent(
  component: MapNode[],
  radius: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (component.length === 1) {
    positions.set(component[0].id, { x: 0, y: 0 })
    return positions
  }

  const maxCentrality = component.reduce((max, n) => Math.max(max, n.centrality), 0.0001)
  const grouped = new Map<string, MapNode[]>()
  for (const node of component) grouped.set(node.group, [...(grouped.get(node.group) ?? []), node])
  const groups = [...grouped.entries()]
    .map(([key, nodes]) => ({
      key,
      nodes: nodes.sort((a, b) => b.centrality - a.centrality || a.id.localeCompare(b.id)),
      weight: nodes.reduce((sum, n) => sum + 1 + n.centrality, 0)
    }))
    .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))
  const totalWeight = groups.reduce((sum, g) => sum + g.weight, 0)
  let angleCursor = -Math.PI / 2
  for (const group of groups) {
    const span = (group.weight / totalWeight) * Math.PI * 2
    group.nodes.forEach((node, index) => {
      const centrality = node.centrality / maxCentrality
      const local = (index + 0.5) / group.nodes.length
      const jitter = deterministicJitter(node.id) * Math.min(0.18, span / Math.max(4, group.nodes.length))
      const angle = angleCursor + span * local + jitter
      const ring = 34 + Math.pow(1 - centrality, 1.45) * radius
      positions.set(node.id, polarToCartesian(ring, angle))
    })
    angleCursor += span
  }
  return positions
}

function componentRadius(size: number): number {
  return Math.max(180, Math.sqrt(size) * 92)
}

function centralitySum(nodes: MapNode[]): number {
  return nodes.reduce((sum, node) => sum + node.centrality, 0)
}

function groupKey(id: string, type: string): string {
  const firstSegment = id.split('/')[0]
  return firstSegment && firstSegment !== id ? firstSegment : type
}

function polarToCartesian(radius: number, angle: number): { x: number; y: number } {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

function deterministicJitter(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return hash / 0xffffffff - 0.5
}

function saveGraphSnapshot(bundleId: string, cy: Core): void {
  const positions: Record<string, { x: number; y: number }> = {}
  cy.nodes().forEach((node) => {
    const position = node.position()
    positions[node.id()] = { x: position.x, y: position.y }
  })
  graphSnapshots.set(bundleId, {
    positions,
    pan: cy.pan(),
    zoom: cy.zoom()
  })
  if (graphSnapshots.size > 24) {
    const oldest = graphSnapshots.keys().next().value
    if (oldest) graphSnapshots.delete(oldest)
  }
}

function restoreSnapshotIfPresent(
  cy: Core,
  snapshot: GraphSnapshot | undefined,
  restoredViewportRef: React.MutableRefObject<boolean>,
  pendingRestoreFrameRef: React.MutableRefObject<number | null>
): void {
  if (!snapshot) return
  restoredViewportRef.current = true
  if (pendingRestoreFrameRef.current !== null) window.cancelAnimationFrame(pendingRestoreFrameRef.current)
  pendingRestoreFrameRef.current = restoreGraphViewport(cy, snapshot, pendingRestoreFrameRef)
  window.setTimeout(() => {
    restoredViewportRef.current = false
  }, 0)
}

function restoreGraphViewport(
  cy: Core,
  snapshot: GraphSnapshot,
  pendingRestoreFrameRef: React.MutableRefObject<number | null>
): number {
  return window.requestAnimationFrame(() => {
    cy.zoom(snapshot.zoom)
    cy.pan(snapshot.pan)
    pendingRestoreFrameRef.current = null
  })
}
