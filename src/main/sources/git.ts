import { promises as fs } from 'fs'
import { join } from 'path'
import simpleGit, { SimpleGit } from 'simple-git'
import type { RawBundle } from '@shared/okf/types'
import type { Source } from './types'
import { labelFromPath, readBundleFiles } from './fsutil'
import { cacheDirFor } from './cache'

/**
 * A bundle backed by a remote git repository, cloned into the app cache.
 * Optional `#subpath` fragment selects a subdirectory within the repo
 * (e.g. `https://github.com/org/repo.git#okf/bundles/ga4`).
 */
export class GitSource implements Source {
  readonly id: string
  private readonly url: string
  private readonly subpath: string
  private readonly dir: string
  private git: SimpleGit
  private lastHead = ''
  private poll: NodeJS.Timeout | null = null

  constructor(rawUrl: string, private readonly pollMs = 60_000) {
    this.id = `git:${rawUrl}`
    const hashIdx = rawUrl.indexOf('#')
    this.url = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl
    this.subpath = hashIdx >= 0 ? rawUrl.slice(hashIdx + 1).replace(/^\/+/, '') : ''
    this.dir = cacheDirFor('git', rawUrl)
    this.git = simpleGit()
  }

  private get bundleRoot(): string {
    return this.subpath ? join(this.dir, this.subpath) : this.dir
  }

  private async ensureClone(): Promise<void> {
    let cloned = false
    try {
      await fs.access(join(this.dir, '.git'))
      cloned = true
    } catch {
      cloned = false
    }
    if (!cloned) {
      await fs.rm(this.dir, { recursive: true, force: true })
      await fs.mkdir(this.dir, { recursive: true })
      await simpleGit().clone(this.url, this.dir, ['--depth', '1'])
    }
    this.git = simpleGit(this.dir)
    this.lastHead = (await this.git.revparse(['HEAD'])).trim()
  }

  async load(): Promise<RawBundle> {
    await this.ensureClone()
    const files = await readBundleFiles(this.bundleRoot)
    const label = this.subpath ? labelFromPath(this.subpath) : repoName(this.url)
    return {
      label,
      source: { kind: 'git', origin: this.id.slice(4), lastSynced: new Date().toISOString() },
      files
    }
  }

  watch(onChange: () => void): (() => void) | null {
    this.poll = setInterval(() => {
      void this.refresh().then((changed) => {
        if (changed) onChange()
      })
    }, this.pollMs)
    return () => this.dispose()
  }

  /** Returns true if remote HEAD advanced (and the working copy was updated). */
  private async refreshInternal(): Promise<boolean> {
    try {
      await this.git.fetch(['--depth', '1'])
      const remote = (await this.git.revparse(['origin/HEAD']).catch(async () => {
        const branch = (await this.git.revparse(['--abbrev-ref', 'HEAD'])).trim()
        return this.git.revparse([`origin/${branch}`])
      })).trim()
      if (remote && remote !== this.lastHead) {
        await this.git.reset(['--hard', remote])
        this.lastHead = remote
        return true
      }
    } catch {
      /* offline / transient — keep current copy */
    }
    return false
  }

  async refresh(): Promise<boolean> {
    return this.refreshInternal()
  }

  dispose(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }
}

function repoName(url: string): string {
  return url.replace(/\.git$/, '').split('/').filter(Boolean).pop() || url
}
