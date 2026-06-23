import type { Bundle, BundleHandle, SourceKind } from '@shared/okf/types'
import type { KnownBundle } from '@shared/ipc'
import { buildBundle } from '@shared/okf/graph'
import type { Source } from './sources/types'
import { LocalFolderSource } from './sources/local'
import { GitSource } from './sources/git'
import { HttpTarballSource } from './sources/http'
import { loadSettings, saveSettings, PersistedBundle } from './settings'
import { deriveLabel } from './label'

const MAX_RECENTS = 40

interface Entry {
  source: Source
  bundle: Bundle
  spec: PersistedBundle // how to reopen + share flag
  disposeWatch?: () => void
}

type ChangeListener = (id: string, bundle: Bundle) => void
type ErrorListener = (origin: string, message: string) => void

/** Owns every open bundle, its source adapter, watcher, and MCP scoping. */
export class Workspace {
  private entries = new Map<string, Entry>()
  private onChange: ChangeListener = () => {}
  private onError: ErrorListener = () => {}

  setListeners(onChange: ChangeListener, onError: ErrorListener): void {
    this.onChange = onChange
    this.onError = onError
  }

  list(): BundleHandle[] {
    return [...this.entries.values()].map(({ bundle }) => ({
      id: bundle.id,
      label: bundle.label,
      source: bundle.source,
      conceptCount: bundle.concepts.length,
      diagnosticCount: bundle.diagnostics.length
    }))
  }

  get(id: string): Bundle | null {
    return this.entries.get(id)?.bundle ?? null
  }

  openLocal(dir: string, shared = true, alias?: string): Promise<Bundle> {
    return this.open(new LocalFolderSource(dir), { kind: 'local', origin: dir, shared, alias })
  }

  openGit(url: string, shared = true, alias?: string): Promise<Bundle> {
    return this.open(new GitSource(url), { kind: 'git', origin: url, shared, alias })
  }

  openHttp(url: string, shared = true, alias?: string): Promise<Bundle> {
    return this.open(new HttpTarballSource(url), { kind: 'http', origin: url, shared, alias })
  }

  /** Reopen a bundle by its persisted kind/origin (re-applying any saved alias). */
  reopen(kind: SourceKind, origin: string, shared: boolean, alias?: string): Promise<Bundle> {
    if (kind === 'git') return this.openGit(origin, shared, alias)
    if (kind === 'http') return this.openHttp(origin, shared, alias)
    return this.openLocal(origin, shared, alias)
  }

  /** The display label for a bundle: its alias if set, else a derived name. */
  private labelFor(spec: PersistedBundle): string {
    return spec.alias?.trim() || deriveLabel(spec.kind, spec.origin)
  }

  private async open(source: Source, spec: PersistedBundle): Promise<Bundle> {
    const existing = this.entries.get(source.id)
    if (existing) {
      source.dispose()
      return existing.bundle
    }

    const raw = await source.load()
    const bundle = buildBundle(raw)
    bundle.id = source.id // canonical identity: matches the workspace map key
    bundle.shared = spec.shared
    bundle.label = this.labelFor(spec)
    const entry: Entry = { source, bundle, spec }
    this.entries.set(source.id, entry)

    const disposeWatch = source.watch(() => void this.reload(source.id))
    entry.disposeWatch = disposeWatch ?? undefined
    this.remember(spec, bundle.label)
    this.persist()
    return bundle
  }

  /** Record (or bump) a bundle in the recents history. */
  private remember(spec: PersistedBundle, label: string): void {
    const recents = loadSettings().recents.filter(
      (r) => !(r.kind === spec.kind && r.origin === spec.origin)
    )
    recents.unshift({
      kind: spec.kind,
      origin: spec.origin,
      label,
      lastOpened: Date.now(),
      alias: spec.alias
    })
    saveSettings({ recents: recents.slice(0, MAX_RECENTS) })
  }

  listRecents(): KnownBundle[] {
    return loadSettings().recents
  }

  forgetRecent(kind: SourceKind, origin: string): KnownBundle[] {
    const recents = loadSettings().recents.filter(
      (r) => !(r.kind === kind && r.origin === origin)
    )
    saveSettings({ recents })
    return recents
  }

  private async reload(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    try {
      const raw = await entry.source.load()
      entry.bundle = buildBundle(raw)
      entry.bundle.id = id
      entry.bundle.shared = entry.spec.shared
      entry.bundle.label = this.labelFor(entry.spec)
      this.onChange(id, entry.bundle)
    } catch (e) {
      this.onError(entry.bundle.source.origin, (e as Error).message)
    }
  }

  async refresh(id: string): Promise<Bundle | null> {
    const entry = this.entries.get(id)
    if (!entry) return null
    try {
      await entry.source.refresh()
      const raw = await entry.source.load()
      entry.bundle = buildBundle(raw)
      entry.bundle.id = id
      entry.bundle.shared = entry.spec.shared
      entry.bundle.label = this.labelFor(entry.spec)
      this.onChange(id, entry.bundle)
      return entry.bundle
    } catch (e) {
      this.onError(entry.bundle.source.origin, (e as Error).message)
      return entry.bundle
    }
  }

  /** Toggle whether a bundle is exposed to MCP agents. */
  setShared(id: string, shared: boolean): Bundle | null {
    const entry = this.entries.get(id)
    if (!entry) return null
    entry.spec.shared = shared
    entry.bundle.shared = shared
    this.persist()
    this.onChange(id, entry.bundle)
    return entry.bundle
  }

  /** Set (or clear, with '') a bundle's display alias. Flows to UI, MCP, and recents. */
  setAlias(id: string, alias: string): Bundle | null {
    const entry = this.entries.get(id)
    if (!entry) return null
    const trimmed = alias.trim()
    entry.spec.alias = trimmed || undefined
    entry.bundle.label = this.labelFor(entry.spec)
    this.persist()
    // keep the recents entry's name in sync
    const recents = loadSettings().recents.map((r) =>
      r.kind === entry.spec.kind && r.origin === entry.spec.origin
        ? { ...r, alias: entry.spec.alias, label: entry.bundle.label }
        : r
    )
    saveSettings({ recents })
    this.onChange(id, entry.bundle)
    return entry.bundle
  }

  /** Reopen a remembered bundle, re-applying its saved alias. */
  reopenRecent(kind: SourceKind, origin: string): Promise<Bundle> {
    const recent = loadSettings().recents.find((r) => r.kind === kind && r.origin === origin)
    return this.reopen(kind, origin, true, recent?.alias)
  }

  /** Bundles currently exposed to MCP agents (scoping). */
  listShared(): Bundle[] {
    return [...this.entries.values()].filter((e) => e.spec.shared).map((e) => e.bundle)
  }

  getShared(id: string): Bundle | null {
    const entry = this.entries.get(id)
    return entry && entry.spec.shared ? entry.bundle : null
  }

  close(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.disposeWatch?.()
    entry.source.dispose()
    this.entries.delete(id)
    this.persist()
  }

  reorder(ids: string[]): void {
    const requested = ids.filter((id) => this.entries.has(id))
    const remaining = [...this.entries.keys()].filter((id) => !requested.includes(id))
    const next = new Map<string, Entry>()
    for (const id of [...requested, ...remaining]) {
      const entry = this.entries.get(id)
      if (entry) next.set(id, entry)
    }
    this.entries = next
    this.persist()
  }

  /** Reopen bundles persisted from a previous session. */
  async restore(): Promise<void> {
    const { bundles } = loadSettings()
    for (const b of bundles) {
      try {
        await this.reopen(b.kind, b.origin, b.shared, b.alias)
      } catch {
        /* skip bundles that no longer load */
      }
    }
  }

  private persist(): void {
    const bundles: PersistedBundle[] = [...this.entries.values()].map((e) => ({ ...e.spec }))
    saveSettings({ bundles })
  }

  disposeAll(): void {
    for (const id of [...this.entries.keys()]) {
      const entry = this.entries.get(id)
      entry?.disposeWatch?.()
      entry?.source.dispose()
      this.entries.delete(id)
    }
  }
}
