import { app, Menu, shell, MenuItemConstructorOptions } from 'electron'

const SPEC_URL =
  'https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md'

/** Build a proper application menu so the app shows as "OKFView" (not "Electron"). */
export function buildAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ role: 'appMenu' as const }] // label = app.name
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'OKF Specification', click: () => void shell.openExternal(SPEC_URL) },
        {
          label: 'OKFView on GitHub',
          click: () => void shell.openExternal('https://github.com/ryansann/okfview')
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Must run before app is ready for the macOS app menu label to pick it up. */
export function setAppName(): void {
  app.setName('OKFView')
}
