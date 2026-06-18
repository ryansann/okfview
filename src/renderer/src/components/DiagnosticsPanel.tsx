import { useMemo } from 'react'
import type { Bundle, Diagnostic } from '@shared/okf/types'
import { conceptIdFromPath } from '../lib/ids'
import { useStore } from '../store'

const CODE_LABEL: Record<string, string> = {
  'missing-frontmatter': 'Missing frontmatter',
  'frontmatter-parse': 'Unparseable frontmatter',
  'missing-type': 'Missing `type`',
  'broken-link': 'Broken link',
  'index-frontmatter': 'Non-root index frontmatter'
}

export function DiagnosticsPanel({ bundle }: { bundle: Bundle }): JSX.Element {
  const openConcept = useStore((s) => s.openConceptInBundle)
  const grouped = useMemo(() => groupBy(bundle.diagnostics, (d) => d.code), [bundle])

  if (bundle.diagnostics.length === 0) {
    return (
      <div className="diagnostics conformant">
        <div className="conformant-badge">✓</div>
        <h2>Conformant</h2>
        <p>
          This bundle satisfies OKF v0.1 conformance: every concept has parseable frontmatter
          with a non-empty <code>type</code>, and all links resolve.
        </p>
      </div>
    )
  }

  return (
    <div className="diagnostics">
      <h2>
        Diagnostics <span className="muted">({bundle.diagnostics.length})</span>
      </h2>
      <p className="diag-note">
        Per spec §9, none of these reject the bundle — they are surfaced for developers.
      </p>
      {Object.entries(grouped).map(([code, items]) => (
        <section key={code} className="diag-group">
          <h3>
            <span className={`diag-sev ${items[0].severity}`} />
            {CODE_LABEL[code] ?? code} <span className="muted">({items.length})</span>
          </h3>
          {items.map((d, i) => (
            <button
              key={i}
              className="diag-item"
              onClick={() => openConcept(bundle.id, conceptIdFromPath(d.file))}
            >
              <span className="diag-file">{d.file}</span>
              <span className="diag-msg">{d.message}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  )
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) (out[key(item)] ??= []).push(item)
  return out
}

export type { Diagnostic }
