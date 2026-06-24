import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron'
import { execFileSync } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { IPC } from '@shared/ipc'
import type { LintConfig } from '@shared/ipc'
import type { Bundle, SourceKind } from '@shared/okf/types'
import { Workspace } from './workspace'
import { buildAppMenu, setAppName } from './menu'
import { OkfMcpServer } from './mcp/server'
import { TOOLS, RESOURCES } from './mcp/tools'
import { loadSettings, saveSettings } from './settings'

setAppName() // before app is ready so the macOS app menu shows "OKFView"

const workspace = new Workspace()
const mcp = new OkfMcpServer(workspace, app.getVersion())
let mainWindow: BrowserWindow | null = null

function mcpStatus(): ReturnType<OkfMcpServer['status']> {
  return mcp.status(loadSettings().mcpEnabled)
}

function emitMcp(): void {
  send(IPC.mcpChanged, mcpStatus())
}

function devSha(): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return undefined
  }
}

async function startMcp(): Promise<void> {
  const { mcpEnabled, mcpPort } = loadSettings()
  // OKF_MCP=1 force-enables (handy for headless testing); OKF_MCP_PORT overrides.
  const enabled = mcpEnabled || !!process.env.OKF_MCP
  const port = process.env.OKF_MCP_PORT ? Number(process.env.OKF_MCP_PORT) : mcpPort
  if (enabled) {
    try {
      await mcp.start(port)
    } catch (e) {
      console.error('MCP start failed:', (e as Error).message)
    }
  }
  emitMcp()
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'OKFView',
    backgroundColor: '#0e1116',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // preload needs require() for the bridge
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function send(channel: string, payload: unknown): void {
  mainWindow?.webContents.send(channel, payload)
}

// The "Explore a sample" bundle is okfview's own docs, dogfooded end to end: a
// packaged build fetches the okftool-built bundle attached to the matching GitHub
// release over the HTTP/tarball source. okftool's `build` nests the bundle under
// an `okfview-<version>/` prefix dir, so the URL carries that as a `#subpath`.
// In dev there is no release for the working version, so we open the repo's
// docs/okf directly. Not shared to MCP by default — the user opts in.
const SAMPLE_REPO = 'ryansann/okfview'
const SAMPLE_ALIAS = 'OKFView docs'

function openSampleBundle(): Promise<Bundle> {
  if (app.isPackaged) {
    const v = app.getVersion()
    const stem = `okfview-${v}`
    const url = `https://github.com/${SAMPLE_REPO}/releases/download/v${v}/${stem}.tar.gz#${stem}`
    return workspace.openHttp(url, false, SAMPLE_ALIAS)
  }
  const dev = [join(app.getAppPath(), 'docs', 'okf'), join(process.cwd(), 'docs', 'okf')]
  const dir = dev.find((p) => existsSync(p)) ?? dev[0]
  return workspace.openLocal(dir, false, SAMPLE_ALIAS)
}

function registerIpc(): void {
  workspace.setListeners(
    (id, bundle) => {
      send(IPC.bundleChanged, { id, bundle })
      emitMcp() // sharedCount / availability may have changed
    },
    (origin, message) => send(IPC.bundleError, { origin, message })
  )

  ipcMain.handle(IPC.appInfo, () => ({
    version: app.isPackaged ? app.getVersion() : 'dev',
    packaged: app.isPackaged,
    sha: app.isPackaged ? undefined : devSha(),
    cwd: app.isPackaged ? undefined : process.cwd()
  }))

  ipcMain.handle(IPC.listBundles, () => workspace.list())

  ipcMain.handle(IPC.openLocalDialog, async (): Promise<Bundle | null> => {
    const res = await dialog.showOpenDialog({
      title: 'Open OKF bundle folder',
      properties: ['openDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    return workspace.openLocal(res.filePaths[0])
  })

  ipcMain.handle(IPC.openLocalPath, (_e, path: string) => workspace.openLocal(path))
  ipcMain.handle(IPC.openGit, (_e, url: string) => workspace.openGit(url))
  ipcMain.handle(IPC.openHttp, (_e, url: string) => workspace.openHttp(url))
  ipcMain.handle(IPC.openSample, () => openSampleBundle())
  ipcMain.handle(IPC.getBundle, (_e, id: string) => workspace.get(id))
  ipcMain.handle(IPC.refreshBundle, (_e, id: string) => workspace.refresh(id))
  ipcMain.handle(IPC.closeBundle, (_e, id: string) => workspace.close(id))
  ipcMain.handle(IPC.reorderBundles, (_e, ids: string[]) => workspace.reorder(ids))
  ipcMain.handle(IPC.setShared, (_e, id: string, shared: boolean) => workspace.setShared(id, shared))
  ipcMain.handle(IPC.setAlias, (_e, id: string, alias: string) => workspace.setAlias(id, alias))
  ipcMain.handle(IPC.listRecents, () => workspace.listRecents())
  ipcMain.handle(IPC.openRecent, (_e, kind: SourceKind, origin: string) =>
    workspace.reopenRecent(kind, origin)
  )
  ipcMain.handle(IPC.forgetRecent, (_e, kind: SourceKind, origin: string) =>
    workspace.forgetRecent(kind, origin)
  )
  ipcMain.handle(IPC.openExternal, (_e, url: string) => shell.openExternal(url))

  // MCP control
  ipcMain.handle(IPC.mcpStatus, () => mcpStatus())
  ipcMain.handle(IPC.mcpSetEnabled, async (_e, enabled: boolean) => {
    saveSettings({ mcpEnabled: enabled })
    if (enabled) {
      try {
        await mcp.start(loadSettings().mcpPort)
      } catch (e) {
        console.error('MCP start failed:', (e as Error).message)
      }
    } else {
      await mcp.stop()
    }
    const s = mcpStatus()
    emitMcp()
    return s
  })
  ipcMain.handle(IPC.mcpSetPort, async (_e, port: number) => {
    saveSettings({ mcpPort: port })
    if (loadSettings().mcpEnabled) {
      try {
        await mcp.start(port)
      } catch (e) {
        console.error('MCP restart failed:', (e as Error).message)
      }
    }
    const s = mcpStatus()
    emitMcp()
    return s
  })

  // Lint policy
  ipcMain.handle(IPC.lintConfig, () => {
    const s = loadSettings()
    return { profile: s.lintProfile, overrideBundleConfig: s.lintOverrideBundleConfig }
  })
  ipcMain.handle(IPC.lintSetConfig, (_e, config: LintConfig) => {
    saveSettings({
      lintProfile: config.profile,
      lintOverrideBundleConfig: config.overrideBundleConfig
    })
    workspace.relintAll() // re-lint open bundles with the new policy
    return config
  })
  ipcMain.handle(IPC.mcpTools, () => ({
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    resources: RESOURCES.map((r) => ({ uri: r.uri, name: r.name }))
  }))
}

// In production (no dev server), lock the renderer down with a CSP response header.
// Skipped in dev so Vite's HMR websocket keeps working.
function applyCsp(): void {
  if (process.env.ELECTRON_RENDERER_URL) return
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'"
        ]
      }
    })
  })
}

app.whenReady().then(async () => {
  applyCsp()
  buildAppMenu()
  registerIpc()
  mcp.setOnChange(emitMcp) // push live connection/activity updates to the renderer

  // Restore bundles from the previous session (so the MCP scope is ready too).
  await workspace.restore()

  // Auto-open a bundle passed via OKF_OPEN (used for first-run / verification).
  // Done before the window so it is present when the renderer calls listBundles().
  const auto = process.env.OKF_OPEN
  if (auto) {
    try {
      await workspace.openLocal(auto)
    } catch (e) {
      console.error('OKF_OPEN failed:', (e as Error).message)
    }
  }

  await startMcp()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  void mcp.stop()
  workspace.disposeAll()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void mcp.stop()
  workspace.disposeAll()
})
