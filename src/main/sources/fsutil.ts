import { promises as fs } from 'fs'
import { join, relative, sep } from 'path'
import type { RawFile } from '@shared/okf/types'

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.svn', '.hg', '.DS_Store'])

/** Recursively read every `.md` file under `root` into bundle-relative RawFiles. */
export async function readBundleFiles(root: string): Promise<RawFile[]> {
  const out: RawFile[] = []
  async function walk(dir: string): Promise<void> {
    let entries: import('fs').Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.') {
        if (IGNORE_DIRS.has(e.name)) continue
      }
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        if (IGNORE_DIRS.has(e.name)) continue
        await walk(full)
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
        try {
          const content = await fs.readFile(full, 'utf8')
          out.push({ path: relative(root, full).split(sep).join('/'), content })
        } catch {
          /* unreadable file — skip */
        }
      }
    }
  }
  await walk(root)
  out.sort((a, b) => a.path.localeCompare(b.path))
  return out
}

export function labelFromPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || p
}
