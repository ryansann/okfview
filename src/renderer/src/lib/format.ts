export function relTime(input: string | number): string {
  const t = typeof input === 'number' ? input : Date.parse(input)
  if (Number.isNaN(t)) return String(input)
  const diff = Date.now() - t
  const sec = Math.round(diff / 1000)
  const abs = Math.abs(sec)
  const units: [number, string][] = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [2592000, 'day'],
    [31536000, 'month'],
    [Infinity, 'year']
  ]
  let value = sec
  let unit = 'second'
  let prev = 1
  for (const [limit, name] of units) {
    if (abs < limit) {
      value = Math.round(sec / prev)
      unit = name
      break
    }
    prev = limit
  }
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  return rtf.format(-value, unit as Intl.RelativeTimeFormatUnit)
}

export function uptime(startedAt?: number): string {
  if (!startedAt) return '—'
  let s = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const h = Math.floor(s / 3600)
  s -= h * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

export function clockTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function stringifyValue(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => stringifyValue(x)).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
