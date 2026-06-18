// Deterministic, pleasant color per concept `type`. Same type → same hue everywhere
// (graph nodes, type pills, filters), which is what makes the UI feel coherent.

const PALETTE = [
  '#6ea8fe', // blue
  '#63e6be', // teal
  '#ffd43b', // amber
  '#ff8787', // red
  '#b197fc', // violet
  '#74c0fc', // sky
  '#ffa94d', // orange
  '#8ce99a', // green
  '#f783ac', // pink
  '#a9e34b', // lime
  '#66d9e8', // cyan
  '#e599f7' // grape
]

function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function colorForType(type: string): string {
  if (!type) return '#8b949e'
  return PALETTE[hash(type) % PALETTE.length]
}
