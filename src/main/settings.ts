import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync } from 'fs'
import type { SourceKind } from '@shared/okf/types'
import type { KnownBundle } from '@shared/ipc'

export interface PersistedBundle {
  kind: SourceKind
  origin: string // path (local) or URL (git/http), incl. any #subpath
  shared: boolean // exposed to MCP agents
}

export interface Settings {
  mcpEnabled: boolean
  mcpPort: number
  bundles: PersistedBundle[] // currently-open bundles, auto-restored on launch
  recents: KnownBundle[] // every bundle ever imported, newest first (for reopen)
}

const DEFAULTS: Settings = { mcpEnabled: false, mcpPort: 7331, bundles: [], recents: [] }

let cache: Settings | null = null

function file(): string {
  return join(app.getPath('userData'), 'okfview-settings.json')
}

export function loadSettings(): Settings {
  if (cache) return cache
  try {
    cache = { ...DEFAULTS, ...(JSON.parse(readFileSync(file(), 'utf8')) as Partial<Settings>) }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  cache = next
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch {
    /* best-effort persistence */
  }
  return next
}
