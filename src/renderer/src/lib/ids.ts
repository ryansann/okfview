/** Concept id from a bundle-relative file path (renderer-safe, no Node deps). */
export function conceptIdFromPath(path: string): string {
  return path.replace(/\.md$/i, '')
}
