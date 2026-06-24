import { useEffect, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { useStore, MainView } from './store'
import { Sidebar } from './components/Sidebar'
import { DocumentView } from './components/DocumentView'
import { GraphView } from './components/GraphView'
import { LogTimeline } from './components/LogTimeline'
import { DiagnosticsPanel } from './components/DiagnosticsPanel'
import { CommandPalette } from './components/CommandPalette'
import { NonConformanceBanner } from './components/NonConformanceBanner'
import { Settings } from './components/Settings'
import { Welcome } from './components/Welcome'

export default function App(): JSX.Element {
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredNumber('okfview.sidebarWidth', 300))
  const theme = useStore((s) => s.theme)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const togglePalette = useStore((s) => s.togglePalette)
  const toggleTheme = useStore((s) => s.toggleTheme)
  const busy = useStore((s) => s.busy)

  const applyChange = useStore((s) => s.applyChange)
  const pushToast = useStore((s) => s.pushToast)

  const activeBundle = useStore((s) => (s.activeBundleId ? s.bundles[s.activeBundleId] : null))
  const activeConceptId = useStore((s) => s.activeConceptId)
  const selectConcept = useStore((s) => s.selectConcept)
  const openConcept = useStore((s) => s.openConceptInBundle)

  const upsertBundle = useStore((s) => s.upsertBundle)
  const refreshRecents = useStore((s) => s.refreshRecents)

  // Load any bundles already open in the main process (workspace restore / auto-open).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const handles = await window.okf.listBundles()
      for (const h of handles) {
        const b = await window.okf.getBundle(h.id)
        if (b && !cancelled) upsertBundle(b, true)
      }
      if (!cancelled) await refreshRecents()
    })()
    return () => {
      cancelled = true
    }
  }, [upsertBundle, refreshRecents])

  const setMcp = useStore((s) => s.setMcp)

  // Subscribe to live-sync + error + MCP-status events from main.
  useEffect(() => {
    const offChange = window.okf.onBundleChanged(({ bundle }) => applyChange(bundle))
    const offErr = window.okf.onBundleError(({ message }) => pushToast('error', message))
    const offMcp = window.okf.onMcpChanged((s) => setMcp(s))
    void window.okf.mcpStatus().then(setMcp)
    return () => {
      offChange()
      offErr()
      offMcp()
    }
  }, [applyChange, pushToast, setMcp])

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        togglePalette()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        setView(view === 'graph' ? 'document' : 'graph')
      } else if ((e.metaKey || e.ctrlKey) && e.key === '[') {
        e.preventDefault()
        useStore.getState().back()
      } else if ((e.metaKey || e.ctrlKey) && e.key === ']') {
        e.preventDefault()
        useStore.getState().forward()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePalette, setView, view])

  // Mouse back/forward buttons (browsers map these to nav history too).
  useEffect(() => {
    const onMouse = (e: MouseEvent): void => {
      if (e.button === 3) {
        e.preventDefault()
        useStore.getState().back()
      } else if (e.button === 4) {
        e.preventDefault()
        useStore.getState().forward()
      }
    }
    window.addEventListener('mouseup', onMouse)
    return () => window.removeEventListener('mouseup', onMouse)
  }, [])

  useEffect(() => {
    const hideTimers = new WeakMap<Element, number>()
    const showScrollbarForScrolledElement = (event: Event): void => {
      const element =
        event.target instanceof Element ? event.target : document.scrollingElement
      if (!element) return

      element.classList.add('is-scrolling')
      const existing = hideTimers.get(element)
      if (existing) window.clearTimeout(existing)
      hideTimers.set(
        element,
        window.setTimeout(() => {
          element.classList.remove('is-scrolling')
          hideTimers.delete(element)
        }, 850)
      )
    }

    window.addEventListener('scroll', showScrollbarForScrolledElement, true)
    return () => {
      window.removeEventListener('scroll', showScrollbarForScrolledElement, true)
    }
  }, [])

  const concept = activeBundle?.concepts.find((c) => c.id === activeConceptId) ?? null
  const navigate = (id: string): void => {
    if (activeBundle) openConcept(activeBundle.id, id)
    else selectConcept(id)
  }

  const tabs: { key: MainView; label: string }[] = [
    { key: 'document', label: 'Document' },
    { key: 'graph', label: 'Graph' },
    { key: 'log', label: 'Log' },
    { key: 'diagnostics', label: 'Diagnostics' }
  ]

  const startSidebarResize = (e: ReactPointerEvent): void => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidth
    let nextWidth = startWidth

    const onMove = (moveEvent: PointerEvent): void => {
      nextWidth = clamp(startWidth + moveEvent.clientX - startX, 240, 520)
      setSidebarWidth(nextWidth)
    }
    const onUp = (): void => {
      localStorage.setItem('okfview.sidebarWidth', String(nextWidth))
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={`app theme-${theme}`}
      style={{ '--sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <Sidebar />
      <div
        className="sidebar-resizer"
        role="separator"
        aria-label="Resize bundles sidebar"
        aria-orientation="vertical"
        onPointerDown={startSidebarResize}
      />
      <main className="main">
        <div className="topbar">
          <div className="topbar-left">
            {activeBundle && <HistoryNav />}
            <div className="tabs">
              {activeBundle &&
                tabs.map((t) => (
                  <button
                    key={t.key}
                    className={`tab ${view === t.key ? 'active' : ''}`}
                    onClick={() => setView(t.key)}
                  >
                    {t.label}
                    {t.key === 'diagnostics' && activeBundle.diagnostics.length > 0 && (
                      <span className="tab-badge">{activeBundle.diagnostics.length}</span>
                    )}
                  </button>
                ))}
            </div>
          </div>
          <button className="topbar-search" onClick={() => togglePalette(true)}>
            <span>Search concepts</span>
            <kbd>⌘K</kbd>
          </button>
          <div className="topbar-right">
            {busy && <span className="spinner" />}
            <McpIndicator />
            <button
              className="topbar-icon-btn"
              onClick={toggleTheme}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button
              className="topbar-icon-btn"
              onClick={() => useStore.getState().openSettings()}
              title="Settings"
              aria-label="Settings"
            >
              ⚙
            </button>
          </div>
        </div>

        <div className="content">
          {activeBundle && <NonConformanceBanner bundle={activeBundle} />}
          <div className="content-body">
            {!activeBundle && <Welcome />}
            {activeBundle && view === 'document' && concept && (
              <DocumentView bundle={activeBundle} concept={concept} onNavigate={navigate} />
            )}
            {activeBundle && view === 'document' && !concept && (
              <div className="empty-state">Select a concept from the sidebar.</div>
            )}
            {activeBundle && view === 'graph' && (
              <GraphView
                bundle={activeBundle}
                activeConceptId={activeConceptId}
                onNavigate={navigate}
              />
            )}
            {activeBundle && view === 'log' && <LogTimeline bundle={activeBundle} />}
            {activeBundle && view === 'diagnostics' && <DiagnosticsPanel bundle={activeBundle} />}
          </div>
        </div>
      </main>

      <CommandPalette />
      <Settings />
      <Toasts />
    </div>
  )
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function readStoredNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (!raw) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

// Browser-style back/forward over the navigation trail. Lives in the topbar as
// global chrome, not in the document (which already shows its own path).
function HistoryNav(): JSX.Element {
  const back = useStore((s) => s.back)
  const forward = useStore((s) => s.forward)
  const history = useStore((s) => s.history)
  const index = useStore((s) => s.historyIndex)
  const bundles = useStore((s) => s.bundles)

  const canBack = index > 0
  const canForward = index < history.length - 1
  const labelFor = (i: number): string => {
    const loc = history[i]
    if (!loc) return ''
    const c = bundles[loc.bundleId]?.concepts.find((x) => x.id === loc.conceptId)
    return c?.title || loc.conceptId.split('/').pop() || loc.conceptId
  }

  return (
    <div className="history-nav" role="group" aria-label="Navigation history">
      <button
        className="history-btn"
        disabled={!canBack}
        onClick={back}
        aria-label="Back"
        title={canBack ? `Back to ${labelFor(index - 1)} (⌘[)` : 'Back'}
      >
        ‹
      </button>
      <button
        className="history-btn"
        disabled={!canForward}
        onClick={forward}
        aria-label="Forward"
        title={canForward ? `Forward to ${labelFor(index + 1)} (⌘])` : 'Forward'}
      >
        ›
      </button>
    </div>
  )
}

function McpIndicator(): JSX.Element | null {
  const mcp = useStore((s) => s.mcp)
  const openSettings = useStore((s) => s.openSettings)
  if (!mcp?.running) return null
  return (
    <button
      className="mcp-indicator"
      onClick={() => openSettings('mcp')}
      title={`MCP running on :${mcp.port} — ${mcp.connections.length} connection(s)`}
    >
      <span className="mcp-dot on" />
      MCP
      {mcp.connections.length > 0 && <span className="mcp-conn-count">{mcp.connections.length}</span>}
    </button>
  )
}

function Toasts(): JSX.Element {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
