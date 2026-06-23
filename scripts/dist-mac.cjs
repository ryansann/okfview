#!/usr/bin/env node

const { existsSync, mkdtempSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const args = process.argv.slice(2)
const noNotarize = args.includes('--no-notarize')
const builderArgs = args.filter((arg) => arg !== '--no-notarize')
const env = { ...process.env }

if (!env.APPLE_API_ISSUER && env.APPLE_API_ISSUER_ID) {
  env.APPLE_API_ISSUER = env.APPLE_API_ISSUER_ID
}

const keyContent = env.APPLE_API_KEY_CONTENT || apiKeyContentFrom(env.APPLE_API_KEY)
if (keyContent) {
  const keyId = env.APPLE_API_KEY_ID || 'local'
  const dir = mkdtempSync(join(tmpdir(), 'okfview-notary-'))
  const keyPath = join(dir, `AuthKey_${keyId}.p8`)
  writeFileSync(keyPath, keyContent, { mode: 0o600 })
  env.APPLE_API_KEY = keyPath
} else if (env.APPLE_API_KEY?.startsWith('~/')) {
  env.APPLE_API_KEY = join(process.env.HOME || '', env.APPLE_API_KEY.slice(2))
}

const hasNotary = Boolean(env.APPLE_API_KEY && env.APPLE_API_KEY_ID && env.APPLE_API_ISSUER)

if (!hasNotary && !noNotarize) {
  console.error(
    [
      'Refusing to run a macOS distribution build without notarization credentials.',
      '',
      'Set APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER_ID/APPLE_API_ISSUER.',
      'APPLE_API_KEY may be either a path to AuthKey_*.p8 or the raw .p8 file contents.',
      '',
      'For an intentionally signed-but-not-notarized local build, pass --no-notarize.'
    ].join('\n')
  )
  process.exit(1)
}

if (hasNotary && env.OKFVIEW_NOTARY_DEBUG === '1') {
  if (!env.DEBUG) {
    env.DEBUG = 'electron-notarize*'
  } else if (!env.DEBUG.split(',').includes('electron-notarize*')) {
    env.DEBUG = `${env.DEBUG},electron-notarize*`
  }
}

verifyDeveloperIdIdentity(env)

run('npx', ['electron-vite', 'build'], env)

const finalBuilderArgs = ['electron-builder', '--mac', ...builderArgs]
if (noNotarize) finalBuilderArgs.push('-c.mac.notarize=false')
run('npx', finalBuilderArgs, env)

function apiKeyContentFrom(value) {
  if (!value) return ''
  if (value.includes('BEGIN PRIVATE KEY')) return value
  if (value.includes('\\n') && value.includes('PRIVATE KEY')) return value.replace(/\\n/g, '\n')
  return ''
}

function verifyDeveloperIdIdentity(commandEnv) {
  if (!commandEnv.CSC_LINK) return
  if (!commandEnv.CSC_KEY_PASSWORD) {
    console.error('CSC_KEY_PASSWORD is required when CSC_LINK is set.')
    process.exit(1)
  }

  const dir = mkdtempSync(join(tmpdir(), 'okfview-csc-'))
  const certPath = join(dir, 'certificate.p12')
  const keychainPath = join(dir, 'signing.keychain-db')
  const keychainPassword = `${Date.now()}-${Math.random()}`
  const certBytes = existsSync(commandEnv.CSC_LINK)
    ? undefined
    : Buffer.from(commandEnv.CSC_LINK, 'base64')

  if (certBytes) writeFileSync(certPath, certBytes, { mode: 0o600 })

  try {
    execFileSync('security', ['create-keychain', '-p', keychainPassword, keychainPath], { stdio: 'ignore' })
    execFileSync('security', ['unlock-keychain', '-p', keychainPassword, keychainPath], { stdio: 'ignore' })
    execFileSync(
      'security',
      [
        'import',
        certBytes ? certPath : commandEnv.CSC_LINK,
        '-f',
        'pkcs12',
        '-k',
        keychainPath,
        '-P',
        commandEnv.CSC_KEY_PASSWORD,
        '-T',
        '/usr/bin/codesign',
        '-T',
        '/usr/bin/security'
      ],
      { stdio: 'ignore' }
    )
    const identities = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning', keychainPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const developerIdIdentity = identities
      .split('\n')
      .map((line) => line.match(/"([^"]*Developer ID Application:[^"]+)"/)?.[1])
      .find(Boolean)

    if (!developerIdIdentity) {
      console.error('CSC_LINK does not contain a Developer ID Application signing identity.')
      console.error('')
      console.error('Available identities in CSC_LINK:')
      console.error(identities.trim() || '(none)')
      console.error('')
      console.error('Export the Developer ID Application certificate and private key as .p12,')
      console.error('base64 that .p12, and update CSC_LINK. Apple Development certificates')
      console.error('can sign locally but cannot pass notarization for public distribution.')
      process.exit(1)
    }

    if (!commandEnv.CSC_NAME) {
      commandEnv.CSC_NAME = developerIdIdentity.replace(/^Developer ID Application:\s*/, '')
    }
    console.log(`Using signing identity: ${developerIdIdentity}`)
  } catch (error) {
    console.error('Failed to import CSC_LINK as a .p12 signing identity.')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

function run(command, commandArgs, commandEnv) {
  const result = spawnSync(command, commandArgs, {
    env: commandEnv,
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
