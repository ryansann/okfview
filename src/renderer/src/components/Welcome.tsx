import { useStore } from '../store'
import { RecentsList } from './RecentsList'

export function Welcome(): JSX.Element {
  const setBusy = useStore((s) => s.setBusy)
  const upsert = useStore((s) => s.upsertBundle)
  const pushToast = useStore((s) => s.pushToast)
  const refreshRecents = useStore((s) => s.refreshRecents)
  const recents = useStore((s) => s.recents)

  const openFolder = async (): Promise<void> => {
    setBusy(true)
    try {
      const b = await window.okf.openLocalDialog()
      if (b) {
        upsert(b)
        await refreshRecents()
      }
    } catch (e) {
      pushToast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-mark">◆</div>
        <h1>okfview</h1>
        <p className="welcome-sub">
          A viewer for <strong>Open Knowledge Format</strong> bundles — local or remote, kept
          live as files change.
        </p>
        <div className="welcome-actions">
          <button className="btn primary lg" onClick={openFolder}>
            Open a bundle folder
          </button>
        </div>
        <p className="welcome-hint">
          …or paste a git / <code>.tar.gz</code> URL in the sidebar. Press{' '}
          <kbd>⌘</kbd>
          <kbd>K</kbd> to search once a bundle is open.
        </p>
        {recents.length > 0 ? (
          <div className="welcome-recents">
            <div className="welcome-recents-title">Recent bundles</div>
            <RecentsList />
          </div>
        ) : (
          <ul className="welcome-tips">
            <li>
              <span className="dot blue" /> Documents render with frontmatter, schema tables &amp;
              citations
            </li>
            <li>
              <span className="dot teal" /> The graph view maps how concepts link together
            </li>
            <li>
              <span className="dot amber" /> Diagnostics surface OKF v0.1 conformance issues
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
