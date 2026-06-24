import { useMemo, useState } from 'react'
import type { Bundle } from '@shared/okf/types'
import { buildTree, type TreeNode } from '@shared/okf/tree'
import { useStore } from '../store'
import { colorForType } from '../lib/colors'
import { McpPanel } from './McpPanel'
import { RecentsList } from './RecentsList'
import appIcon from '../../../../build/icon.png'

export function Sidebar(): JSX.Element {
  const order = useStore((s) => s.order)
  const bundles = useStore((s) => s.bundles)
  const activeBundleId = useStore((s) => s.activeBundleId)
  const reorderBundles = useStore((s) => s.reorderBundles)
  const pushToast = useStore((s) => s.pushToast)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const moveBundle = (targetId: string): void => {
    if (!draggingId || draggingId === targetId) return
    const from = order.indexOf(draggingId)
    const to = order.indexOf(targetId)
    if (from < 0 || to < 0) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    reorderBundles(next)
    void window.okf.reorderBundles(next).catch((e) => pushToast('error', (e as Error).message))
  }

  return (
    <div className="sidebar">
      <SidebarHeader />
      <div className="bundle-list-title">Bundles</div>
      <div className="bundle-list">
        {order.length === 0 && <p className="sidebar-empty">No bundles open</p>}
        {order.map((id) => (
          <BundleItem
            key={id}
            bundle={bundles[id]}
            active={id === activeBundleId}
            dragging={id === draggingId}
            onDragStart={() => setDraggingId(id)}
            onDragEnd={() => setDraggingId(null)}
            onDrop={() => moveBundle(id)}
          />
        ))}
      </div>
      <McpPanel />
    </div>
  )
}

function SidebarHeader(): JSX.Element {
  const [url, setUrl] = useState('')
  const [showRecents, setShowRecents] = useState(false)
  const setBusy = useStore((s) => s.setBusy)
  const upsert = useStore((s) => s.upsertBundle)
  const pushToast = useStore((s) => s.pushToast)
  const refreshRecents = useStore((s) => s.refreshRecents)
  const recents = useStore((s) => s.recents)
  const order = useStore((s) => s.order)

  const openIds = new Set(order)
  const reopenable = recents.filter((r) => !openIds.has(`${r.kind}:${r.origin}`))

  const guard = async (fn: () => Promise<Bundle | null>): Promise<void> => {
    setBusy(true)
    try {
      const b = await fn()
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

  const openRemote = (): void => {
    const u = url.trim()
    if (!u) return
    setUrl('')
    const isGit = /\.git($|#)/.test(u) || u.startsWith('git@')
    const isTar = /\.(tar\.gz|tgz)($|#)/.test(u)
    void guard(() => (isTar && !isGit ? window.okf.openHttp(u) : window.okf.openGit(u)))
  }

  return (
    <div className="sidebar-header">
      <div className="brand">
        <img className="brand-logo" src={appIcon} alt="" />
        <span>OKFView</span>
      </div>
      <div className="open-row">
        <button
          className="btn primary"
          onClick={() => void guard(() => window.okf.openLocalDialog())}
        >
          Open folder…
        </button>
        {reopenable.length > 0 && (
          <button
            className={`btn recent-btn ${showRecents ? 'on' : ''}`}
            onClick={() => setShowRecents((v) => !v)}
            title="Reopen a recent bundle"
          >
            Recent ▾
          </button>
        )}
      </div>
      {showRecents && reopenable.length > 0 && (
        <div className="recents-pop">
          <RecentsList onPicked={() => setShowRecents(false)} />
        </div>
      )}
      <div className="remote-row">
        <input
          className="remote-input"
          placeholder="git or .tar.gz URL  (…#subpath)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && openRemote()}
        />
        <button className="btn" onClick={openRemote} disabled={!url.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}

function BundleItem({
  bundle,
  active,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop
}: {
  bundle: Bundle
  active: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
}): JSX.Element {
  const selectBundle = useStore((s) => s.selectBundle)
  const closeBundle = useStore((s) => s.closeBundle)
  const pushToast = useStore((s) => s.pushToast)
  const applyChange = useStore((s) => s.applyChange)
  const mcpEnabled = useStore((s) => s.mcp?.enabled ?? false)
  const refreshRecents = useStore((s) => s.refreshRecents)
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')

  const tree = useMemo(() => buildTree(bundle), [bundle])

  const startRename = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setDraft(bundle.label)
    setRenaming(true)
  }
  const commitRename = async (): Promise<void> => {
    setRenaming(false)
    const updated = await window.okf.setAlias(bundle.id, draft)
    if (updated) {
      applyChange(updated)
      await refreshRecents()
    }
  }
  const close = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    await window.okf.closeBundle(bundle.id)
    closeBundle(bundle.id)
  }
  const refresh = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    try {
      await window.okf.refreshBundle(bundle.id)
    } catch (err) {
      pushToast('error', (err as Error).message)
    }
  }
  const toggleShared = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    const updated = await window.okf.setShared(bundle.id, !bundle.shared)
    if (updated) applyChange(updated)
  }

  return (
    <div
      className={`bundle-item ${active ? 'active' : ''} ${dragging ? 'dragging' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
    >
      <div
        className="bundle-row"
        draggable={!renaming}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', bundle.id)
          onDragStart()
        }}
        onDragEnd={onDragEnd}
        onClick={() => {
          setOpen(true)
          selectBundle(bundle.id)
        }}
      >
        <button
          className={`twisty ${open ? 'open' : 'closed'}`}
          type="button"
          aria-label={open ? 'Collapse bundle' : 'Expand bundle'}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation()
            setOpen(!open)
          }}
        >
          <span className="twisty-chevron" aria-hidden="true" />
        </button>
        <span className={`source-badge ${bundle.source.kind}`}>{bundle.source.kind}</span>
        {renaming ? (
          <input
            className="bundle-rename"
            value={draft}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitRename()
              else if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <span
            className="bundle-name"
            title={`${bundle.source.origin}\n(double-click to rename)`}
            onDoubleClick={startRename}
          >
            {bundle.label}
          </span>
        )}
        {mcpEnabled && (
          <button
            className={`icon-btn share ${bundle.shared ? 'on' : ''}`}
            title={bundle.shared ? 'Shared with agents — click to unshare' : 'Share with agents (MCP)'}
            onClick={toggleShared}
          >
            {bundle.shared ? '◉' : '◌'}
          </button>
        )}
        <span className="bundle-actions">
          <button className="icon-btn" title="Rename bundle" onClick={startRename}>
            ✎
          </button>
          {bundle.source.kind !== 'local' && (
            <button className="icon-btn" title="Sync now" onClick={refresh}>
              ⟳
            </button>
          )}
          <button className="icon-btn" title="Close bundle" onClick={close}>
            ✕
          </button>
        </span>
      </div>
      <div className="bundle-substats">
        {bundle.concepts.length} concepts
        {bundle.diagnostics.length > 0 && (
          <span className="diag-badge"> · {bundle.diagnostics.length} issues</span>
        )}
        {bundle.okfVersion && <span className="ver"> · OKF {bundle.okfVersion}</span>}
      </div>
      {open && (
        <div className="tree">
          {tree.children.map((n) => (
            <TreeRow key={n.path} node={n} depth={0} bundleId={bundle.id} />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeRow({
  node,
  depth,
  bundleId
}: {
  node: TreeNode
  depth: number
  bundleId: string
}): JSX.Element {
  const [open, setOpen] = useState(depth < 1)
  const activeConceptId = useStore((s) => s.activeConceptId)
  const activeBundleId = useStore((s) => s.activeBundleId)
  const openConcept = useStore((s) => s.openConceptInBundle)

  // One vertical guide per ancestor level, so nesting is visible at a glance.
  const guides = Array.from({ length: depth }, (_, i) => <span key={i} className="tree-indent" />)

  if (node.isDir) {
    return (
      <div>
        <div className="tree-row dir" onClick={() => setOpen(!open)}>
          {guides}
          <span className="tree-gutter">
            <span className={`tree-twisty ${open ? 'open' : ''}`}>{open ? '▾' : '▸'}</span>
          </span>
          <span className="tree-label tree-folder">{node.name}</span>
          <span className="tree-count">{countConcepts(node)}</span>
        </div>
        {open &&
          node.children.map((c) => (
            <TreeRow key={c.path} node={c} depth={depth + 1} bundleId={bundleId} />
          ))}
      </div>
    )
  }

  const selected = activeBundleId === bundleId && activeConceptId === node.path
  return (
    <div
      className={`tree-row file ${selected ? 'selected' : ''}`}
      onClick={() => openConcept(bundleId, node.path)}
      title={node.concept?.type}
    >
      {guides}
      <span className="tree-gutter">
        <span className="tree-dot" style={{ background: colorForType(node.concept?.type ?? '') }} />
      </span>
      <span className="tree-label tree-file">{node.concept?.title || node.name}</span>
    </div>
  )
}

// Concepts under a directory node (recursive), for the folder count badge.
function countConcepts(node: TreeNode): number {
  if (!node.isDir) return 1
  return node.children.reduce((n, c) => n + countConcepts(c), 0)
}
