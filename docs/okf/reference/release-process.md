---
type: Reference
title: Release Process
description: How okfview's macOS installers are built, versioned, signed, and attached to GitHub Releases.
resource: https://github.com/ryansann/okfview/blob/main/.github/workflows/release.yml
tags: [release, packaging, macos, signing]
timestamp: 2026-06-18T00:00:00Z
---

# Release Process

okfview publishes macOS `.dmg` and `.zip` artifacts from the `Release (macOS)` GitHub
Actions workflow.

# Trigger

Push a `v*` tag:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The tag is the source of truth for artifact versions. The workflow strips the leading `v`
and passes that value to electron-builder as `extraMetadata.version`, so release filenames
match the tag without requiring a committed `package.json` version bump.

# Build

The workflow runs:

- `npm ci`
- `npm run typecheck`
- `npm test`
- `npm run dist -- --publish never`

The macOS target builds `dmg` and `zip` artifacts for `arm64` and `x64`.

# Signing

Release CI signs the app with the Apple Developer ID Application certificate supplied
through GitHub Actions secrets:

- `CSC_LINK`: base64-encoded `.p12` export containing the Developer ID Application
  certificate and private key.
- `CSC_KEY_PASSWORD`: the `.p12` export password.

Before packaging, CI decodes `CSC_LINK` into a temporary keychain and verifies that it
contains a valid `Developer ID Application:` signing identity. The workflow then exports
that identity as `CSC_NAME`, which forces Electron Builder to use the Developer ID
certificate instead of another imported codesigning certificate.

If Apple notarization reports `The binary is not signed with a valid Developer ID
certificate`, the app was signed but the `.p12` is the wrong certificate class or does not
include the matching private key. In Apple Developer, create or download a `Developer ID
Application` certificate for the same team, install it locally, then export it from Keychain
Access under `login` > `My Certificates` as a `.p12` and update `CSC_LINK`.

The `afterPack` hook still exists for unsigned local or CI builds, but it skips ad-hoc
signing whenever explicit certificate configuration (`CSC_LINK` or `CSC_NAME`) is
available. Release builds therefore keep the real Developer ID signature.

macOS release signing is configured explicitly for Developer ID distribution with hardened
runtime enabled and Electron-compatible entitlements in `build/entitlements.mac.plist` and
`build/entitlements.mac.inherit.plist`.

# Notarization

Release CI notarizes in two passes:

1. Electron Builder notarizes and staples each signed `.app` bundle during packaging.
2. The workflow submits each generated `.dmg` to Apple with `xcrun notarytool`, waits for
   acceptance, and staples the DMG.

The workflow bounds notarization waits so Apple-side stalls fail predictably instead of
burning the default GitHub Actions job timeout: the build/app-signing phase has a
75-minute step timeout, the DMG notarization phase has a 60-minute step timeout, and each
DMG `notarytool submit --wait` call uses `--timeout 45m`.

The workflow uses these notarization secrets:

- `APPLE_API_KEY`: contents of the App Store Connect API key `.p8` file.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER_ID`: App Store Connect issuer ID.

`APPLE_API_KEY` is stored as secret content. During the workflow it is written to a
temporary `AuthKey_*.p8` file because Electron Builder and `notarytool` expect a file path.
For local release builds, `npm run dist` performs the same normalization: `APPLE_API_KEY`
may be either a path to `AuthKey_*.p8` or the raw `.p8` contents, and
`APPLE_API_ISSUER_ID` is mapped to Electron Builder's expected `APPLE_API_ISSUER`.
The wrapper refuses to run without notarization credentials unless `--no-notarize` is
passed explicitly, which prevents accidentally producing a Developer ID signed app that
Gatekeeper rejects as `Unnotarized Developer ID`.
Do not also pass `mac.notarize.teamId` when using API-key credentials with the current
Electron Builder dependency chain; its `@electron/notarize` validator treats `teamId` as
password-credential mode and rejects mixed credential shapes.

For local notarization troubleshooting, set `OKFVIEW_NOTARY_DEBUG=1` before `npm run dist`
to add `electron-notarize` debug output. CI keeps notarization logs at the default level.

After notarization, CI verifies the app signatures, Gatekeeper assessment, stapled tickets,
and DMG integrity before publishing assets.

# Publishing

For tag builds, the workflow uses the GitHub CLI to create the GitHub Release and attach
the generated `.dmg` and `.zip` files. Re-running the workflow clobbers existing assets for
the same tag.
