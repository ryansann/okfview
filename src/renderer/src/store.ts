import { create } from 'zustand'
import type { Bundle, ConceptId } from '@shared/okf/types'
import type { KnownBundle, McpStatus } from '@shared/ipc'

export type MainView = 'document' | 'graph' | 'log' | 'diagnostics'
export type SettingsSection = 'general' | 'mcp' | 'about'

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
      return {
        bundles: { ...s.bundles, [bundle.id]: bundle },
        order,
        activeBundleId: makeActive ? bundle.id : s.activeBundleId,
        activeConceptId: makeActive
          ? (bundle.concepts.find((c) => c.id === s.activeConceptId)?.id ?? firstConcept)
          : s.activeConceptId
      }
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
      return {
        bundles,
        order,
        activeBundleId,
        activeConceptId:
          s.activeBundleId === id ? (nextBundle?.concepts[0]?.id ?? null) : s.activeConceptId
      }
    }),

  reorderBundles: (ids) =>
    set((s) => {
      const known = ids.filter((id) => s.bundles[id])
      const missing = s.order.filter((id) => !known.includes(id))
      return { order: [...known, ...missing] }
    }),

  selectBundle: (id) =>
    set((s) => ({
      activeBundleId: id,
      activeConceptId: s.bundles[id]?.concepts[0]?.id ?? null,
      view: s.view === 'graph' ? 'graph' : 'document'
    })),

  selectConcept: (id) => set({ activeConceptId: id, view: 'document' }),

  openConceptInBundle: (bundleId, conceptId) =>
    set({ activeBundleId: bundleId, activeConceptId: conceptId, view: 'document', paletteOpen: false }),

  setView: (v) => set({ view: v }),
  togglePalette: (open) => set((s) => ({ paletteOpen: open ?? !s.paletteOpen })),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),

  pushToast: (kind, message) =>
    set((s) => ({ toasts: [...s.toasts, { id: toastSeq++, kind, message }] })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))
