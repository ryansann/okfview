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

CI currently sets `CSC_IDENTITY_AUTO_DISCOVERY=false`, so electron-builder does not look
for a Developer ID certificate. The `afterPack` hook then applies an ad-hoc signature to
the `.app` bundle before packaging.

Ad-hoc signing gives Apple Silicon a valid executable signature and prevents macOS from
showing the misleading "damaged" launch failure. It does not provide Developer ID trust or
notarization, so first launch can still require right-clicking the app and choosing
**Open**.

For local maintainer builds, the hook skips ad-hoc signing when a signing identity or
explicit certificate configuration is available. That lets electron-builder produce a real
Developer ID signature instead of mixing ad-hoc and certificate signing.

# Publishing

For tag builds, the workflow uses the GitHub CLI to create the GitHub Release and attach
the generated `.dmg` and `.zip` files. Re-running the workflow clobbers existing assets for
the same tag.

# Future notarization

To ship fully trusted macOS downloads, add Apple Developer ID signing and notarization
secrets to the workflow, then remove `CSC_IDENTITY_AUTO_DISCOVERY=false`.
