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
  rank: number
  order: number
  footprint: { width: number; height: number }
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
const COLUMN_GAP = 230
const ROW_GAP = 36
const COMPONENT_GAP_X = 320
const COMPONENT_GAP_Y = 180
const NODE_MARGIN = 22
const EDGE_CLEARANCE = 38
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
            'source-arrow-shape': 'none',
            'target-arrow-shape': 'triangle-backcurve',
            'arrow-scale': 0.86,
            'curve-style': 'unbundled-bezier',
            'source-endpoint': 'outside-to-node',
            'target-endpoint': 'outside-to-node',
            'control-point-distances': 'data(controlPointDistance)',
            'control-point-weights': 0.5,
            opacity: 0.46
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
        <div className="graph-summary" title="Directed Layout reduces crossings and reserves room for labels">
          Directed Layout
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
      if (l.targetId === c.id) continue
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
    const label = c.title || c.id.split('/').pop() || c.id
    const size = nodeSize(centrality, degree)
    return {
      id: c.id,
      label,
      type: c.type,
      group: groupKey(c.id, c.type),
      inDegree,
      outDegree,
      degree,
      pageRank: rankScore,
      centrality,
      rank: 0,
      order: 0,
      footprint: nodeFootprint(label, size)
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
  const positions = directedReadableLayout(nodes, outgoing, incoming)

  const nodeElements: ElementDefinition[] = nodes.map((n) => {
    const size = nodeSize(n.centrality, n.degree)
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
    const sourceId = edge.data.source as string
    const targetId = edge.data.target as string
    const reciprocal = seen.has(`${targetId}->${sourceId}`)
    const rankDelta = (target?.rank ?? 0) - (source?.rank ?? 0)
    const controlPointDistance = reciprocal
      ? 44
      : rankDelta === 0
        ? (source?.order ?? 0) <= (target?.order ?? 0)
          ? 56
          : -56
        : rankDelta < 0
          ? -34
          : Math.abs(rankDelta) > 1
            ? 22
            : 10
    return {
      data: {
        ...edge.data,
        width: 0.9 + edgeCentrality * 1.05,
        controlPointDistance,
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

function centralitySum(nodes: MapNode[]): number {
  return nodes.reduce((sum, node) => sum + node.centrality, 0)
}

function groupKey(id: string, type: string): string {
  return type || id.split('/')[0] || 'Concept'
}

function directedReadableLayout(
  nodes: MapNode[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
): Map<string, { x: number; y: number }> {
  nodeOrderCache.clear()
  const components = connectedComponents(nodes, outgoing, incoming)
  const laidOut = components.map((component) => {
    assignRanks(component, outgoing)
    orderRanks(component, outgoing, incoming)
    return positionRanks(component, outgoing)
  })
  return packComponents(laidOut)
}

function assignRanks(component: MapNode[], outgoing: Map<string, Set<string>>): void {
  const nodeIds = new Set(component.map((n) => n.id))
  const sccs = stronglyConnectedComponents(component, outgoing)
  const sccByNode = new Map<string, number>()
  sccs.forEach((scc, index) => scc.forEach((id) => sccByNode.set(id, index)))

  const dagOutgoing = new Map<number, Set<number>>()
  const dagIncoming = new Map<number, Set<number>>()
  sccs.forEach((_, index) => {
    dagOutgoing.set(index, new Set())
    dagIncoming.set(index, new Set())
  })
  for (const source of nodeIds) {
    const sourceScc = sccByNode.get(source)
    if (sourceScc === undefined) continue
    for (const target of outgoing.get(source) ?? []) {
      if (!nodeIds.has(target)) continue
      const targetScc = sccByNode.get(target)
      if (targetScc === undefined || targetScc === sourceScc) continue
      dagOutgoing.get(sourceScc)?.add(targetScc)
      dagIncoming.get(targetScc)?.add(sourceScc)
    }
  }

  const indegree = new Map<number, number>()
  sccs.forEach((_, index) => indegree.set(index, dagIncoming.get(index)?.size ?? 0))
  const queue = [...indegree.entries()]
    .filter(([, count]) => count === 0)
    .map(([id]) => id)
    .sort((a, b) => sccLabel(sccs[a], component).localeCompare(sccLabel(sccs[b], component)))
  const sccRank = new Map<number, number>()
  sccs.forEach((_, index) => sccRank.set(index, 0))
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    for (const next of dagOutgoing.get(current) ?? []) {
      sccRank.set(next, Math.max(sccRank.get(next) ?? 0, (sccRank.get(current) ?? 0) + 1))
      const nextIndegree = (indegree.get(next) ?? 0) - 1
      indegree.set(next, nextIndegree)
      if (nextIndegree === 0) queue.push(next)
    }
  }

  for (const node of component) node.rank = sccRank.get(sccByNode.get(node.id) ?? 0) ?? 0

  const rankCount = new Set(component.map((n) => n.rank)).size
  if (rankCount === 1 && component.length > 5) {
    const columnCount = Math.max(2, Math.ceil(Math.sqrt(component.length * 0.75)))
    ;[...component]
      .sort((a, b) => a.group.localeCompare(b.group) || b.outDegree - a.outDegree || a.id.localeCompare(b.id))
      .forEach((node, index) => {
        node.rank = Math.floor((index / component.length) * columnCount)
      })
  }
}

function stronglyConnectedComponents(
  component: MapNode[],
  outgoing: Map<string, Set<string>>
): string[][] {
  const nodeIds = new Set(component.map((n) => n.id))
  const indexById = new Map<string, number>()
  const lowlink = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const result: string[][] = []
  let index = 0

  const visit = (id: string): void => {
    indexById.set(id, index)
    lowlink.set(id, index)
    index += 1
    stack.push(id)
    onStack.add(id)

    for (const target of outgoing.get(id) ?? []) {
      if (!nodeIds.has(target)) continue
      if (!indexById.has(target)) {
        visit(target)
        lowlink.set(id, Math.min(lowlink.get(id) ?? 0, lowlink.get(target) ?? 0))
      } else if (onStack.has(target)) {
        lowlink.set(id, Math.min(lowlink.get(id) ?? 0, indexById.get(target) ?? 0))
      }
    }

    if (lowlink.get(id) !== indexById.get(id)) return
    const scc: string[] = []
    let current: string | undefined
    do {
      current = stack.pop()
      if (!current) break
      onStack.delete(current)
      scc.push(current)
    } while (current !== id)
    result.push(scc)
  }

  component
    .map((n) => n.id)
    .sort()
    .forEach((id) => {
      if (!indexById.has(id)) visit(id)
    })
  return result
}

function orderRanks(
  component: MapNode[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
): void {
  const ranks = ranksOf(component)
  const typeOrder = new Map([...new Set(component.map((n) => n.group).sort())].map((type, index) => [type, index]))
  for (const rank of ranks.values()) {
    rank.sort((a, b) => initialNodeOrder(a, b, typeOrder))
    assignOrder(rank)
  }

  for (let sweep = 0; sweep < 8; sweep++) {
    const rankIds = [...ranks.keys()].sort((a, b) => a - b)
    for (const rankId of rankIds.slice(1)) {
      const rank = ranks.get(rankId)
      if (!rank) continue
      sortRankByNeighborMedian(rank, incoming, typeOrder)
      assignOrder(rank)
    }
    for (const rankId of rankIds.slice(0, -1).reverse()) {
      const rank = ranks.get(rankId)
      if (!rank) continue
      sortRankByNeighborMedian(rank, outgoing, typeOrder)
      assignOrder(rank)
    }
  }
}

function positionRanks(
  component: MapNode[],
  outgoing: Map<string, Set<string>>
): {
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
} {
  const ranks = ranksOf(component)
  const rankIds = [...ranks.keys()].sort((a, b) => a - b)
  const orderedRanks = new Map(
    rankIds.map((rankId) => [
      rankId,
      [...(ranks.get(rankId) ?? [])].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    ])
  )
  const columnWidths = rankIds.map((rankId) =>
    (orderedRanks.get(rankId) ?? []).reduce((max, node) => Math.max(max, node.footprint.width), 90)
  )
  const rankHeights = rankIds.map((rankId) =>
    (orderedRanks.get(rankId) ?? []).reduce(
      (sum, node, index) => sum + node.footprint.height + (index === 0 ? 0 : ROW_GAP),
      0
    )
  )
  const height = rankHeights.reduce((max, rankHeight) => Math.max(max, rankHeight), 140)
  const xByRank = new Map<number, number>()
  let cursor = 0
  rankIds.forEach((rankId, index) => {
    if (index === 0) cursor = columnWidths[index] / 2
    else cursor += columnWidths[index - 1] / 2 + COLUMN_GAP + columnWidths[index] / 2
    xByRank.set(rankId, cursor)
  })

  const positions = new Map<string, { x: number; y: number }>()
  rankIds.forEach((rankId, rankIndex) => {
    const rank = orderedRanks.get(rankId) ?? []
    const rankHeight = rankHeights[rankIndex]
    let y = -rankHeight / 2
    for (const node of rank) {
      y += node.footprint.height / 2
      positions.set(node.id, { x: xByRank.get(rankId) ?? 0, y })
      y += node.footprint.height / 2 + ROW_GAP
    }
  })

  const relaxed = relaxComponentPositions(component, positions, outgoing)
  const bounds = footprintBoundsOf(component, relaxed)
  return { positions: relaxed, width: Math.max(140, bounds.width), height: Math.max(height, bounds.height) }
}

function relaxComponentPositions(
  component: MapNode[],
  initialPositions: Map<string, { x: number; y: number }>,
  outgoing: Map<string, Set<string>>
): Map<string, { x: number; y: number }> {
  if (component.length < 3) return initialPositions

  const positions = new Map(
    [...initialPositions.entries()].map(([id, point]) => [id, { x: point.x, y: point.y }])
  )
  const initial = new Map(
    [...initialPositions.entries()].map(([id, point]) => [id, { x: point.x, y: point.y }])
  )
  const nodeById = new Map(component.map((node) => [node.id, node]))
  const nodeIds = new Set(component.map((node) => node.id))
  const edges: Array<{ source: string; target: string }> = []

  for (const source of component) {
    for (const targetId of outgoing.get(source.id) ?? []) {
      if (nodeIds.has(targetId) && targetId !== source.id) edges.push({ source: source.id, target: targetId })
    }
  }

  const groupY = new Map<string, number>()
  const groupCounts = new Map<string, number>()
  for (const node of component) {
    const p = positions.get(node.id)
    if (!p) continue
    groupY.set(node.group, (groupY.get(node.group) ?? 0) + p.y)
    groupCounts.set(node.group, (groupCounts.get(node.group) ?? 0) + 1)
  }
  for (const [group, total] of groupY) groupY.set(group, total / (groupCounts.get(group) ?? 1))

  const iterations = component.length > 180 ? 52 : component.length > 80 ? 76 : 112
  const includeNodeEdgeRepulsion = component.length * Math.max(edges.length, 1) <= 16000
  const includeAllPairsRepulsion = component.length <= 420
  const maxXShift = new Set(component.map((n) => n.rank)).size === 1 ? 150 : 96

  for (let iteration = 0; iteration < iterations; iteration++) {
    const forces = new Map(component.map((node) => [node.id, { x: 0, y: 0 }]))
    const cooling = 1 - iteration / iterations

    for (const node of component) {
      const p = positions.get(node.id)
      const start = initial.get(node.id)
      const force = forces.get(node.id)
      if (!p || !start || !force) continue
      force.x += (start.x - p.x) * 0.07
      force.y += (start.y - p.y) * 0.012
      force.y += ((groupY.get(node.group) ?? p.y) - p.y) * 0.01
    }

    for (const edge of edges) {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      const sp = positions.get(edge.source)
      const tp = positions.get(edge.target)
      const sf = forces.get(edge.source)
      const tf = forces.get(edge.target)
      if (!source || !target || !sp || !tp || !sf || !tf) continue

      const dx = tp.x - sp.x
      const dy = tp.y - sp.y
      const distance = Math.max(1, Math.hypot(dx, dy))
      const rankSpan = Math.max(1, Math.abs(target.rank - source.rank))
      const ideal = 190 + Math.min(2, rankSpan - 1) * 52
      const pull = (distance - ideal) * 0.012
      const ux = dx / distance
      const uy = dy / distance
      sf.x += pull * ux
      sf.y += pull * uy
      tf.x -= pull * ux
      tf.y -= pull * uy

      if (target.rank > source.rank) {
        const minFlow = 150 + (target.rank - source.rank - 1) * 68
        if (dx < minFlow) {
          const push = (minFlow - dx) * 0.026
          sf.x -= push
          tf.x += push
        }
      }
    }

    if (includeAllPairsRepulsion) {
      for (let i = 0; i < component.length; i++) {
        for (let j = i + 1; j < component.length; j++) {
          applyNodeRepulsion(component[i], component[j], positions, forces)
        }
      }
    } else {
      for (const rank of ranksOf(component).values()) {
        const sorted = [...rank].sort(
          (a, b) => (positions.get(a.id)?.y ?? 0) - (positions.get(b.id)?.y ?? 0)
        )
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < Math.min(sorted.length, i + 7); j++) {
            applyNodeRepulsion(sorted[i], sorted[j], positions, forces)
          }
        }
      }
    }

    if (includeNodeEdgeRepulsion) {
      for (const edge of edges) {
        const sp = positions.get(edge.source)
        const tp = positions.get(edge.target)
        if (!sp || !tp) continue
        for (const node of component) {
          if (node.id === edge.source || node.id === edge.target) continue
          const p = positions.get(node.id)
          const force = forces.get(node.id)
          if (!p || !force) continue
          const closest = closestPointOnSegment(p, sp, tp)
          if (closest.t < 0.12 || closest.t > 0.88) continue
          const distance = Math.max(1, Math.hypot(p.x - closest.x, p.y - closest.y))
          const clearance = EDGE_CLEARANCE + Math.min(28, node.footprint.height / 3)
          if (distance >= clearance) continue
          const push = (clearance - distance) * 0.075
          force.x += ((p.x - closest.x) / distance) * push
          force.y += ((p.y - closest.y) / distance) * push
        }
      }
    }

    const maxStep = 14 * cooling + 2.5
    for (const node of component) {
      const p = positions.get(node.id)
      const start = initial.get(node.id)
      const force = forces.get(node.id)
      if (!p || !start || !force) continue
      const step = clampVector(force, maxStep)
      positions.set(node.id, {
        x: start.x + clamp(p.x + step.x - start.x, -maxXShift, maxXShift),
        y: p.y + step.y
      })
    }
  }

  return positions
}

function applyNodeRepulsion(
  a: MapNode,
  b: MapNode,
  positions: Map<string, { x: number; y: number }>,
  forces: Map<string, { x: number; y: number }>
): void {
  const ap = positions.get(a.id)
  const bp = positions.get(b.id)
  const af = forces.get(a.id)
  const bf = forces.get(b.id)
  if (!ap || !bp || !af || !bf) return

  const dx = bp.x - ap.x || 0.01
  const dy = bp.y - ap.y || 0.01
  const overlapX = (a.footprint.width + b.footprint.width) / 2 + NODE_MARGIN - Math.abs(dx)
  const overlapY = (a.footprint.height + b.footprint.height) / 2 + NODE_MARGIN - Math.abs(dy)

  if (overlapX > 0 && overlapY > 0) {
    const sameRank = a.rank === b.rank
    if (sameRank || overlapY <= overlapX) {
      const push = Math.sign(dy) * overlapY * 0.26
      af.y -= push
      bf.y += push
    } else {
      const push = Math.sign(dx) * overlapX * 0.2
      af.x -= push
      bf.x += push
    }
    return
  }

  const distance = Math.max(1, Math.hypot(dx, dy))
  const minDistance = 72
  if (distance >= minDistance) return
  const push = ((minDistance - distance) / minDistance) * 2.4
  af.x -= (dx / distance) * push
  af.y -= (dy / distance) * push
  bf.x += (dx / distance) * push
  bf.y += (dy / distance) * push
}

function packComponents(
  components: Array<{ positions: Map<string, { x: number; y: number }>; width: number; height: number }>
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()
  if (components.length === 0) return positions
  const totalArea = components.reduce((sum, c) => sum + (c.width + COMPONENT_GAP_X) * (c.height + COMPONENT_GAP_Y), 0)
  const targetRowWidth = Math.max(900, Math.sqrt(totalArea) * 1.35)
  let rowX = 0
  let rowY = 0
  let rowHeight = 0
  for (const component of components) {
    if (rowX > 0 && rowX + component.width > targetRowWidth) {
      rowX = 0
      rowY += rowHeight + COMPONENT_GAP_Y
      rowHeight = 0
    }
    for (const [id, point] of component.positions) {
      positions.set(id, { x: point.x + rowX, y: point.y + rowY + component.height / 2 })
    }
    rowX += component.width + COMPONENT_GAP_X
    rowHeight = Math.max(rowHeight, component.height)
  }

  const bounds = boundsOf([...positions.values()])
  for (const [id, point] of positions) {
    positions.set(id, { x: point.x - bounds.centerX, y: point.y - bounds.centerY })
  }
  return positions
}

function ranksOf(nodes: MapNode[]): Map<number, MapNode[]> {
  const ranks = new Map<number, MapNode[]>()
  for (const node of nodes) ranks.set(node.rank, [...(ranks.get(node.rank) ?? []), node])
  return ranks
}

function assignOrder(nodes: MapNode[]): void {
  nodes.forEach((node, index) => {
    node.order = index
    nodeOrderCache.set(node.id, index)
  })
}

function sortRankByNeighborMedian(
  rank: MapNode[],
  neighborMap: Map<string, Set<string>>,
  typeOrder: Map<string, number>
): void {
  const medians = new Map(rank.map((node) => [node.id, medianNeighborOrder(node, neighborMap)]))
  rank.sort((a, b) => {
    const byMedian = (medians.get(a.id) ?? a.order) - (medians.get(b.id) ?? b.order)
    return byMedian || initialNodeOrder(a, b, typeOrder)
  })
}

function medianNeighborOrder(node: MapNode, neighborMap: Map<string, Set<string>>): number {
  const orders = [...(neighborMap.get(node.id) ?? [])]
    .map((id) => nodeOrderCache.get(id))
    .filter((order): order is number => order !== undefined)
    .sort((a, b) => a - b)
  if (orders.length === 0) return node.order
  const mid = Math.floor(orders.length / 2)
  return orders.length % 2 === 0 ? (orders[mid - 1] + orders[mid]) / 2 : orders[mid]
}

const nodeOrderCache = new Map<string, number>()

function initialNodeOrder(a: MapNode, b: MapNode, typeOrder: Map<string, number>): number {
  return (
    (typeOrder.get(a.group) ?? 0) - (typeOrder.get(b.group) ?? 0) ||
    b.degree - a.degree ||
    a.label.localeCompare(b.label) ||
    a.id.localeCompare(b.id)
  )
}

function nodeSize(centrality: number, degree: number): number {
  return Math.round(13 + Math.min(14, centrality * 9 + Math.sqrt(degree) * 2.4))
}

function nodeFootprint(label: string, size: number): { width: number; height: number } {
  const labelWidth = Math.min(142, Math.max(42, label.length * 7.2))
  return {
    width: Math.max(size + 28, labelWidth + 26),
    height: size + 42
  }
}

function boundsOf(points: Array<{ x: number; y: number }>): {
  centerX: number
  centerY: number
} {
  if (points.length === 0) return { centerX: 0, centerY: 0 }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  }
}

function footprintBoundsOf(
  nodes: MapNode[],
  positions: Map<string, { x: number; y: number }>
): { width: number; height: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const p = positions.get(node.id)
    if (!p) continue
    minX = Math.min(minX, p.x - node.footprint.width / 2)
    maxX = Math.max(maxX, p.x + node.footprint.width / 2)
    minY = Math.min(minY, p.y - node.footprint.height / 2)
    maxY = Math.max(maxY, p.y + node.footprint.height / 2)
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { width: 140, height: 140 }
  }
  return { width: maxX - minX, height: maxY - minY }
}

function closestPointOnSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
): { x: number; y: number; t: number } {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return { x: start.x, y: start.y, t: 0 }
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  return { x: start.x + dx * t, y: start.y + dy * t, t }
}

function clampVector(vector: { x: number; y: number }, maxLength: number): { x: number; y: number } {
  const length = Math.hypot(vector.x, vector.y)
  if (length <= maxLength || length === 0) return vector
  return { x: (vector.x / length) * maxLength, y: (vector.y / length) * maxLength }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function sccLabel(ids: string[], component: MapNode[]): string {
  const byId = new Map(component.map((n) => [n.id, n]))
  return ids
    .map((id) => byId.get(id)?.label ?? id)
    .sort()
    .join('/')
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
