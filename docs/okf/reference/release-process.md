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
- `npx electron-vite build`
- `npx electron-builder --mac --publish never`

The macOS target builds `dmg` and `zip` artifacts for `arm64` and `x64`.

# Signing

Release CI signs the app with the Apple Developer ID Application certificate supplied
through GitHub Actions secrets:

- `CSC_LINK`: base64-encoded `.p12` export containing the Developer ID Application
  certificate and private key.
- `CSC_KEY_PASSWORD`: the `.p12` export password.

The `afterPack` hook still exists for unsigned local or CI builds, but it skips ad-hoc
signing whenever explicit certificate configuration (`CSC_LINK` or `CSC_NAME`) is
available. Release builds therefore keep the real Developer ID signature.

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
Do not also pass `mac.notarize.teamId` when using API-key credentials with the current
Electron Builder dependency chain; its `@electron/notarize` validator treats `teamId` as
password-credential mode and rejects mixed credential shapes.

After notarization, CI verifies the app signatures, Gatekeeper assessment, stapled tickets,
and DMG integrity before publishing assets.

# Publishing

For tag builds, the workflow uses the GitHub CLI to create the GitHub Release and attach
the generated `.dmg` and `.zip` files. Re-running the workflow clobbers existing assets for
the same tag.
