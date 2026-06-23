import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { Core, ElementDefinition, LayoutOptions } from 'cytoscape'
import fcose from 'cytoscape-fcose'
import elk from 'cytoscape-elk'
import layoutUtilities from 'cytoscape-layout-utilities'
import type { Bundle } from '@shared/okf/types'
import { colorForType } from '../lib/colors'
import { useStore } from '../store'

// Register layout extensions once. fcose may already be present (mermaid pulls it
// in transitively), so registration is best-effort and tolerant of duplicates.
registerExtensions()

type LayoutMode = 'layered' | 'constellation'

interface Props {
  bundle: Bundle
  activeConceptId: string | null
  onNavigate: (conceptId: string) => void
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
const snapshotKey = (bundleId: string, mode: LayoutMode): string => `${bundleId}::${mode}`

export function GraphView({ bundle, activeConceptId, onNavigate }: Props): JSX.Element {
  const theme = useStore((s) => s.theme)
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const onNavigateRef = useRef(onNavigate)
  const renderedBundleIdRef = useRef(bundle.id)
  const modeRef = useRef<LayoutMode>('constellation')
  const skipBundleEffectRef = useRef(true)
  const skipModeEffectRef = useRef(true)
  const previousActiveConceptIdRef = useRef(activeConceptId)
  const [mode, setMode] = useState<LayoutMode>('constellation')
  const [typeFilter, setTypeFilter] = useState('')
  const [query, setQuery] = useState('')
  const [showEdges, setShowEdges] = useState(true)

  const palette = useMemo(() => themePalette(theme), [theme])
  const map = useMemo<KnowledgeMap>(() => buildKnowledgeMap(bundle), [bundle])

  useEffect(() => {
    onNavigateRef.current = onNavigate
  }, [onNavigate])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  // Create the cytoscape instance once (re-created on theme change so colors apply).
  useEffect(() => {
    if (!containerRef.current) return
    renderedBundleIdRef.current = bundle.id
    const cy = cytoscape({
      container: containerRef.current,
      elements: map.elements,
      style: graphStylesheet(palette),
      layout: { name: 'preset', fit: false } as LayoutOptions,
      wheelSensitivity: 0.2,
      minZoom: 0.04,
      maxZoom: 3
    })
    if (import.meta.env.DEV) (window as unknown as { __okfCy?: Core }).__okfCy = cy

    applyModeAndLayout(cy, modeRef.current, map, bundle.id)

    cy.on('tap', 'node', (evt) => onNavigateRef.current(evt.target.id()))
    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target
      node.addClass('hover')
      node.closedNeighborhood().addClass('lit')
      cy.elements().not(node.closedNeighborhood()).addClass('faded')
    })
    cy.on('mouseout', 'node', () => cy.elements().removeClass('hover lit faded'))

    let saveTimer: number | null = null
    const scheduleSave = (): void => {
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => {
        saveGraphSnapshot(renderedBundleIdRef.current, modeRef.current, cy)
        saveTimer = null
      }, 120)
    }
    cy.on('free', 'node', scheduleSave)
    cy.on('pan zoom', scheduleSave)
    cyRef.current = cy
    return () => {
      if (saveTimer !== null) window.clearTimeout(saveTimer)
      saveGraphSnapshot(renderedBundleIdRef.current, modeRef.current, cy)
      const raf = cy.scratch('_okfRaf') as number | undefined
      if (raf !== undefined) cancelAnimationFrame(raf)
      ;(cy.scratch('_okfLayout') as cytoscape.Layouts | undefined)?.stop()
      cy.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette])

  // Re-layout when the bundle changes (live sync / switching bundle).
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    if (skipBundleEffectRef.current) {
      skipBundleEffectRef.current = false
      return
    }
    saveGraphSnapshot(renderedBundleIdRef.current, modeRef.current, cy)
    renderedBundleIdRef.current = bundle.id
    cy.json({ elements: map.elements })
    applyModeAndLayout(cy, modeRef.current, map, bundle.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle.id, map])

  // Re-layout when the layout mode changes.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    if (skipModeEffectRef.current) {
      skipModeEffectRef.current = false
      return
    }
    applyModeAndLayout(cy, mode, map, renderedBundleIdRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Edge visibility toggle.
  useEffect(() => {
    cyRef.current?.edges().toggleClass('hidden', !showEdges)
  }, [showEdges])

  // Highlight active concept + type filter + search matches.
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
      const q = query.trim().toLowerCase()
      if (q) {
        cy.nodes().forEach((n) => {
          if (`${n.data('label')} ${n.id()} ${n.data('type')}`.toLowerCase().includes(q)) n.addClass('match')
        })
      }
      if (activeConceptId) {
        const node = cy.getElementById(activeConceptId)
        if (node.nonempty()) node.addClass('active')
      }
    })
  }, [typeFilter, query, activeConceptId, map])

  // Center when navigation changes the active concept.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const previous = previousActiveConceptIdRef.current
    previousActiveConceptIdRef.current = activeConceptId
    if (!activeConceptId || activeConceptId === previous) return
    const node = cy.getElementById(activeConceptId)
    if (node.nonempty()) cy.animate({ center: { eles: node } }, { duration: 220 })
  }, [activeConceptId])

  return (
    <div className="graph-view">
      <div className="graph-controls">
        <div className="graph-mode" role="group" aria-label="Layout mode">
          <button
            className={`graph-toggle ${mode === 'layered' ? 'on' : ''}`}
            onClick={() => setMode('layered')}
            title="Layered: directed top-down hierarchy, minimal edge crossings"
          >
            Layered
          </button>
          <button
            className={`graph-toggle ${mode === 'constellation' ? 'on' : ''}`}
            onClick={() => setMode('constellation')}
            title="Constellation: organic force-directed map, labels on key concepts"
          >
            Constellation
          </button>
        </div>
        <div className="graph-summary">
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
          className={`graph-toggle ${showEdges ? 'on' : ''}`}
          onClick={() => setShowEdges((v) => !v)}
          title="Show or hide graph edges"
        >
          Edges
        </button>
        <button
          className="btn"
          onClick={() => {
            const cy = cyRef.current
            if (!cy) return
            graphSnapshots.delete(snapshotKey(renderedBundleIdRef.current, modeRef.current))
            applyModeAndLayout(cy, modeRef.current, map, renderedBundleIdRef.current)
          }}
          title="Recompute the layout from scratch"
        >
          Relayout
        </button>
        <button
          className="btn"
          onClick={() => {
            const cy = cyRef.current
            if (cy) cy.animate({ fit: { eles: cy.elements(), padding: 50 } }, { duration: 220 })
          }}
        >
          Fit
        </button>
      </div>
      <div className="graph-canvas" ref={containerRef} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout orchestration
// ---------------------------------------------------------------------------

function applyModeAndLayout(cy: Core, mode: LayoutMode, map: KnowledgeMap, bundleId: string): void {
  cy.batch(() => {
    const constellation = mode === 'constellation'
    cy.nodes().toggleClass('constellation', constellation)
    cy.nodes().forEach((n) => {
      n.toggleClass('show-label', constellation && !!n.data('showLabel'))
    })
    cy.edges().toggleClass('taxi-edge', mode === 'layered')
  })

  const snapshot = graphSnapshots.get(snapshotKey(bundleId, mode))
  if (snapshot && Object.keys(snapshot.positions).length >= cy.nodes().length) {
    cy.nodes().forEach((n) => {
      const p = snapshot.positions[n.id()]
      if (p) n.position(p)
    })
    cy.layout({ name: 'preset', fit: false } as LayoutOptions).run()
    requestAnimationFrame(() => {
      if (cy.destroyed()) return
      cy.zoom(snapshot.zoom)
      cy.pan(snapshot.pan)
    })
    cy.scratch('_okfLaidOut', true)
    return
  }

  // Mark "not yet laid out" so a premature unmount (e.g. React StrictMode's
  // mount→unmount→mount in dev) cannot persist an all-at-origin snapshot and
  // poison the remount. Stop any prior in-flight layout first.
  cy.scratch('_okfLaidOut', false)
  ;(cy.scratch('_okfLayout') as cytoscape.Layouts | undefined)?.stop()
  const prevRaf = cy.scratch('_okfRaf') as number | undefined
  if (prevRaf !== undefined) cancelAnimationFrame(prevRaf)
  const layout = cy.layout(mode === 'layered' ? elkOptions(map) : fcoseOptions(map))
  cy.scratch('_okfLayout', layout)
  const finish = (): void => {
    if (cy.destroyed()) return
    cy.fit(undefined, 50)
    cy.scratch('_okfLaidOut', true)
    saveGraphSnapshot(bundleId, mode, cy)
  }
  layout.one('layoutstop', () => {
    if (cy.destroyed()) return
    if (mode === 'constellation') {
      // Defer one frame so label bounding boxes are measured, then separate on
      // the label-inclusive boxes to guarantee no overlapping labels.
      requestAnimationFrame(() => {
        if (cy.destroyed()) return
        removeOverlaps(cy)
        finish()
      })
    } else {
      finish()
    }
  })
  // Defer the run one frame. If the instance is torn down in the same tick
  // (StrictMode double-mount, or the user leaving the view immediately), the
  // cleanup cancels this and ELK never writes into a destroyed core.
  const raf = requestAnimationFrame(() => {
    cy.scratch('_okfRaf', undefined)
    if (cy.destroyed()) return
    layout.run()
  })
  cy.scratch('_okfRaf', raf)
}

function elkOptions(map: KnowledgeMap): LayoutOptions {
  const between = map.nodeCount > 60 ? 56 : 76
  return {
    name: 'elk',
    fit: false,
    padding: 50,
    nodeDimensionsIncludeLabels: true,
    elk: {
      algorithm: 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': 42,
      'elk.layered.spacing.nodeNodeBetweenLayers': between,
      'elk.layered.spacing.edgeNodeBetweenLayers': 24,
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.crossingMinimization.semiInteractive': true,
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.nodePlacement.favorStraightEdges': true,
      'elk.edgeRouting': 'ORTHOGONAL'
    }
  } as unknown as LayoutOptions
}

function fcoseOptions(map: KnowledgeMap): LayoutOptions {
  const n = map.nodeCount
  const spread = n <= 12 ? 1.25 : n <= 30 ? 1.1 : n <= 60 ? 1 : 0.85
  return {
    name: 'fcose',
    quality: 'proof',
    randomize: true,
    animate: false,
    fit: false,
    padding: 50,
    nodeDimensionsIncludeLabels: true,
    uniformNodeDimensions: false,
    packComponents: true,
    tile: true,
    tilingPaddingVertical: 16,
    tilingPaddingHorizontal: 16,
    nodeSeparation: 90 * spread,
    idealEdgeLength: () => 110 * spread,
    edgeElasticity: () => 0.5,
    nodeRepulsion: () => 9000,
    gravity: 0.4,
    gravityRange: 2.6,
    numIter: 2500
  } as unknown as LayoutOptions
}

// Deterministic overlap removal on label-inclusive bounding boxes. Used after the
// force ('constellation') layout to guarantee no overlapping nodes or labels.
function removeOverlaps(cy: Core, margin = 12, maxIter = 160): void {
  const nodes = cy.nodes()
  if (nodes.length < 2) return
  for (let iter = 0; iter < maxIter; iter++) {
    // Separate on the label-inclusive bounding boxes, but apply the resulting
    // displacement to each node's *position*. The two differ whenever the label
    // sits outside the node body (constellation labels sit below the dot), so we
    // track the box-center delta and add it to the position, preserving the
    // node↔label offset.
    const half = margin / 2
    const boxes = nodes.map((n) => {
      const bb = n.boundingBox({ includeLabels: true, includeNodes: true } as cytoscape.BoundingBoxOptions)
      const p = n.position()
      return {
        n,
        px: p.x,
        py: p.y,
        cx: (bb.x1 + bb.x2) / 2,
        cy: (bb.y1 + bb.y2) / 2,
        hw: bb.w / 2 + half,
        hh: bb.h / 2 + half
      }
    })
    let moved = false
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const b = boxes[j]
        const ox = a.hw + b.hw - Math.abs(a.cx - b.cx)
        const oy = a.hh + b.hh - Math.abs(a.cy - b.cy)
        if (ox <= 0 || oy <= 0) continue
        moved = true
        if (ox < oy) {
          const push = (ox / 2 + 0.5) * (a.cx <= b.cx ? -1 : 1)
          a.cx += push
          a.px += push
          b.cx -= push
          b.px -= push
        } else {
          const push = (oy / 2 + 0.5) * (a.cy <= b.cy ? -1 : 1)
          a.cy += push
          a.py += push
          b.cy -= push
          b.py -= push
        }
      }
    }
    cy.batch(() => boxes.forEach((box) => box.n.position({ x: box.px, y: box.py })))
    if (!moved) break
  }
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

interface Palette {
  labelColor: string
  pillBg: string
  edgeColor: string
  activeBorder: string
  labelHalo: string
}

function themePalette(theme: 'light' | 'dark'): Palette {
  return theme === 'light'
    ? { labelColor: '#0f172a', pillBg: '#ffffff', edgeColor: '#94a3b8', activeBorder: '#1e293b', labelHalo: '#ffffff' }
    : { labelColor: '#e6edf3', pillBg: '#161b22', edgeColor: '#586274', activeBorder: '#ffffff', labelHalo: '#0d1117' }
}

function graphStylesheet(palette: Palette): cytoscape.StylesheetStyle[] {
  return [
    // Base = layered pill: a labeled rounded box sized to its (wrapped) label.
    {
      selector: 'node',
      style: {
        shape: 'round-rectangle',
        'background-color': palette.pillBg,
        'background-opacity': 0.92,
        'border-color': 'data(color)',
        'border-width': 'data(border)',
        label: 'data(label)',
        color: palette.labelColor,
        'font-size': 'data(fontSize)',
        'font-weight': 600,
        'text-valign': 'center',
        'text-halign': 'center',
        'text-wrap': 'wrap',
        'text-max-width': '128px',
        width: 'label',
        height: 'label',
        padding: '9px'
      }
    },
    // Constellation node: a dot sized by importance, label hidden by default.
    {
      selector: 'node.constellation',
      style: {
        shape: 'ellipse',
        label: '',
        width: 'data(dotSize)',
        height: 'data(dotSize)',
        padding: '0px',
        'background-color': 'data(color)',
        'background-opacity': 0.95,
        'border-width': 1,
        'border-color': palette.labelHalo
      }
    },
    // Constellation: show label only on key concepts, set below the dot.
    {
      selector: 'node.constellation.show-label',
      style: {
        label: 'data(label)',
        color: palette.labelColor,
        'font-size': 11,
        'font-weight': 700,
        'text-valign': 'bottom',
        'text-halign': 'center',
        'text-margin-y': 5,
        'text-wrap': 'wrap',
        'text-max-width': '120px',
        'text-background-color': palette.labelHalo,
        'text-background-opacity': 0.78,
        'text-background-padding': '2px'
      }
    },
    {
      selector: 'edge',
      style: {
        width: 'data(width)',
        'line-color': palette.edgeColor,
        'target-arrow-color': palette.edgeColor,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.8,
        'curve-style': 'bezier',
        opacity: 0.42
      }
    },
    // Layered edges: orthogonal "circuit board" routing matching the top-down flow.
    {
      selector: 'edge.taxi-edge',
      style: {
        'curve-style': 'taxi',
        'taxi-direction': 'downward',
        'taxi-turn': '24px',
        'taxi-turn-min-distance': '8px'
      }
    },
    { selector: 'edge.hidden', style: { display: 'none' } },
    { selector: 'node.dim', style: { opacity: 0.12 } },
    { selector: 'edge.dim', style: { opacity: 0.04 } },
    { selector: 'node.faded', style: { opacity: 0.16 } },
    { selector: 'edge.faded', style: { opacity: 0.05 } },
    { selector: 'node.lit', style: { 'z-index': 20 } },
    {
      selector: 'node.lit.constellation',
      style: { label: 'data(label)', 'text-valign': 'bottom', 'text-margin-y': 5 }
    },
    {
      selector: 'edge.lit',
      style: {
        'line-color': 'data(color)',
        'target-arrow-color': 'data(color)',
        opacity: 0.95,
        width: 2.4,
        'z-index': 15
      }
    },
    { selector: 'node.hover', style: { 'border-width': 3, 'z-index': 30 } },
    { selector: 'node.active', style: { 'border-width': 4, 'border-color': palette.activeBorder, 'z-index': 40 } },
    { selector: 'node.constellation.active', style: { 'background-color': palette.activeBorder } },
    { selector: 'node.match', style: { 'border-width': 3, 'border-color': '#ffd43b', 'z-index': 35 } }
  ]
}

// ---------------------------------------------------------------------------
// Graph model
// ---------------------------------------------------------------------------

function buildKnowledgeMap(bundle: Bundle): KnowledgeMap {
  const ids = bundle.concepts.map((c) => c.id)
  const idSet = new Set(ids)
  const outgoing = new Map<string, Set<string>>()
  const incoming = new Map<string, Set<string>>()
  for (const id of ids) {
    outgoing.set(id, new Set())
    incoming.set(id, new Set())
  }

  const edgeKeys = new Set<string>()
  const rawEdges: Array<{ id: string; source: string; target: string }> = []
  const typeById = new Map(bundle.concepts.map((c) => [c.id, c.type]))
  for (const c of bundle.concepts) {
    for (const l of c.outgoing) {
      if (!l.targetId || !idSet.has(l.targetId)) continue
      if (l.targetId === c.id) continue
      const key = `${c.id}->${l.targetId}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      outgoing.get(c.id)?.add(l.targetId)
      incoming.get(l.targetId)?.add(c.id)
      rawEdges.push({ id: key, source: c.id, target: l.targetId })
    }
  }

  const pageRank = scorePageRank(ids, outgoing, incoming)
  const maxDegree = ids.reduce(
    (max, id) => Math.max(max, (outgoing.get(id)?.size ?? 0) + (incoming.get(id)?.size ?? 0)),
    1
  )
  const maxRank = [...pageRank.values()].reduce((max, r) => Math.max(max, r), 1 / Math.max(ids.length, 1))

  const centralityById = new Map<string, number>()
  const baseNodes = bundle.concepts.map((c) => {
    const inDegree = incoming.get(c.id)?.size ?? 0
    const outDegree = outgoing.get(c.id)?.size ?? 0
    const degree = inDegree + outDegree
    const centrality = 0.68 * ((pageRank.get(c.id) ?? 0) / maxRank) + 0.32 * (degree / maxDegree)
    centralityById.set(c.id, centrality)
    const label = c.title || c.id.split('/').pop() || c.id
    return { id: c.id, type: c.type, label, degree, centrality }
  })

  // Which concepts get a label in constellation mode: the most central, plus any
  // obvious hubs. Sparse labels keep the organic view uncluttered.
  const labelCount = Math.min(20, Math.max(6, Math.ceil(baseNodes.length * 0.2)))
  const labelIds = new Set(
    [...baseNodes]
      .sort((a, b) => b.centrality - a.centrality || b.degree - a.degree || a.id.localeCompare(b.id))
      .slice(0, labelCount)
      .map((n) => n.id)
  )

  const nodeElements: ElementDefinition[] = baseNodes.map((n) => ({
    data: {
      id: n.id,
      label: n.label,
      type: n.type,
      color: colorForType(n.type),
      degree: n.degree,
      centrality: n.centrality,
      showLabel: labelIds.has(n.id) || n.degree >= 5,
      border: 1.5 + Math.min(3, n.centrality * 3),
      fontSize: n.centrality > 0.7 ? 13 : n.centrality > 0.35 ? 12 : 11,
      dotSize: 12 + Math.round(Math.min(18, n.centrality * 12 + Math.sqrt(n.degree) * 2.4))
    }
  }))

  const edgeElements: ElementDefinition[] = rawEdges.map((e) => {
    const edgeCentrality = Math.max(centralityById.get(e.source) ?? 0, centralityById.get(e.target) ?? 0)
    return {
      data: {
        id: e.id,
        source: e.source,
        target: e.target,
        color: colorForType(typeById.get(e.source) ?? ''),
        width: 1 + edgeCentrality * 1.4
      }
    }
  })

  return { elements: [...nodeElements, ...edgeElements], nodeCount: nodeElements.length, edgeCount: edgeElements.length }
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
    for (const id of ids) if ((outgoing.get(id)?.size ?? 0) === 0) dangling += scores.get(id) ?? 0
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

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

function saveGraphSnapshot(bundleId: string, mode: LayoutMode, cy: Core): void {
  // Only persist once a real layout has positioned the nodes; never snapshot the
  // initial all-at-origin state.
  if (cy.destroyed() || !cy.scratch('_okfLaidOut')) return
  const positions: Record<string, { x: number; y: number }> = {}
  cy.nodes().forEach((node) => {
    const p = node.position()
    positions[node.id()] = { x: p.x, y: p.y }
  })
  graphSnapshots.set(snapshotKey(bundleId, mode), { positions, pan: cy.pan(), zoom: cy.zoom() })
  if (graphSnapshots.size > 32) {
    const oldest = graphSnapshots.keys().next().value
    if (oldest) graphSnapshots.delete(oldest)
  }
}

function registerExtensions(): void {
  const cy = cytoscape as unknown as { use: (ext: unknown) => void; __okfExt?: boolean }
  if (cy.__okfExt) return
  for (const ext of [fcose, elk, layoutUtilities]) {
    try {
      cy.use(ext)
    } catch {
      // already registered by another consumer — ignore
    }
  }
  cy.__okfExt = true
}
