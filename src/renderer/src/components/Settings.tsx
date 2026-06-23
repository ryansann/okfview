import { useEffect, useState } from 'react'
import { useStore, SettingsSection } from '../store'
import { OKF_SPEC_SUMMARY, OKF_SPEC_URL, OKF_SPEC_VERSION } from '@shared/okf/spec'
import type { AppInfo, LintConfig, LintProfile } from '@shared/ipc'
import { McpDashboard } from './McpDashboard'

const SECTIONS: { key: SettingsSection; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: '⚙' },
  { key: 'lint', label: 'Diagnostics', icon: '✓' },
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
          {section === 'lint' && <LintSection />}
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

const PROFILES: { key: LintProfile; label: string; desc: string }[] = [
  { key: 'minimal', label: 'Minimal', desc: 'Quietest — only the cheap timestamp check beyond spec conformance.' },
  { key: 'recommended', label: 'Recommended', desc: 'Balanced defaults (the okf-recommended profile).' },
  { key: 'strict', label: 'Strict', desc: 'Most aggressive — advisory rules become errors and extra checks turn on.' }
]

function LintSection(): JSX.Element {
  const [config, setConfig] = useState<LintConfig | null>(null)

  useEffect(() => {
    void window.okf.lintConfig().then(setConfig)
  }, [])

  const update = (patch: Partial<LintConfig>): void =>
    setConfig((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      void window.okf.lintSetConfig(next)
      return next
    })

  return (
    <div className="settings-section">
      <h2>Diagnostics</h2>
      <p className="setting-desc">
        Spec conformance (§9) is always enforced. These settings control how aggressive the
        advisory lint rules are, via{' '}
        <a href="#" onClick={(e) => (e.preventDefault(), window.okf.openExternal('https://github.com/ryansann/okftool'))}>
          okftool
        </a>
        .
      </p>
      {config && (
        <>
          <div className="setting-row">
            <div>
              <div className="setting-label">Strictness</div>
              <div className="setting-desc">{PROFILES.find((p) => p.key === config.profile)?.desc}</div>
            </div>
            <div className="seg">
              {PROFILES.map((p) => (
                <button
                  key={p.key}
                  className={config.profile === p.key ? 'on' : ''}
                  onClick={() => config.profile !== p.key && update({ profile: p.key })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Override per-bundle config</div>
              <div className="setting-desc">
                On: this policy applies to every bundle. Off: a bundle&apos;s own{' '}
                <code>.okftool.yaml</code> wins if present, and this policy is the fallback.
              </div>
            </div>
            <div className="seg">
              <button
                className={config.overrideBundleConfig ? 'on' : ''}
                onClick={() => !config.overrideBundleConfig && update({ overrideBundleConfig: true })}
              >
                On
              </button>
              <button
                className={!config.overrideBundleConfig ? 'on' : ''}
                onClick={() => config.overrideBundleConfig && update({ overrideBundleConfig: false })}
              >
                Off
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AboutSection(): JSX.Element {
  const [showSpec, setShowSpec] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const open = (url: string): void => void window.okf.openExternal(url)

  useEffect(() => {
    let cancelled = false
    void window.okf.appInfo().then((info) => {
      if (!cancelled) setAppInfo(info)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="settings-section">
      <h2>About</h2>
      <p className="about-lead">
        <strong>OKFView</strong> — a viewer for Open Knowledge Format bundles, with live sync and an
        MCP bridge for coding agents.
      </p>
      {appInfo && (
        <div className="app-version">
          <span>{appInfo.packaged ? `v${appInfo.version}` : 'dev'}</span>
          {!appInfo.packaged && appInfo.sha && <code>{appInfo.sha}</code>}
          {!appInfo.packaged && appInfo.cwd && <code title={appInfo.cwd}>{appInfo.cwd}</code>}
        </div>
      )}
      <ul className="about-links">
        <li>
          <button className="linkish" onClick={() => open('https://github.com/ryansann/okfview')}>
            OKFView on GitHub ↗
          </button>
        </li>
        <li>
          <button className="linkish" onClick={() => open('https://github.com/ryansann/okftool')}>
            okftool (validator &amp; linter) on GitHub ↗
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
