import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type { BundleChangedEvent, BundleErrorEvent, McpStatus, OkfApi } from '@shared/ipc'

const api: OkfApi = {
  appInfo: () => ipcRenderer.invoke(IPC.appInfo),
  listBundles: () => ipcRenderer.invoke(IPC.listBundles),
  openLocalDialog: () => ipcRenderer.invoke(IPC.openLocalDialog),
  openLocalPath: (path) => ipcRenderer.invoke(IPC.openLocalPath, path),
  openGit: (url) => ipcRenderer.invoke(IPC.openGit, url),
  openHttp: (url) => ipcRenderer.invoke(IPC.openHttp, url),
  getBundle: (id) => ipcRenderer.invoke(IPC.getBundle, id),
  refreshBundle: (id) => ipcRenderer.invoke(IPC.refreshBundle, id),
  closeBundle: (id) => ipcRenderer.invoke(IPC.closeBundle, id),
  reorderBundles: (ids) => ipcRenderer.invoke(IPC.reorderBundles, ids),
  setShared: (id, shared) => ipcRenderer.invoke(IPC.setShared, id, shared),
  setAlias: (id, alias) => ipcRenderer.invoke(IPC.setAlias, id, alias),
  listRecents: () => ipcRenderer.invoke(IPC.listRecents),
  openRecent: (kind, origin) => ipcRenderer.invoke(IPC.openRecent, kind, origin),
  forgetRecent: (kind, origin) => ipcRenderer.invoke(IPC.forgetRecent, kind, origin),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  mcpStatus: () => ipcRenderer.invoke(IPC.mcpStatus),
  mcpSetEnabled: (enabled) => ipcRenderer.invoke(IPC.mcpSetEnabled, enabled),
  mcpSetPort: (port) => ipcRenderer.invoke(IPC.mcpSetPort, port),
  onMcpChanged: (cb) => {
    const handler = (_e: unknown, payload: McpStatus): void => cb(payload)
    ipcRenderer.on(IPC.mcpChanged, handler)
    return () => ipcRenderer.removeListener(IPC.mcpChanged, handler)
  },
  onBundleChanged: (cb) => {
    const handler = (_e: unknown, payload: BundleChangedEvent): void => cb(payload)
    ipcRenderer.on(IPC.bundleChanged, handler)
    return () => ipcRenderer.removeListener(IPC.bundleChanged, handler)
  },
  onBundleError: (cb) => {
    const handler = (_e: unknown, payload: BundleErrorEvent): void => cb(payload)
    ipcRenderer.on(IPC.bundleError, handler)
    return () => ipcRenderer.removeListener(IPC.bundleError, handler)
  }
}

contextBridge.exposeInMainWorld('okf', api)
