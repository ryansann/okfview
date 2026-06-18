import { promises as fs, createWriteStream } from 'fs'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import * as tar from 'tar'
import type { RawBundle } from '@shared/okf/types'
import type { Source } from './types'
import { labelFromPath, readBundleFiles } from './fsutil'
import { cacheDirFor } from './cache'

/**
 * A bundle backed by a remote `.tar.gz` / `.tgz` archive over HTTP(S).
 * Change detection uses conditional GET (ETag / Last-Modified). An optional
 * `#subpath` fragment selects a directory within the extracted archive.
 */
export class HttpTarballSource implements Source {
  readonly id: string
  private readonly url: string
  private readonly subpath: string
  private readonly dir: string
  private etag = ''
  private lastModified = ''
  private poll: NodeJS.Timeout | null = null

  constructor(rawUrl: string, private readonly pollMs = 120_000) {
    this.id = `http:${rawUrl}`
    const hashIdx = rawUrl.indexOf('#')
    this.url = hashIdx >= 0 ? rawUrl.slice(0, hashIdx) : rawUrl
    this.subpath = hashIdx >= 0 ? rawUrl.slice(hashIdx + 1).replace(/^\/+/, '') : ''
    this.dir = cacheDirFor('http', rawUrl)
  }

  private get bundleRoot(): string {
    return this.subpath ? join(this.dir, this.subpath) : this.dir
  }

  /** Download + extract. Returns false if the server reported 304 Not Modified. */
  private async download(): Promise<boolean> {
    const headers: Record<string, string> = {}
    if (this.etag) headers['If-None-Match'] = this.etag
    if (this.lastModified) headers['If-Modified-Since'] = this.lastModified

    const res = await fetch(this.url, { headers })
    if (res.status === 304) return false
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${this.url}`)
    this.etag = res.headers.get('etag') ?? ''
    this.lastModified = res.headers.get('last-modified') ?? ''

    await fs.rm(this.dir, { recursive: true, force: true })
    await fs.mkdir(this.dir, { recursive: true })

    const tmp = join(this.dir, '.download.tgz')
    const body = res.body
    if (!body) throw new Error('empty response body')
    await pipeline(Readable.fromWeb(body as never), createWriteStream(tmp))
    await tar.x({ file: tmp, cwd: this.dir, strip: detectStrip(this.url) })
    await fs.rm(tmp, { force: true })
    return true
  }

  async load(): Promise<RawBundle> {
    await this.download()
    const files = await readBundleFiles(this.bundleRoot)
    const label = this.subpath ? labelFromPath(this.subpath) : labelFromUrl(this.url)
    return {
      label,
      source: { kind: 'http', origin: this.url, lastSynced: new Date().toISOString() },
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

  async refresh(): Promise<boolean> {
    try {
      return await this.download()
    } catch {
      return false
    }
  }

  dispose(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
  }
}

// Many archives wrap everything in a top-level dir (e.g. GitHub's `repo-main/`).
function detectStrip(url: string): number {
  return /github\.com\/.+\/(archive|tarball)\//.test(url) ? 1 : 0
}

function labelFromUrl(url: string): string {
  try {
    const u = new URL(url)
    return labelFromPath(u.pathname.replace(/\.(tar\.gz|tgz)$/i, '')) || u.hostname
  } catch {
    return url
  }
}
