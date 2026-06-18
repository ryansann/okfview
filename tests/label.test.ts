import { describe, it, expect } from 'vitest'
import { deriveLabel } from '../src/main/label'

describe('deriveLabel — smart default bundle names', () => {
  it('uses the leaf folder when it is meaningful', () => {
    expect(deriveLabel('local', '/Users/me/work/sales-bundle')).toBe('sales-bundle')
    expect(deriveLabel('local', '/Users/me/fixtures/ga4')).toBe('ga4')
  })

  it('walks past generic folders to the project dir', () => {
    expect(deriveLabel('local', '/Users/me/myproject/docs/okf')).toBe('myproject')
    expect(deriveLabel('local', '/Users/me/another-proj/okf')).toBe('another-proj')
    expect(deriveLabel('local', '/Users/me/cool-thing/docs')).toBe('cool-thing')
  })

  it('handles a git URL with a generic #subpath via the repo name', () => {
    // sub = docs/okf → both generic → falls back to the last remaining (docs)
    expect(deriveLabel('git', 'https://github.com/org/myrepo.git#features/auth')).toBe('auth')
  })

  it('uses the repo name for a git URL without subpath', () => {
    expect(deriveLabel('git', 'https://github.com/org/myrepo.git')).toBe('myrepo')
  })

  it('derives from a tarball URL', () => {
    expect(deriveLabel('http', 'https://example.com/dl/sales-kb.tar.gz')).toBe('sales-kb')
  })

  it('never returns empty', () => {
    expect(deriveLabel('local', '/okf')).toBe('okf') // all generic → keep leaf
    expect(deriveLabel('local', '')).toBe('')
  })
})
