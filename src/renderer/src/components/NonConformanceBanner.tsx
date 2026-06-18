import { useMemo, useState } from 'react'
import type { Bundle } from '@shared/okf/types'
import { conformanceSummary } from '@shared/okf/relations'
import { useStore } from '../store'

/**
 * Shown when a bundle violates OKF v0.1 §9 (files without frontmatter or `type`).
 * Per spec we still render it — this just explains *why* it looks sparse, so the
 * tool doesn't appear broken when fed a non-standard "bundle".
 */
export function NonConformanceBanner({ bundle }: { bundle: Bundle }): JSX.Element | null {
  const setView = useStore((s) => s.setView)
  const [dismissed, setDismissed] = useState(false)
  const s = useMemo(() => conformanceSummary(bundle), [bundle])

  if (dismissed || s.conformant) return null

  const broken = s.missingFrontmatter + s.missingType
  const noun = s.conceptCount === 1 ? 'file' : 'files'

  return (
    <div className="nonconf-banner">
      <span className="nonconf-icon">⚠</span>
      <div className="nonconf-text">
        <strong>This doesn’t look like a conformant OKF v0.1 bundle.</strong>{' '}
        {s.missingFrontmatter > 0 && (
          <>
            {s.missingFrontmatter} {noun} have no YAML frontmatter
            {s.missingType > 0 ? '; ' : '. '}
          </>
        )}
        {s.missingType > 0 && <>{s.missingType} have no <code>type</code>. </>}
        OKF concepts are <code>.md</code> files with frontmatter (only <code>type</code> is
        required) — there’s no <code>manifest.yaml</code>. Rendering it as-is.
      </div>
      <button className="nonconf-link" onClick={() => setView('diagnostics')}>
        View {broken} issues
      </button>
      <button className="nonconf-x" title="Dismiss" onClick={() => setDismissed(true)}>
        ✕
      </button>
    </div>
  )
}
