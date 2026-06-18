import type { OkfApi } from '@shared/ipc'

declare global {
  interface Window {
    okf: OkfApi
  }
}

export {}
