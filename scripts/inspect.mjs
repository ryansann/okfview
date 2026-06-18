// Standalone OKF bundle inspector. Run against any bundle to see exactly what
// our parser produces — concept count, type extraction, link resolution, and a
// breakdown of diagnostics. Pure ESM, no build step.
//
//   node scripts/inspect.mjs /path/to/bundle
//
import { promises as fs } from 'fs'
import { join, relative, sep } from 'path'
import matter from 'gray-matter'

const root = process.argv[2]
if (!root) {
  console.error('usage: node scripts/inspect.mjs <bundle-dir>')
  process.exit(1)
}

async function readAll(dir, base = dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', '.DS_Store'].includes(e.name)) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) await readAll(full, base, out)
    else if (e.name.toLowerCase().endsWith('.md'))
      out.push({ path: relative(base, full).split(sep).join('/'), content: await fs.readFile(full, 'utf8') })
  }
  return out
}

const reserved = (p) => /(^|\/)(index|log)\.md$/i.test(p)
const idOf = (p) => p.replace(/\.md$/i, '')

const files = await readAll(root)
const concepts = []
const missingType = []
const noFrontmatter = []
const parseErr = []

for (const f of files) {
  if (reserved(f.path)) continue
  const hasFm = /^﻿?---\r?\n/.test(f.content)
  let data = {}
  if (!hasFm) {
    noFrontmatter.push(f.path)
  } else {
    try {
      data = matter(f.content).data ?? {}
    } catch (e) {
      parseErr.push(`${f.path}: ${e.message}`)
    }
  }
  const type = String(data.type ?? '').trim()
  if (!type) missingType.push(f.path)
  concepts.push({ id: idOf(f.path), type, content: f.content })
}

// crude link resolution mirroring the app
const ids = new Set(concepts.map((c) => c.id))
let resolved = 0
const linkSamples = []
for (const c of concepts) {
  const body = c.content.replace(/^﻿?---\r?\n[\s\S]*?\n---\r?\n/, '')
  for (const m of body.matchAll(/(!?)\[[^\]]*\]\(\s*([^)\s]+)/g)) {
    if (m[1] === '!') continue
    const href = m[2]
    if (/^[a-z]+:\/\//i.test(href) || href.startsWith('#') || href.endsWith('/')) continue
    const path0 = href.split('#')[0]
    const base = c.id.includes('/') ? c.id.slice(0, c.id.lastIndexOf('/')) : ''
    const abs = path0.startsWith('/')
      ? path0.slice(1)
      : [...base.split('/'), ...path0.split('/')].reduce((acc, p) => {
          if (p === '' || p === '.') return acc
          if (p === '..') acc.pop()
          else acc.push(p)
          return acc
        }, []).join('/')
    const target = abs.replace(/\.md$/i, '')
    if (target.endsWith('index') || target === 'index') continue
    if (ids.has(target)) resolved++
    else if (linkSamples.length < 8) linkSamples.push(`${c.id}  --[${href}]-->  (no match: ${target})`)
  }
}

console.log(`\n=== OKF inspect: ${root} ===`)
console.log(`markdown files      : ${files.length}`)
console.log(`reserved (index/log): ${files.filter((f) => reserved(f.path)).length}`)
console.log(`concepts (nodes)    : ${concepts.length}`)
console.log(`distinct types      : ${[...new Set(concepts.map((c) => c.type).filter(Boolean))].length}`)
console.log(`resolved links(edges): ${resolved}`)
console.log(`\n-- diagnostics --`)
console.log(`no frontmatter      : ${noFrontmatter.length}`)
console.log(`yaml parse errors   : ${parseErr.length}`)
console.log(`missing/empty type  : ${missingType.length}`)
if (noFrontmatter.length) console.log(`  e.g. no-fm: ${noFrontmatter.slice(0, 5).join(', ')}`)
if (parseErr.length) console.log(`  e.g. err : ${parseErr.slice(0, 3).join(' | ')}`)
if (missingType.length) console.log(`  e.g. no-type: ${missingType.slice(0, 5).join(', ')}`)
if (linkSamples.length) {
  console.log(`\n-- sample unresolved links --`)
  for (const s of linkSamples) console.log(`  ${s}`)
}

// show the first concept's raw head so we can see the real frontmatter shape
const firstConcept = files.find((f) => !reserved(f.path))
if (firstConcept) {
  console.log(`\n-- head of ${firstConcept.path} (first 12 lines) --`)
  console.log(firstConcept.content.split('\n').slice(0, 12).map((l) => '  | ' + l).join('\n'))
}
