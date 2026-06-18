import type { RawBundle } from '@shared/okf/types'

export interface Source {
  /** Stable id for this source (used as the bundle id). */
  readonly id: string
  /** Load (or reload) the bundle's raw files. */
  load(): Promise<RawBundle>
  /**
   * Begin watching for changes. `onChange` is invoked (debounced) whenever the
   * underlying content may have changed. Returns a disposer, or null if the
   * source cannot watch (caller may poll via refresh()).
   */
  watch(onChange: () => void): (() => void) | null
  /**
   * Best-effort: pull latest remote content into the local working copy.
   * Returns true if the content changed.
   */
  refresh(): Promise<boolean>
  dispose(): void
}
