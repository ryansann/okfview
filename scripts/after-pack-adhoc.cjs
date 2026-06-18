// electron-builder afterPack hook.
//
// Ad-hoc code-signs the macOS .app so it runs on Apple Silicon without a paid
// Apple Developer ID. An unsigned arm64 app triggers macOS Gatekeeper's
// "okfview is damaged and can't be opened" because arm64 binaries require *some*
// valid signature to execute. Ad-hoc signing provides one (untrusted), turning
// that into the milder "unidentified developer" prompt that right-click > Open
// (or clearing quarantine) bypasses. It is not notarization; see SECURITY.md.
const { execFileSync } = require('node:child_process')
const { join } = require('node:path')

function hasExplicitSigningConfig() {
  return Boolean(process.env.CSC_LINK || process.env.CSC_NAME)
}

function hasLocalSigningIdentity() {
  try {
    const output = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return !/0 valid identities found/.test(output)
  } catch {
    return false
  }
}

function shouldAdhocSign() {
  if (hasExplicitSigningConfig()) return false
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') return true
  return !hasLocalSigningIdentity()
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (!shouldAdhocSign()) {
    // eslint-disable-next-line no-console
    console.log('[afterPack] skipping ad-hoc signing because a signing identity is available')
    return
  }

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  // eslint-disable-next-line no-console
  console.log(`[afterPack] ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
