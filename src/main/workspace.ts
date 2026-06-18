import type { Bundle, BundleHandle, SourceKind } from '@shared/okf/types'
import type { KnownBundle } from '@shared/ipc'
import { buildBundle } from '@shared/okf/graph'
import type { Source } from './sources/types'
import { LocalFolderSource } from './sources/local'
import { GitSource } from './sources/git'
import { HttpTarballSource } from './sources/http'
import { loadSettings, saveSettings, PersistedBundle } from './settings'

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

  openLocal(dir: string, shared = true): Promise<Bundle> {
    return this.open(new LocalFolderSource(dir), { kind: 'local', origin: dir, shared })
  }

  openGit(url: string, shared = true): Promise<Bundle> {
    return this.open(new GitSource(url), { kind: 'git', origin: url, shared })
  }

  openHttp(url: string, shared = true): Promise<Bundle> {
    return this.open(new HttpTarballSource(url), { kind: 'http', origin: url, shared })
  }

  /** Reopen a bundle by its persisted kind/origin. */
  reopen(kind: SourceKind, origin: string, shared: boolean): Promise<Bundle> {
    if (kind === 'git') return this.openGit(origin, shared)
    if (kind === 'http') return this.openHttp(origin, shared)
    return this.openLocal(origin, shared)
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
    const entry: Entry = { source, bundle, spec }
    this.entries.set(source.id, entry)

    const disposeWatch = source.watch(() => void this.reload(source.id))
    entry.disposeWatch = disposeWatch ?? undefined
    this.remember(spec.kind, spec.origin, bundle.label)
    this.persist()
    return bundle
  }

  /** Record (or bump) a bundle in the recents history. */
  private remember(kind: SourceKind, origin: string, label: string): void {
    const recents = loadSettings().recents.filter(
      (r) => !(r.kind === kind && r.origin === origin)
    )
    recents.unshift({ kind, origin, label, lastOpened: Date.now() })
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

  /** Reopen bundles persisted from a previous session. */
  async restore(): Promise<void> {
    const { bundles } = loadSettings()
    for (const b of bundles) {
      try {
        await this.reopen(b.kind, b.origin, b.shared)
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
