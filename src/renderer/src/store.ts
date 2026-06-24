import { create } from 'zustand'
import type { Bundle, ConceptId } from '@shared/okf/types'
import type { KnownBundle, McpStatus } from '@shared/ipc'

export type MainView = 'document' | 'graph' | 'log' | 'diagnostics'
export type SettingsSection = 'general' | 'lint' | 'mcp' | 'about'

/** One stop in the browser-like navigation trail. */
export interface NavLocation {
  bundleId: string
  conceptId: ConceptId
}

const HISTORY_CAP = 100

// Append a location to the trail, truncating any forward entries (a fresh
// navigation invalidates the redo stack), and de-duping repeats of the top.
function withVisit(
  s: State,
  bundleId: string,
  conceptId: ConceptId
): Pick<State, 'history' | 'historyIndex'> {
  const current = s.history[s.historyIndex]
  if (current && current.bundleId === bundleId && current.conceptId === conceptId) {
    return { history: s.history, historyIndex: s.historyIndex }
  }
  const trail = s.history.slice(0, s.historyIndex + 1)
  trail.push({ bundleId, conceptId })
  const history = trail.length > HISTORY_CAP ? trail.slice(trail.length - HISTORY_CAP) : trail
  return { history, historyIndex: history.length - 1 }
}

// Resolve a trail entry to concrete state, healing a vanished concept to its
// bundle's first concept. Does not touch the trail itself.
function applyLocation(s: State, loc: NavLocation, index: number): Partial<State> {
  const bundle = s.bundles[loc.bundleId]
  const conceptId = bundle?.concepts.some((c) => c.id === loc.conceptId)
    ? loc.conceptId
    : (bundle?.concepts[0]?.id ?? loc.conceptId)
  return { activeBundleId: loc.bundleId, activeConceptId: conceptId, view: 'document', historyIndex: index }
}

interface Toast {
  id: number
  kind: 'error' | 'info'
  message: string
}

interface State {
  bundles: Record<string, Bundle>
  order: string[]
  activeBundleId: string | null
  activeConceptId: ConceptId | null
  view: MainView
  paletteOpen: boolean
  theme: 'dark' | 'light'
  toasts: Toast[]
  busy: boolean
  mcp: McpStatus | null
  recents: KnownBundle[]
  settingsOpen: boolean
  settingsSection: SettingsSection
  history: NavLocation[]
  historyIndex: number

  // selectors
  activeBundle(): Bundle | null

  // actions
  setMcp(s: McpStatus): void
  refreshRecents(): Promise<void>
  openSettings(section?: SettingsSection): void
  closeSettings(): void
  setBusy(b: boolean): void
  upsertBundle(bundle: Bundle, makeActive?: boolean): void
  applyChange(bundle: Bundle): void
  closeBundle(id: string): void
  reorderBundles(ids: string[]): void
  selectBundle(id: string): void
  selectConcept(id: ConceptId | null): void
  openConceptInBundle(bundleId: string, conceptId: ConceptId): void
  back(): void
  forward(): void
  setView(v: MainView): void
  togglePalette(open?: boolean): void
  toggleTheme(): void
  pushToast(kind: Toast['kind'], message: string): void
  dismissToast(id: number): void
}

let toastSeq = 1

export const useStore = create<State>((set, get) => ({
  bundles: {},
  order: [],
  activeBundleId: null,
  activeConceptId: null,
  view: 'document',
  paletteOpen: false,
  theme: 'dark',
  toasts: [],
  busy: false,
  mcp: null,
  recents: [],
  settingsOpen: false,
  settingsSection: 'general',
  history: [],
  historyIndex: -1,

  activeBundle: () => {
    const { activeBundleId, bundles } = get()
    return activeBundleId ? bundles[activeBundleId] ?? null : null
  },

  setMcp: (s) => set({ mcp: s }),
  refreshRecents: async () => set({ recents: await window.okf.listRecents() }),
  openSettings: (section) =>
    set((s) => ({ settingsOpen: true, settingsSection: section ?? s.settingsSection })),
  closeSettings: () => set({ settingsOpen: false }),
  setBusy: (b) => set({ busy: b }),

  upsertBundle: (bundle, makeActive = true) =>
    set((s) => {
      const exists = !!s.bundles[bundle.id]
      const order = exists ? s.order : [...s.order, bundle.id]
      const firstConcept = bundle.concepts[0]?.id ?? null
      const nextConceptId = makeActive
        ? (bundle.concepts.find((c) => c.id === s.activeConceptId)?.id ?? firstConcept)
        : s.activeConceptId
      const base = {
        bundles: { ...s.bundles, [bundle.id]: bundle },
        order,
        activeBundleId: makeActive ? bundle.id : s.activeBundleId,
        activeConceptId: nextConceptId
      }
      return makeActive && nextConceptId ? { ...base, ...withVisit(s, bundle.id, nextConceptId) } : base
    }),

  // Live-sync: replace bundle data without disturbing selection if it still exists.
  applyChange: (bundle) =>
    set((s) => {
      if (!s.bundles[bundle.id]) {
        // Unknown bundle (e.g. change arrived before initial fetch): add it, inactive.
        return { bundles: { ...s.bundles, [bundle.id]: bundle }, order: [...s.order, bundle.id] }
      }
      const stillThere = bundle.concepts.some((c) => c.id === s.activeConceptId)
      return {
        bundles: { ...s.bundles, [bundle.id]: bundle },
        activeConceptId:
          s.activeBundleId === bundle.id && !stillThere
            ? (bundle.concepts[0]?.id ?? null)
            : s.activeConceptId
      }
    }),

  closeBundle: (id) =>
    set((s) => {
      const bundles = { ...s.bundles }
      delete bundles[id]
      const order = s.order.filter((x) => x !== id)
      const activeBundleId = s.activeBundleId === id ? (order[order.length - 1] ?? null) : s.activeBundleId
      const nextBundle = activeBundleId ? bundles[activeBundleId] : null
      // Prune the trail of the closed bundle so back/forward can't land on it,
      // keeping the cursor on the same entry it pointed at when possible.
      const prevLoc = s.history[s.historyIndex]
      const history = s.history.filter((h) => h.bundleId !== id)
      const keptIndex = prevLoc ? history.indexOf(prevLoc) : -1
      return {
        bundles,
        order,
        activeBundleId,
        activeConceptId:
          s.activeBundleId === id ? (nextBundle?.concepts[0]?.id ?? null) : s.activeConceptId,
        history,
        historyIndex: keptIndex >= 0 ? keptIndex : history.length - 1
      }
    }),

  reorderBundles: (ids) =>
    set((s) => {
      const known = ids.filter((id) => s.bundles[id])
      const missing = s.order.filter((id) => !known.includes(id))
      return { order: [...known, ...missing] }
    }),

  selectBundle: (id) =>
    set((s) => {
      const firstId = s.bundles[id]?.concepts[0]?.id ?? null
      const view: MainView = s.view === 'graph' ? 'graph' : 'document'
      const base = { activeBundleId: id, activeConceptId: firstId, view }
      return firstId ? { ...base, ...withVisit(s, id, firstId) } : base
    }),

  selectConcept: (id) =>
    set((s) =>
      id && s.activeBundleId
        ? { activeConceptId: id, view: 'document', ...withVisit(s, s.activeBundleId, id) }
        : { activeConceptId: id, view: 'document' }
    ),

  openConceptInBundle: (bundleId, conceptId) =>
    set((s) => ({
      activeBundleId: bundleId,
      activeConceptId: conceptId,
      view: 'document',
      paletteOpen: false,
      ...withVisit(s, bundleId, conceptId)
    })),

  back: () =>
    set((s) => (s.historyIndex > 0 ? applyLocation(s, s.history[s.historyIndex - 1], s.historyIndex - 1) : {})),
  forward: () =>
    set((s) =>
      s.historyIndex < s.history.length - 1
        ? applyLocation(s, s.history[s.historyIndex + 1], s.historyIndex + 1)
        : {}
    ),

  setView: (v) => set({ view: v }),
  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  pushToast: (kind, message) =>
    set((s) => ({ toasts: [...s.toasts, { id: toastSeq++, kind, message }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
