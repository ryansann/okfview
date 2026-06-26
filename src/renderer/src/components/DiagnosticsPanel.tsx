import { useMemo } from 'react'
import type { Bundle, Diagnostic } from '@shared/okf/types'
import { conceptIdFromPath } from '../lib/ids'
import { useStore } from '../store'

const SEVERITY_RANK: Record<string, number> = { error: 0, warn: 1, info: 2 }

export function DiagnosticsPanel({ bundle }: { bundle: Bundle }): JSX.Element {
  const openConcept = useStore((s) => s.openConceptInBundle)
  const model = useMemo(() => {
    const sorted = [...bundle.diagnostics].sort(compareDiagnostics)
    const grouped = groupBy(sorted, categoryKey)
    return Object.entries(grouped)
      .map(([key, items]) => ({
        key,
        title: categoryTitle(items),
        description: categoryDescription(items),
        items,
        ruleGroups: Object.entries(groupBy(items, (d) => d.code)).sort(
          (a, b) => compareDiagnostics(a[1][0], b[1][0]) || a[0].localeCompare(b[0])
        )
      }))
      .sort((a, b) => categoryRank(a.items) - categoryRank(b.items) || a.title.localeCompare(b.title))
  }, [bundle])
  const stats = useMemo(() => diagnosticStats(bundle.diagnostics), [bundle])
  const conformant = stats.specErrors === 0

  if (bundle.diagnostics.length === 0) {
    return (
      <div className="diagnostics conformant">
        <div className="conformant-badge">✓</div>
        <h2>Conformant</h2>
        <p>
          This bundle satisfies OKF v0.1 conformance and has no lint findings — every concept has
          parseable frontmatter with a non-empty <code>type</code>.
        </p>
      </div>
    )
  }

  return (
    <div className="diagnostics">
      <div className="diagnostics-inner">
        <header className="diag-header">
          <div>
            <h2>Diagnostics</h2>
            <p className="diag-note">
              {conformant
                ? 'Spec-conformant. Findings below are advisory okftool lint checks and can be tuned with .okftool.yaml.'
                : `${stats.specErrors} spec ${plural(stats.specErrors, 'error')} need attention before this bundle is conformant.`}
            </p>
          </div>
          <div className="diag-score" data-state={conformant ? 'ok' : 'error'}>
            {conformant ? 'Conformant' : 'Needs fixes'}
          </div>
        </header>

        <div className="diag-stat-grid" aria-label="Diagnostic summary">
          <SummaryStat label="Total" value={stats.total} />
          <SummaryStat label="Errors" value={stats.error} tone={stats.error > 0 ? 'error' : undefined} />
          <SummaryStat label="Warnings" value={stats.warn} tone={stats.warn > 0 ? 'warn' : undefined} />
          <SummaryStat label="Spec" value={stats.spec} tone={stats.specErrors > 0 ? 'error' : undefined} />
          <SummaryStat label="Lint" value={stats.lint} />
        </div>

        {model.map((category) => (
          <section key={category.key} className="diag-category">
            <div className="diag-category-head">
              <div>
                <h3>{category.title}</h3>
                {category.description && <p>{category.description}</p>}
              </div>
              <span className="diag-count">{category.items.length}</span>
            </div>

            {category.ruleGroups.map(([code, items]) => {
              const first = items[0]
              return (
                <section key={code} className="diag-rule">
                  <div className="diag-rule-head">
                    <span className={`diag-sev ${first.severity}`} />
                    <div className="diag-rule-title">
                      <h4>{first.ruleName ?? humanizeCode(code)}</h4>
                      <div className="diag-meta">
                        <code>{code}</code>
                        <span>{first.spec ? 'Spec' : 'Lint'}</span>
                        <span>{items.length} {plural(items.length, 'finding')}</span>
                      </div>
                    </div>
                  </div>
                  {(first.help || first.rationale) && (
                    <p className="diag-help">{first.help ?? first.rationale}</p>
                  )}
                  <div className="diag-items">
                    {items.map((d, i) => (
                      <button
                        key={`${d.file}-${d.message}-${i}`}
                        className="diag-item"
                        onClick={() => openConcept(bundle.id, conceptIdFromPath(d.file))}
                      >
                        <span className="diag-item-top">
                          <span className="diag-file">{d.file}</span>
                          <span className={`diag-pill ${d.severity}`}>{d.severity}</span>
                        </span>
                        <span className="diag-msg">{d.message}</span>
                        {d.fix && <span className="diag-fix">{d.fix}</span>}
                      </button>
                    ))}
                  </div>
                </section>
              )
            })}
          </section>
        ))}
      </div>
    </div>
  )
}

function SummaryStat({
  label,
  value,
  tone
}: {
  label: string
  value: number
  tone?: Diagnostic['severity']
}): JSX.Element {
  return (
    <div className={`diag-stat ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    Number(!a.spec) - Number(!b.spec) ||
    categoryTitle([a]).localeCompare(categoryTitle([b])) ||
    a.code.localeCompare(b.code) ||
    a.file.localeCompare(b.file)
  )
}

function categoryKey(d: Diagnostic): string {
  if (d.spec) return 'spec'
  return d.category ?? d.code.split('/')[0] ?? 'lint'
}

function categoryRank(items: Diagnostic[]): number {
  if (items.some((d) => d.spec)) return 0
  return Math.min(...items.map((d) => SEVERITY_RANK[d.severity]))
}

function categoryTitle(items: Diagnostic[]): string {
  const first = items[0]
  if (first.spec) return 'OKF Spec'
  return first.categoryName ?? humanizeCode(first.category ?? 'lint')
}

function categoryDescription(items: Diagnostic[]): string | undefined {
  const first = items[0]
  if (first.spec) return 'Conformance issues from the OKF specification. These are not disableable lint preferences.'
  if (first.category === 'graph-structure') return 'Graph-shape checks that keep bundles navigable for people and agents.'
  if (first.category === 'frontmatter') return 'Metadata quality checks that improve search, previews, and progressive disclosure.'
  return undefined
}

function diagnosticStats(diags: Diagnostic[]): {
  total: number
  error: number
  warn: number
  info: number
  spec: number
  lint: number
  specErrors: number
} {
  const stats = { total: diags.length, error: 0, warn: 0, info: 0, spec: 0, lint: 0, specErrors: 0 }
  for (const d of diags) {
    stats[d.severity]++
    if (d.spec) {
      stats.spec++
      if (d.severity === 'error') stats.specErrors++
    } else {
      stats.lint++
    }
  }
  return stats
}

function humanizeCode(code: string): string {
  return code
    .split('/')
    .pop()!
    .split('-')
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ')
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`
}

function groupBy<T>(arr: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const item of arr) (out[key(item)] ??= []).push(item)
  return out
}

export type { Diagnostic }
