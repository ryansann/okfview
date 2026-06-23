import { useEffect, useState } from 'react'
import { useStore, SettingsSection } from '../store'
import { OKF_SPEC_SUMMARY, OKF_SPEC_URL, OKF_SPEC_VERSION } from '@shared/okf/spec'
import { McpDashboard } from './McpDashboard'

const SECTIONS: { key: SettingsSection; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: '⚙' },
  { key: 'mcp', label: 'Agents (MCP)', icon: '🔌' },
  { key: 'about', label: 'About', icon: 'ⓘ' }
]

export function Settings(): JSX.Element | null {
  const open = useStore((s) => s.settingsOpen)
  const section = useStore((s) => s.settingsSection)
  const close = useStore((s) => s.closeSettings)
  const goto = useStore((s) => s.openSettings)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return (
    <div className="settings-overlay" onClick={close}>
      <div className="settings" onClick={(e) => e.stopPropagation()}>
        <nav className="settings-nav">
          <div className="settings-nav-title">Settings</div>
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              className={`settings-nav-item ${section === s.key ? 'active' : ''}`}
              onClick={() => goto(s.key)}
            >
              <span className="settings-nav-icon">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          <button className="settings-close" onClick={close} title="Close (Esc)">
            ✕
          </button>
          {section === 'general' && <GeneralSection />}
          {section === 'mcp' && <McpDashboard />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  )
}

function GeneralSection(): JSX.Element {
  const theme = useStore((s) => s.theme)
  const toggleTheme = useStore((s) => s.toggleTheme)
  return (
    <div className="settings-section">
      <h2>General</h2>
      <div className="setting-row">
        <div>
          <div className="setting-label">Theme</div>
          <div className="setting-desc">Color scheme for the app.</div>
        </div>
        <div className="seg">
          <button className={theme === 'dark' ? 'on' : ''} onClick={() => theme !== 'dark' && toggleTheme()}>
            ☾ Dark
          </button>
          <button className={theme === 'light' ? 'on' : ''} onClick={() => theme !== 'light' && toggleTheme()}>
            ☀ Light
          </button>
        </div>
      </div>
    </div>
  )
}

function AboutSection(): JSX.Element {
  const [showSpec, setShowSpec] = useState(false)
  const open = (url: string): void => void window.okf.openExternal(url)
  return (
    <div className="settings-section">
      <h2>About</h2>
      <p className="about-lead">
        <strong>OKFView</strong> — a viewer for Open Knowledge Format bundles, with live sync and an
        MCP bridge for coding agents.
      </p>
      <ul className="about-links">
        <li>
          <button className="linkish" onClick={() => open('https://github.com/ryansann/okfview')}>
            OKFView on GitHub ↗
          </button>
        </li>
        <li>
          <button className="linkish" onClick={() => open(OKF_SPEC_URL)}>
            OKF v{OKF_SPEC_VERSION} specification ↗
          </button>
        </li>
      </ul>
      <button className="btn" onClick={() => setShowSpec(!showSpec)}>
        {showSpec ? 'Hide' : 'Show'} OKF quick reference
      </button>
      {showSpec && <pre className="spec-pre">{OKF_SPEC_SUMMARY}</pre>}
    </div>
  )
}
