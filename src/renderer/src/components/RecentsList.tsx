import type { KnownBundle } from '@shared/ipc'
import { useStore } from '../store'
import { relTime } from '../lib/format'

/** Lists previously-imported bundles that aren't currently open, for one-click reopen. */
export function RecentsList({ onPicked }: { onPicked?: () => void }): JSX.Element | null {
  const recents = useStore((s) => s.recents)
  const order = useStore((s) => s.order)
  const upsert = useStore((s) => s.upsertBundle)
  const refreshRecents = useStore((s) => s.refreshRecents)
  const setBusy = useStore((s) => s.setBusy)
  const pushToast = useStore((s) => s.pushToast)

  const openIds = new Set(order)
  const available = recents.filter((r) => !openIds.has(`${r.kind}:${r.origin}`))
  if (available.length === 0) return null

  const reopen = async (r: KnownBundle): Promise<void> => {
    setBusy(true)
    try {
      const b = await window.okf.openRecent(r.kind, r.origin)
      if (b) {
        upsert(b)
        await refreshRecents()
        onPicked?.()
      }
    } catch (e) {
      pushToast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const forget = async (e: React.MouseEvent, r: KnownBundle): Promise<void> => {
    e.stopPropagation()
    await window.okf.forgetRecent(r.kind, r.origin)
    await refreshRecents()
  }

  return (
    <div className="recents">
      {available.map((r) => (
        <div className="recent-row" key={`${r.kind}:${r.origin}`} onClick={() => reopen(r)}>
          <span className={`source-badge ${r.kind}`}>{r.kind}</span>
          <span className="recent-label">{r.label}</span>
          <span className="recent-origin" title={r.origin}>
            {r.origin}
          </span>
          <span className="recent-time">{relTime(r.lastOpened)}</span>
          <button className="icon-btn recent-forget" title="Forget" onClick={(e) => forget(e, r)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
