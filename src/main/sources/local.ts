import chokidar, { FSWatcher } from 'chokidar'
import type { RawBundle } from '@shared/okf/types'
import type { Source } from './types'
import { labelFromPath, readBundleFiles } from './fsutil'

/** A bundle backed by a local directory, watched with chokidar. */
export class LocalFolderSource implements Source {
  readonly id: string
  private watcher: FSWatcher | null = null
  private debounce: NodeJS.Timeout | null = null

  constructor(private readonly dir: string) {
    this.id = `local:${dir}`
  }

  async load(): Promise<RawBundle> {
    const files = await readBundleFiles(this.dir)
    return {
      label: labelFromPath(this.dir),
      source: { kind: 'local', origin: this.dir, lastSynced: new Date().toISOString() },
      files
    }
  }

  watch(onChange: () => void): (() => void) | null {
    this.watcher = chokidar.watch(this.dir, {
      ignored: /(^|[/\\])(\.git|node_modules|\.DS_Store)([/\\]|$)/,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 }
    })
    const fire = (): void => {
      if (this.debounce) clearTimeout(this.debounce)
      this.debounce = setTimeout(onChange, 150)
    }
    this.watcher.on('add', fire).on('change', fire).on('unlink', fire)
    this.watcher.on('addDir', fire).on('unlinkDir', fire)
    return () => this.dispose()
  }

  async refresh(): Promise<boolean> {
    /* local sources are always current; chokidar drives updates */
    return false
  }

  dispose(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
    void this.watcher?.close()
    this.watcher = null
  }
}
