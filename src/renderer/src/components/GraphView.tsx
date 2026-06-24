import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  orphanCount: number // concepts with no links in or out
  clusterCount: number // connected components (treating links as undirected)
  reciprocalCount: number // A↔B mutual links (drawn as one double-arrow edge)
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
  const [mode, setMode] = useState<LayoutMode>('constellation')
  const [typeFilter, setTypeFilter] = useState('')
  const [showEdges, setShowEdges] = useState(true)
  // The concept carried over from the document view. Its node + neighbors stay lit
  // (everything else faded, like a sticky hover) until the user clears it; re-syncs
  // whenever navigation changes the active concept.
  const [focusedId, setFocusedId] = useState<string | null>(activeConceptId)
  const focusedIdRef = useRef<string | null>(activeConceptId)

  const palette = useMemo(() => themePalette(theme), [theme])
  const map = useMemo<KnowledgeMap>(() => buildKnowledgeMap(bundle), [bundle])

  useEffect(() => {
    onNavigateRef.current = onNavigate
  }, [onNavigate])
  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    focusedIdRef.current = focusedId
  }, [focusedId])

  // Sticky selection: the focused node + its neighbors lit, everything else faded —
  // the same treatment as hover, but persistent. Reads the ref so the (once-bound)
  // cy event handlers can call it.
  const paintSelection = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().removeClass('lit faded active')
      const id = focusedIdRef.current
      if (!id) return
      const node = cy.getElementById(id)
      if (node.empty()) return
      const hood = node.closedNeighborhood()
      hood.addClass('lit')
      cy.elements().not(hood).addClass('faded')
      node.addClass('active')
    })
  }, [])

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
      cy.elements().removeClass('lit faded')
      node.addClass('hover')
      node.closedNeighborhood().addClass('lit')
      cy.elements().not(node.closedNeighborhood()).addClass('faded')
    })
    cy.on('mouseout', 'node', (evt) => {
      evt.target.removeClass('hover')
      paintSelection() // restore the sticky selection the hover temporarily replaced
    })

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

  // A fresh navigation re-selects that concept in the graph.
  useEffect(() => {
    setFocusedId(activeConceptId)
  }, [activeConceptId])

  // Type filter dims non-matching nodes (independent of the selection highlight).
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().removeClass('dim')
      if (!typeFilter) return
      cy.nodes().forEach((n) => {
        if (n.data('type') !== typeFilter) n.addClass('dim')
      })
      cy.edges().forEach((e) => {
        if (e.source().hasClass('dim') || e.target().hasClass('dim')) e.addClass('dim')
      })
    })
  }, [typeFilter, map])

  // Repaint the sticky selection when it changes or the graph rebuilds.
  useEffect(() => {
    paintSelection()
  }, [focusedId, map, paintSelection])

  const focusConcept = focusedId ? (bundle.concepts.find((c) => c.id === focusedId) ?? null) : null

  return (
    <div className="graph-view">
      <div className="graph-controls">
        <div className="graph-mode" role="group" aria-label="Layout mode">
          <button
            className={`graph-toggle ${mode === 'constellation' ? 'on' : ''}`}
            onClick={() => setMode('constellation')}
            title="Constellation: organic force-directed map, labels on key concepts"
          >
            Constellation
          </button>
          <button
            className={`graph-toggle ${mode === 'layered' ? 'on' : ''}`}
            onClick={() => setMode('layered')}
            title="Layered: directed top-down hierarchy, minimal edge crossings"
          >
            Layered
          </button>
        </div>
        {focusConcept ? (
          <div
            className="graph-focus"
            title={`Selected: ${focusConcept.title || focusConcept.id} — its neighbors are highlighted`}
          >
            <span className="graph-focus-chip">
              <span className="focus-dot" style={{ background: colorForType(focusConcept.type) }} />
              <span className="focus-label">
                {focusConcept.title || focusConcept.id.split('/').pop()}
              </span>
            </span>
            <button
              className="graph-focus-x"
              aria-label="Clear selection"
              title="Clear selection"
              onClick={() => setFocusedId(null)}
            >
              ✕
            </button>
          </div>
        ) : (
          activeConceptId && (
            <button
              className="graph-toggle"
              onClick={() => setFocusedId(activeConceptId)}
              title="Select the current document's concept and highlight its neighbors"
            >
              Select current
            </button>
          )
        )}
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
      <div className="graph-info">
        <div className="graph-info-main">
          {map.nodeCount} concepts · {map.edgeCount} links
        </div>
        <div className="graph-info-sub">
          {map.clusterCount} {map.clusterCount === 1 ? 'cluster' : 'clusters'} · {map.orphanCount}{' '}
          {map.orphanCount === 1 ? 'orphan' : 'orphans'} · {map.reciprocalCount} mutual
        </div>
      </div>
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
    cy.edges().toggleClass('soft', constellation)
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
  const spread = n <= 12 ? 1.25 : n <= 30 ? 1.15 : n <= 60 ? 1.05 : 0.95
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
    nodeSeparation: 110 * spread,
    // Push spokes off hubs proportionally to how connected the busier endpoint is,
    // so high-degree nodes don't collapse their neighbors into a crossing knot.
    idealEdgeLength: (edge: cytoscape.EdgeSingular) =>
      (120 + 9 * Math.min(8, Math.max(edge.source().degree(false), edge.target().degree(false)))) * spread,
    edgeElasticity: () => 0.45,
    nodeRepulsion: () => 13000,
    gravity: 0.28,
    gravityRange: 3.4,
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
    // Reciprocal link: one edge with an arrowhead on each end.
    {
      selector: 'edge.bidir',
      style: { 'source-arrow-shape': 'triangle', 'source-arrow-color': palette.edgeColor }
    },
    // Constellation edges recede into the background so the dense web reads as
    // texture, not noise; hover/selection brings the relevant ones forward.
    {
      selector: 'edge.soft',
      style: { opacity: 0.38, width: 'data(width)', 'arrow-scale': 0.75 }
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
        'source-arrow-color': 'data(color)',
        opacity: 0.95,
        width: 2.4,
        'z-index': 15
      }
    },
    { selector: 'node.hover', style: { 'border-width': 3, 'z-index': 30 } },
    { selector: 'node.active', style: { 'border-width': 4, 'border-color': palette.activeBorder, 'z-index': 40 } },
    { selector: 'node.constellation.active', style: { 'background-color': palette.activeBorder } }
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

  const directed = new Set<string>()
  const typeById = new Map(bundle.concepts.map((c) => [c.id, c.type]))
  for (const c of bundle.concepts) {
    for (const l of c.outgoing) {
      if (!l.targetId || !idSet.has(l.targetId)) continue
      if (l.targetId === c.id) continue
      const key = `${c.id}->${l.targetId}`
      if (directed.has(key)) continue
      directed.add(key)
      outgoing.get(c.id)?.add(l.targetId)
      incoming.get(l.targetId)?.add(c.id)
    }
  }

  // Collapse reciprocal links (A→B and B→A) into one edge drawn with an arrowhead
  // on each end, instead of two overlapping single-headed edges.
  const rawEdges: Array<{ id: string; source: string; target: string; bidir: boolean }> = []
  const seenPair = new Set<string>()
  for (const key of directed) {
    const [a, b] = key.split('->')
    const pair = a < b ? `${a} ${b}` : `${b} ${a}`
    if (seenPair.has(pair)) continue
    seenPair.add(pair)
    rawEdges.push({ id: `${a}->${b}`, source: a, target: b, bidir: directed.has(`${b}->${a}`) })
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
      },
      classes: e.bidir ? 'bidir' : undefined
    }
  })

  const orphanCount = ids.filter(
    (id) => (outgoing.get(id)?.size ?? 0) + (incoming.get(id)?.size ?? 0) === 0
  ).length

  return {
    elements: [...nodeElements, ...edgeElements],
    nodeCount: nodeElements.length,
    edgeCount: edgeElements.length,
    orphanCount,
    clusterCount: countComponents(ids, outgoing, incoming),
    reciprocalCount: rawEdges.filter((e) => e.bidir).length
  }
}

// Connected components over the undirected link graph (orphans count as singletons).
function countComponents(
  ids: string[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
): number {
  const seen = new Set<string>()
  let components = 0
  for (const start of ids) {
    if (seen.has(start)) continue
    components++
    const stack = [start]
    seen.add(start)
    while (stack.length) {
      const cur = stack.pop() as string
      for (const nb of [...(outgoing.get(cur) ?? []), ...(incoming.get(cur) ?? [])]) {
        if (!seen.has(nb)) {
          seen.add(nb)
          stack.push(nb)
        }
      }
    }
  }
  return components
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
