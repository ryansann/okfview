import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { buildIndex, SearchHit } from '../lib/search'
import { TypePill } from './Frontmatter'

export function CommandPalette(): JSX.Element | null {
  const open = useStore((s) => s.paletteOpen)
  const toggle = useStore((s) => s.togglePalette)
  const bundles = useStore((s) => s.bundles)
  const openConcept = useStore((s) => s.openConceptInBundle)

  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const index = useMemo(() => buildIndex(Object.values(bundles)), [bundles])
  const hits = useMemo<SearchHit[]>(() => index.search(q), [index, q])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => setSel(0), [q])

  if (!open) return null

  const choose = (h: SearchHit): void => openConcept(h.bundleId, h.conceptId)

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') toggle(false)
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, hits.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && hits[sel]) {
      choose(hits[sel])
    }
  }

  return (
    <div className="palette-overlay" onClick={() => toggle(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search concepts across all bundles…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="palette-results">
          {hits.map((h, i) => (
            <button
              key={`${h.bundleId} ${h.conceptId}`}
              className={`palette-row ${i === sel ? 'sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(h)}
            >
              <div className="palette-row-top">
                <TypePill type={h.type} />
                <span className="palette-title">{h.title}</span>
                <span className="palette-bundle">{h.bundleLabel}</span>
              </div>
              {h.snippet && <div className="palette-snippet">{h.snippet}</div>}
            </button>
          ))}
          {q.trim() && hits.length === 0 && <p className="palette-empty">No matches</p>}
          {!q.trim() && <p className="palette-empty">Type to search titles, types, tags, and body text</p>}
        </div>
      </div>
    </div>
  )
}
