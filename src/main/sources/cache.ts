import { app } from 'electron'
import { createHash } from 'crypto'
import { join } from 'path'

/** Per-origin cache directory under the app's userData folder. */
export function cacheDirFor(prefix: string, origin: string): string {
  const hash = createHash('sha1').update(origin).digest('hex').slice(0, 16)
  return join(app.getPath('userData'), 'bundles', `${prefix}-${hash}`)
}
